# Assisted reading: what was tried, and what it cost

A record of how the photo-to-numbers problem was actually attacked, including
the parts that did not work. Setup instructions live in
[`server/README.md`](../server/README.md); this page is the reasoning.

---

## The problem, stated honestly

Twenty-three photographs of a Microlife BP B1, taken the way a person takes
them — monitor small in frame, held at an angle, sometimes lit by a phone
torch, sometimes slightly out of focus. Two known readings, `106/88/104` and
`107/78/98`. (The third folder, `167-105-50`, came later; see
*The 37-photo run*.)

The on-device recogniser, given every one of them through four preprocessing
chains:

```
runs 92   accepted 4   correct 4   WRONG 0
```

**One photograph out of twenty-three.** All four accepts came from the same
image. This matches what happens on the phone, which is the point of measuring
it this way.

Two things are worth separating out of that number. The recogniser never
produced a *wrong* reading, which is the failure that actually matters and the
one it was designed around. And it is not badly tuned — it scores 100% on the
synthetic benchmark from clean through brutal, and reads the three original
fixtures. It is solving a different problem from the one the photographs pose.

---

## Why it is structural, not a tuning problem

`src/ocr/` works like this: threshold the image adaptively, label connected
components of ink, group them into horizontal bands, pick the three that look
like value rows, cut each into right-anchored digit cells, and probe seven fixed
windows per cell.

Every step after the first assumes **the panel is most of the picture and
roughly square-on**. When the monitor occupies a tenth of the frame at twenty
degrees:

- Adaptive thresholding picks a window size from the image, not the panel. At a
  tenth of the frame the window spans several digits, so the local mean sits
  inside the glyphs and the strokes stop separating from the background.
- Row banding assumes rows are horizontal. At twenty degrees the bottom of `106`
  overlaps the top of `88` in y, and they merge into one band.
- Digit cells are axis-aligned rectangles. Under perspective the cell drifts off
  the glyph across the row, so the rightmost digit is probed in the wrong place.

The multi-pass ladder — ten combinations of threshold window, pre-blur,
sensitivity and line-severing — varies parameters *downstream* of a step that
has already failed. That is why more passes never helped: there is no setting of
a probe window that recovers a row which was never located.

Fixing it properly means panel detection and perspective correction: find the
LCD quadrilateral, warp it to a rectangle, then run the existing reader on the
result. That is a real and well-understood approach and it is **not attempted
here** — it is a substantial piece of computer vision to write from scratch in
TypeScript with no OpenCV, and the fallback below reads these photographs today.
If the assisted reader is ever unacceptable, this is the direction to go, and
the existing segment reader is worth keeping as the second half of it.

---

## What was tried before this

Recorded so nobody repeats them. Details and measurements are in
[`ocr.md`](./ocr.md).

| Attempt | Outcome |
|---|---|
| Widening the multi-pass ladder | No change on the 23 photos. Downstream of the failure. |
| Deskew by estimating glyph shear | **Harmful.** Measured 0.000 shear on all four original photos — the font is not italic, which was an assumption made from looking rather than measuring. Cost a third of the runtime and lost accuracy. Deleted; the note survives in `layout.ts`. |
| Global contrast normalisation | No change on synthetic, slightly worse on real. Deleted. |
| Severing the panel border (`removeThinLines`) | **Kept.** Real fix for a real bug — the border thresholded as ink and bridged into digits. |
| Per-row merging across passes (`mergeBestRows`) | **Kept.** Different rows genuinely resolve best under different parameters. |
| Stroke width from detected glyph height | **Kept.** Fixed a feedback loop where a bad stroke estimate produced a bad glyph estimate. |

The last three are why the synthetic scores are what they are. None of them
moved the 23-photo number, because none of them addresses localisation.

---

## The vision model

A vision-language model does not need the panel found for it. Given the same
photographs with nothing but a downscale:

**Reference run** — Qwen3-VL-27B (the model that happened to be loaded), one
reading per photo, no consensus:

| | |
|---|---|
| Exactly right | 19 of 23 |
| Blood pressure wrong | **3** |
| Pulse wrong | 1 |

Nineteen of twenty-three, against one of twenty-three. But the three wrong
readings are the problem, and they were all the same mistake.

### The failure that mattered

Three photographs of `106/88/104` came back as `106/80/104`. All three have a
hard shadow edge falling across the DIA row, washing out the middle bar of the
second `8`. On a seven-segment display `8` and `0` differ by exactly that bar.

The model was not hedging. It returned `80`, confidently, with no signal that
anything was uncertain — which is the one failure mode this app cannot absorb.
A refusal costs a manual entry. A confident wrong number lands in a medical
history where nothing later questions it.

### The fix: make it disagree with itself

Each photo is read **four times**, from four renderings — plain, autocontrast,
unsharp-masked, and histogram-equalised — and a value is accepted only if the
readings agree. Not a majority: **any** disagreement refuses.

The reasoning is specific rather than general. A segment that is genuinely lit
reads the same under all four. A bar that only looked absent because of where a
shadow boundary fell does not, because the renderings move that boundary
differently. Disagreement is therefore a direct measurement of exactly the
ambiguity that produced `88` → `80`, and it is available without knowing which
reading is right.

That last part is why it is not a vote. On the worst of the three shadow photos
the renderings split 2–1 *for the wrong answer*: plain and autocontrast both said
`80`, sharp said `88`. A majority would have confidently returned `80`. Refusing
on disagreement returns nothing, which is correct.

`consensus()` in [`server/ocr_server.py`](../server/ocr_server.py).

### Measured, with 8B on an RTX 3060

Qwen3-VL-8B-Instruct Q4_K_M, four renderings, all 27 fixtures there were at the
time:

| | Device reader | 27B, one look | 8B, four renderings |
|---|---|---|---|
| Produced a reading | 1 of 23 | 23 of 23 | 23 of 27 |
| Fully correct | 1 | 19 | 24 |
| **Blood pressure wrong** | 0 | **3** | **0** |
| Pulse wrong | 0 | 1 | **0** |
| Time per photo | under 1 s | ~30 s | ~11 s |

The 8B with consensus beats the far larger model on the only column that must
never move, and it is three times faster. Every refusal is a specific rule
firing:

| Photo | What happened |
|---|---|
| `185311` | Renderings split on DIA, `80` vs `88`. Refused. |
| `185306` | Renderings split on SYS, `126` vs `106`. Refused. |
| `171545` | Renderings split on DIA. Refused. |
| `185308` | Heavy glare over the PUL row; pulse dropped, blood pressure read and correct. |
| self test | All segments lit, reported and refused. |

`185308` is the one that shaped the fourth rendering. With three, all of them
read that washed-out pulse row as `74` and the server returned it — the display
said `104`. Histogram equalisation reads it as `88`. Neither is right and the row
is not recoverable, but the two now disagree, and disagreement is what turns a
confident wrong number into a dropped field.

### The 37-photo run

After the `167-105-50` folder was added (ten photographs, irregular-heartbeat
symbol lit in all of them):

```
photos graded          37
produced a reading     33  (89%)
fully correct          34  (92%)
blood pressure WRONG    0      <- must stay 0
pulse wrong             0
irregular found         9 of 9
irregular FALSE ALARM   0      <- must stay 0
mean time           14796 ms
```

The four refusals are the three splits above plus `182627`, a shot with a dark
reflection across the whole panel where the renderings split on DIA. Adding the
symbol to the prompt did not cost anything on the numbers: the two older folders
read exactly as before.

---

## The irregular-heartbeat symbol

The monitor lights a small rounded square containing an ECG trace, on the left of
the panel level with the SYS row, when it detected an irregular beat during the
measurement. It is perhaps forty pixels across in a 3072-pixel-wide photo, a
dozen after the downscale to 1280, and low contrast — dark grey on the
grey-green LCD.

### The model misses it; it does not invent it

Measured over the ten photographs where it is lit and the twenty-seven where it
is not:

| | Found (of 10) | False alarms (of 27) |
|---|---|---|
| One rendering, first prompt attempt | 5 | 0 |
| One rendering, the prompt now in use | 8 | 0 |
| Any of the four renderings | 8 | 0 |
| Any of the four, plus the zoomed pass | 9* | 0 |
| Centre crop at 70%, alone | 7 | 0 |
| Centre crop at 55%, alone | 8 | 0 |

\* the tenth is `182627`, which is refused outright — the numbers are not
readable either.

Roughly 200 readings of photographs without the symbol, across every rendering,
two resolutions and four crops, produced **zero** false positives. That is the
finding the whole design rests on: the error is one-directional.

### So the rule is the opposite of the one the numbers use

A **value** has to be named by a majority and contradicted by nobody, because a
confident wrong number lands in a medical history unopposed. The **symbol** is
taken from a single sighting, because requiring agreement would discard the only
thing the extra renderings contribute, and because a wrongly-set flag arrives as
a pre-ticked switch beside the photograph it came from and costs one tap.

The review screen says so rather than quietly ticking it: a cardiac finding the
app set on the user's behalf, off a symbol a few pixels wide, is announced above
the photo and above the switch.

### The zoomed pass

A fifth look at the middle 70% of the frame, magnified back to 1280. It exists
because of one photograph, `182614`, where the monitor sits small in the frame:
missed by all four full-frame renderings *and* by a 1792-pixel version of the
same image, and caught by every crop tried.

Its numbers are thrown away. A centre crop can slice a digit, and a `6` with its
left edge gone is a `5` — precisely the failure the consensus exists to prevent.
It answers one question. Cost: about three seconds on top of eleven.

`--passes` below four skips it, so the flag measures the model on its own.

---

## Access control

Every endpoint requires `Authorization: Bearer <token>`. A missing token, a
wrong token and an unknown path all return the same `401 {"error":
"unauthorised"}`, so probing tells you nothing about what is running.

Three decisions worth keeping:

- **Generated, never defaulted.** 256 bits from the OS entropy source, written
  to `server/token.txt` on first run and gitignored. A server with a well-known
  default password is worse than one with none, because it looks protected.
- **Compared with `hmac.compare_digest`.** A plain `==` returns at the first
  differing byte, and that timing is measurable over a network — enough to
  recover a secret one byte at a time.
- **The body is drained before rejecting a POST.** Otherwise the client is still
  uploading megabytes when the socket closes and sees a connection reset instead
  of the 401 that explains the problem.

This became necessary when the deployment changed. On a LAN, the network was the
boundary. Behind a Cloudflare tunnel there is no network boundary left, and the
token is the only thing between a stranger and unmetered use of the GPU.

The app treats a 401 as its own outcome rather than folding it into "server
down", because they need opposite responses: one is a setting to correct, the
other is something to wait out.

### The scheme is guessed, deliberately

`192.168.1.20:6000` gets `http://` — a private address has no certificate and
never will. A named host like `heart.example.dev` gets `https://`, because it
resolves from anywhere and must not carry a bearer token and a photograph of a
medical reading in the clear. An explicit scheme always wins.

## Nothing is stored server-side

Worth stating as a property rather than an intention, because it is checkable:

- The photo is decoded into memory, read, and dropped when the request ends.
  There is no database, no upload directory, no cache.
- The **only** file the server ever writes is its own `token.txt`.
- Even the console line omits the values — `read 960x1280 accepted in 11336ms`.
  A log is one `> server.log` away from being a file, and measurements do not
  belong in one. The numbers go to the phone that asked and nowhere else.
- `--debug-dir` is the single exception. It keeps frames, it is off unless
  asked for, and the app never sets it.

History, photos and backups live on the phone. `exportBackup` writes profiles
and readings only, so the token is not in a backup either — a backup file shared
with someone never carries a credential for a machine at home.

## Refusal rules

The wrapper enforces these regardless of what the model says, because a language
model asked for numbers will produce numbers:

- Values outside plausible ranges are dropped (`SYS 60-260`, `DIA 30-200`,
  `PUL 30-220`).
- A diastolic at or above its systolic voids **both**. One of the two was
  misread and there is no way to tell which.
- Any rendering reporting all segments lit refuses the whole photo — that is the
  power-on self test, not a measurement.
- Systolic and diastolic are all-or-nothing. Pulse may be dropped on its own,
  because a missing pulse is worth much more than a wrong one.

---

## What it costs

Not free, and the trade is real:

- **It is not on the phone.** It needs a machine you run, with two processes on
  it. Whenever the app cannot reach it — away from home without a tunnel, or with
  the machine off — the app falls back to the device reader.
- **It needs network permission.** The default builds have `INTERNET` stripped
  from the manifest, and Android enforces that. Assisted reading requires the
  separate `assisted-apk` profile (or a development build), so the
  guarantee changes from "cannot reach a network" to "reaches the address you
  typed". That is a downgrade, and it is why this is opt-in and why it is a
  different binary rather than a setting.
- **It is slower.** About eleven seconds for a full four-rendering read on an
  RTX 3060, or sixteen on the Radeon 8060S iGPU, against a fraction of a second
  on device. This is why the camera no longer waits — see `state/scanBuffer.ts`.
  Which GPU is a resource question rather than a quality one — zero wrong on
  both, and the one-photo difference in accept rate is backend noise on a
  borderline image, not a reason to choose. Neither costs system RAM on the
  author's machine: 5.55 GB of the iGPU's dedicated 64 GB carve, or 7.4 GB of
  the 3060, against a ~1 GB working set either way. `server/README.md` has the comparison
  and how to measure it.

---

## Things not worth trying again

- **Prompting harder on its own.** The prompt does now name the middle-bar
  confusion explicitly, and that is worth keeping, but it did not by itself stop
  a confident misread. Consensus did.
- **Temperature above zero.** Sampling makes the same photo give different
  answers between runs, which makes a reading impossible to trust and a bug
  impossible to reproduce. Greedy, `top_k 1`, always.
- **Trusting `display_legible`.** The model reports it and it correlates weakly
  with being right. It is not used as a gate; the plausibility rules and the
  consensus check are.
- **Bigger images.** The vision tower resamples to its own grid. Above 1280 on
  the long side, nothing changes except decode time.
- **Trusting private bytes or `--list-devices` free space as memory figures.**
  The first is WDDM charging video allocations to process commit; the second is
  the carve plus a system-memory aperture, ignoring what is already committed.
  The dedicated-usage performance counter is the one that answers the question.
- **Raising the resolution to find the symbol.** 1792 on the long side found it
  in 5 of 10, *worse* than 1280's 8 of 10. More pixels is not more legible: the
  vision tower resamples, and the extra detail arrives as noise. Cropping is
  what works, because it changes what fraction of the tile the symbol occupies.
- **Majority voting on the symbol.** Requiring two of four renderings to agree
  drops it from 8 of 10 to 6 of 10 and prevents nothing — there were no false
  positives to prevent.
- **Reporting `irregularHeartbeat: false` on a refusal.** "We could not read the
  display" and "the symbol was not showing" are different answers, and only the
  second belongs in a history. The field is null when the reading is refused.
- **Re-asking `--list-devices` to name the card in a status line.** Device
  numbering is not stable *between enumerations either*: the model started on
  `Vulkan0 (NVIDIA GeForce RTX 3060)` and a `--list-devices` minutes later
  called `Vulkan0` the Radeon. `ocr.ps1 status` reads the name back from what
  `start-vlm.ps1` recorded at launch, which is the only account made at the
  moment the choice was made.
- **Reporting the busiest adapter's VRAM.** With the iGPU carve in use by
  something else it read 37 GB while the model held 7. The per-process
  counter — `\GPU Process Memory(pid_N*)\Dedicated Usage` — answers the
  question actually being asked.
- **Setting `HH_VLM_GPU` inline from a shell that is already PowerShell.**
  `powershell -Command "$env:HH_VLM_GPU='nvidia'; ./server/ocr.ps1 restart"`
  expands the variable in the *outer* shell, to nothing, and hands the inner one
  `='nvidia'` — a syntax error, after which the restart proceeds on the default
  card and looks like it worked. Use `./server/ocr.ps1 restart -Gpu nvidia`.
- **Hardcoding a GPU index.** llama.cpp's device numbering is not stable —
  `--list-devices` reported `Vulkan0` as the RTX 3060 one hour and as the Radeon
  the next, same build, same hardware. `start-vlm.ps1` resolves the id by
  matching the adapter name at launch and prints what it chose. A benchmark that
  silently ran on the wrong card would look like a regression in the model.

---

## Where to go next

In rough order of value:

1. **More photographs.** Each folder shows one reading, which cannot catch
   a digit-specific bias — `8` vs `0` was found only because it happened to be
   in the data. A folder per reading, named `sys-dia-pul`, is picked up by
   `tools/vlm-grade.py` and the test suite automatically.
2. **Panel detection and perspective correction on the device**, feeding the
   existing segment reader. This is the only path to good offline reading.
3. **A smaller model.** 8B was chosen to sit under 8 GB of VRAM. A 4B may well
   read digits this large just as reliably, at a third of the latency.
