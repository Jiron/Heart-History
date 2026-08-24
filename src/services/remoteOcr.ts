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
  reason: string | null;
  warnings: string[];
  elapsedMs: number;
}

export class RemoteOcrError extends Error {}

/** Long enough for a cold model to load, short enough not to hang the review screen. */
const TIMEOUT_MS = 45_000;

function normaliseBase(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) throw new RemoteOcrError('empty URL');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

async function postJson(url: string, body: unknown, timeoutMs: number): Promise<Response> {
  // RN's fetch has no timeout of its own; without this a server that accepts the
  // connection and then stalls leaves the review screen spinning forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** True when the server is up and its model is loaded. Used by the settings screen. */
export async function checkServer(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${normaliseBase(url)}/health`, {
        signal: controller.signal,
      });
      if (!response.ok) return false;
      const body = (await response.json()) as { ok?: boolean };
      return body.ok === true;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
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
export async function readRemotely(base64Jpeg: string, serverUrl: string): Promise<OcrResult> {
  const started = Date.now();
  let response: Response;
  try {
    response = await postJson(
      `${normaliseBase(serverUrl)}/read`,
      { image: base64Jpeg },
      TIMEOUT_MS,
    );
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new RemoteOcrError(aborted ? 'timeout' : 'unreachable');
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
      irregularHeartbeat: null,
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
