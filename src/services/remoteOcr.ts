import { File } from 'expo-file-system';
import { PermissionsAndroid, Platform } from 'react-native';

import type { OcrResult, OcrWarning } from '@/ocr/types';

/**
 * Assisted reading: hands the photo to a vision model running on your own
 * machine and gets the three numbers back.
 *
 * ## Why this exists
 *
 * The on-device recogniser in `src/ocr/` reads a seven-segment display by
 * finding ink, grouping it into rows, and probing seven fixed windows per digit.
 * That works when the panel is square-on and fills the frame. Measured against
 * 23 photographs taken the way people actually take them — monitor small in
 * frame, held at an angle, lit by a phone torch — it read one. The failure is
 * structural, not a tuning problem: nothing in that pipeline locates the display
 * or corrects perspective, so a panel occupying a tenth of the frame at 20
 * degrees never reaches the part that reads digits.
 *
 * A vision model does not care about any of that. The trade is that it does not
 * run on the phone, which is why this is optional and off by default.
 *
 * ## What it costs
 *
 * The app is built to have no network access at all — see app.config.ts, where
 * INTERNET is stripped from every non-development build. Turning this on means
 * running a build that has that permission, so the guarantee changes from
 * "cannot reach a network" to "reaches exactly the address you typed". The photo
 * goes to your server and the server keeps nothing; but that is a promise about
 * software you run, not something Android enforces. Anyone who prefers the
 * stronger guarantee should leave this off and keep the on-device reader.
 */

/** Shape returned by server/ocr_server.py. */
interface RemoteReading {
  ok: boolean;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  /**
   * Whether the monitor's irregular-heartbeat symbol was lit.
   *
   * Null rather than false when the display could not be read: "we could not
   * tell" and "the symbol was not showing" are different answers, and only the
   * second one belongs in a medical history.
   */
  irregularHeartbeat: boolean | null;
  reason: string | null;
  warnings: string[];
  elapsedMs: number;
}

export class RemoteOcrError extends Error {}

/**
 * Generous, because giving up early is the more expensive mistake.
 *
 * Four renderings take about eleven seconds on an RTX 3060 and rather longer on
 * an integrated GPU, and the first request after the model loads is slower
 * again. Since the read no longer blocks a screen -- it is a background job with
 * "type it in" and "retake" both available throughout -- a long ceiling costs
 * the user nothing, while a short one turns a slow answer into a wrong-looking
 * failure and a pointless fallback to the weaker reader.
 */
const TIMEOUT_MS = 120_000;

/**
 * Android 16 put local network access behind its own runtime permission.
 *
 * Before that, `INTERNET` covered everything. From 16 onwards, reaching an
 * address on the same LAN needs `ACCESS_LOCAL_NETWORK` as well, granted by the
 * user at runtime — and a request without it fails as though the host were
 * simply unreachable, which is a miserable thing to debug.
 *
 * ## Only for addresses that actually are local
 *
 * The `url` argument is the whole point. A hostname reached through a tunnel
 * needs `INTERNET` and nothing else, and asking for this one anyway was worse
 * than useless in two ways. Android renders it as *"find, connect to, and
 * determine the relative position of nearby devices"* — which is an alarming
 * thing to read when you typed a domain name — and the prompt arrived **in the
 * middle of a scan**, where it blocked the upload behind a dialog nobody was
 * expecting. Observed doing exactly that.
 *
 * So the question is asked only when the answer could matter: a bare IPv4
 * address, `localhost`, or a `.local` name.
 *
 * Not declared as a constant in React Native's enum, so the string is used
 * directly; on an older Android the request resolves harmlessly.
 */
const LOCAL_NETWORK = 'android.permission.ACCESS_LOCAL_NETWORK' as never;

export async function ensureLocalNetworkAccess(url: string): Promise<void> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 36) return;

  let host: string;
  try {
    host = normaliseBase(url).replace(/^https?:\/\//i, '');
  } catch {
    return;
  }
  if (!looksLocal(host)) return;

  try {
    if (await PermissionsAndroid.check(LOCAL_NETWORK)) return;
    await PermissionsAndroid.request(LOCAL_NETWORK);
  } catch {
    // Older platforms reject an unknown permission string. Nothing to do: on
    // those, INTERNET alone is sufficient and the request was never needed.
  }
}

/**
 * Whether this build is allowed to open a socket at all.
 *
 * This is a guard against a crash, not a nicety. `app.config.ts` strips
 * INTERNET from every profile except `development` and `assisted-apk`, and a
 * `fetch` in a build without it does not fail politely: OkHttp raises a
 * SecurityException on its own dispatcher thread, which is not an IOException,
 * so React Native's networking module does not catch it and the process dies.
 * There is no JavaScript `catch` that can save you after the call is made —
 * the only fix is not to make it.
 *
 * INTERNET is an install-time permission, so `check` answers whether it is in
 * the manifest. Checked once and remembered: it cannot change while the app is
 * running.
 */
let networkAllowed: boolean | null = null;

export async function hasNetworkPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (networkAllowed !== null) return networkAllowed;
  try {
    networkAllowed = await PermissionsAndroid.check(
      'android.permission.INTERNET' as never,
    );
  } catch {
    // If the check itself is unavailable, assume yes rather than disabling a
    // working feature — the crash it guards against only happens on a build
    // that deliberately removed the permission.
    networkAllowed = true;
  }
  return networkAllowed;
}

/** A bare IPv4 address, `localhost`, or an mDNS `.local` name — i.e. this network. */
function looksLocal(host: string): boolean {
  const bare = host.split(':')[0].toLowerCase();
  return (
    bare === 'localhost' ||
    bare.endsWith('.local') ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(bare)
  );
}

/**
 * Turns what the user typed into a URL, guessing the scheme when they omit it.
 *
 * The guess matters. `192.168.1.20:6000` has to be plain HTTP — there is no
 * certificate for a private address and never will be. A hostname like
 * `heart.example.dev` is the opposite: it is reachable from anywhere, so
 * sending a bearer token and a photograph of a medical reading over HTTP would
 * hand both to anyone on the path. Defaulting a named host to HTTPS means the
 * safe case is what you get for typing the obvious thing.
 *
 * An explicit scheme always wins, so `http://my-host` remains possible for
 * anyone who genuinely wants it.
 */
function normaliseBase(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) throw new RemoteOcrError('empty URL');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${looksLocal(trimmed) ? 'http' : 'https'}://${trimmed}`;
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Uploads the photo as raw JPEG bytes.
 *
 * ## Not multipart, and not base64 JSON
 *
 * Both were tried against the real deployment, and each failed at a different
 * layer:
 *
 *   {"image": "<440 KB of base64>"}   403 from Cloudflare. A large base64 blob
 *                                     in a JSON field matches their managed
 *                                     rules for an attack payload.
 *
 *   FormData with { uri, name, type }  "Unsupported FormDataPart implementation".
 *                                     Expo SDK 54+ replaces the global `fetch`
 *                                     with its WinterCG implementation, and that
 *                                     one accepts only a string, a Blob, or an
 *                                     object with `bytes()`. React Native's own
 *                                     object-with-a-uri form part -- the shape
 *                                     every RN upload tutorial uses -- is not
 *                                     one of them. See
 *                                     expo/src/winter/fetch/convertFormData.ts.
 *
 * Raw bytes sidestep both. Cloudflare treats `image/jpeg` as what it is (200,
 * measured), Expo's fetch takes a `Uint8Array` body directly, and the server has
 * accepted raw bodies all along -- it is what `curl --data-binary` sends. It is
 * also the smallest of the three: no base64 inflation, no multipart framing.
 *
 * The file is read through expo-file-system rather than carried as a JavaScript
 * string, so a half-megabyte photo never becomes a half-megabyte of UTF-16.
 */
async function postPhoto(
  url: string,
  fileUri: string,
  token: string | null,
  timeoutMs: number,
): Promise<Response> {
  const bytes = new Uint8Array(await new File(fileUri).arrayBuffer());

  // RN's fetch has no timeout of its own; without this a server that accepts the
  // connection and then stalls leaves the review screen spinning forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', ...authHeaders(token) },
      body: bytes,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What a connection test found.
 *
 * Three outcomes rather than a boolean, because "wrong token" and "nothing
 * answered" need completely different things done about them, and the server
 * deliberately will not tell them apart for anyone who is not holding the
 * token. Since we might be, we can.
 */
export type ServerCheck = 'ok' | 'unauthorised' | 'unreachable' | 'noPermission';

export async function checkServer(url: string, token: string | null): Promise<ServerCheck> {
  if (!(await hasNetworkPermission())) return 'noPermission';
  await ensureLocalNetworkAccess(url);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${normaliseBase(url)}/health`, {
        headers: authHeaders(token),
        signal: controller.signal,
      });
      if (response.status === 401) return 'unauthorised';
      if (!response.ok) return 'unreachable';
      const body = (await response.json()) as { ok?: boolean };
      return body.ok === true ? 'ok' : 'unreachable';
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return 'unreachable';
  }
}

function warningsFrom(reading: RemoteReading): OcrWarning[] {
  const out: OcrWarning[] = [];
  for (const code of reading.warnings) {
    if (code === 'allSegmentsLit') out.push({ code: 'selfTest' });
    else if (code === 'implausiblePair') out.push({ code: 'systolicNotAbove' });
  }
  if (!reading.ok && reading.reason === 'illegible' && out.length === 0) {
    out.push({ code: 'noDigitsRead' });
  }
  if (reading.ok && reading.pulse === null) out.push({ code: 'pulseUnreadable' });
  return out;
}

/**
 * Sends a base64 JPEG and returns a result in the same shape the on-device
 * recogniser produces, so the review screen cannot tell which one read it.
 *
 * Confidence is reported as a flat 0.9 for values that came back and 0 for those
 * that did not. That is honest about what the server provides: the model emits a
 * value or a null, and the plausibility checks that decide between them are
 * pass/fail. Inventing a gradient here would put a number on the screen that
 * nothing measured.
 */
export async function readRemotely(
  fileUri: string,
  serverUrl: string,
  token: string | null,
): Promise<OcrResult> {
  const started = Date.now();
  // Refuse rather than crash on a build that has no INTERNET permission. See
  // hasNetworkPermission -- there is no catch that helps once the call is made.
  if (!(await hasNetworkPermission())) throw new RemoteOcrError('noNetworkPermission');
  await ensureLocalNetworkAccess(serverUrl);
  let response: Response;
  try {
    response = await postPhoto(
      `${normaliseBase(serverUrl)}/read`,
      fileUri,
      token,
      TIMEOUT_MS,
    );
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new RemoteOcrError(aborted ? 'timeout' : 'unreachable');
  }

  if (response.status === 401) {
    // Named, because it is the one failure the user can fix in ten seconds and
    // the one they will otherwise misread as the server being down.
    throw new RemoteOcrError('unauthorised');
  }

  if (!response.ok) {
    let detail = String(response.status);
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // A non-JSON error body is not worth a second failure mode.
    }
    throw new RemoteOcrError(detail);
  }

  const reading = (await response.json()) as RemoteReading;
  const graded = (value: number | null) => (value === null ? 0 : 0.9);

  return {
    ok: reading.ok,
    systolic: reading.systolic,
    diastolic: reading.diastolic,
    pulse: reading.pulse,
    confidence: {
      overall: reading.ok ? 0.9 : 0,
      systolic: graded(reading.systolic),
      diastolic: graded(reading.diastolic),
      pulse: graded(reading.pulse),
    },
    // The model is told to ignore the clock in the corner rather than report it,
    // so there is nothing to offer the review screen here. `measuredAt` stays
    // the capture time, which is what the app orders by anyway.
    detectedDate: null,
    detectedTime: null,
    icons: {
      average: null,
      memory: null,
      // The one symbol the server is asked about. The rest are not in its
      // schema, so null here means "never looked", not "not showing".
      irregularHeartbeat: reading.irregularHeartbeat ?? null,
      cuffFitOk: null,
      batteryLow: null,
      trafficLight: null,
    },
    rows: [],
    panel: null,
    scale: 1,
    warnings: warningsFrom(reading),
    elapsedMs: reading.elapsedMs || Date.now() - started,
  };
}
