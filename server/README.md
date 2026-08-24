# Assisted reading

An optional pair of local services that read a blood-pressure display far more
reliably than the phone can on its own. Everything here runs on your machine;
nothing is hosted, and no photo leaves your network.

The app works without it. See "What this costs you" before turning it on.

---

## Why it exists

`src/ocr/` reads a seven-segment display by thresholding the image, grouping ink
into rows, and probing seven fixed windows per digit. That works when the panel
is square-on and fills the frame — it scores 100% on the synthetic benchmark and
reads the original three photographs.

Measured against 23 photographs taken the way people actually take them — the
monitor small in frame, held at an angle, lit by a phone torch, sometimes
slightly out of focus — it read **one**:

```
runs 92   accepted 4   correct 4   WRONG 0
```

Four accepts, all four from the same photograph. That is not a tuning problem.
Nothing in that pipeline locates the display or corrects perspective, so a panel
occupying a tenth of the frame at twenty degrees never reaches the code that
reads digits. Every knob in the multi-pass ladder is downstream of a step that
has already failed.

A vision model does not need any of that. It was given the same 23 photographs
and read them without preprocessing beyond a downscale.

---

## What you need

* **llama.cpp** with a Vulkan or CUDA backend.
  This repo was set up against the build in `D:\AiApiStuff\runtime\llamacpp`.
* **A vision model.** Qwen3-VL-8B-Instruct, about 6.2 GB in total:

```bash
curl -L -o D:/AiApiStuff/models/Qwen3VL-8B-Instruct-Q4_K_M.gguf "https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/main/Qwen3VL-8B-Instruct-Q4_K_M.gguf"
```

```bash
curl -L -o D:/AiApiStuff/models/mmproj-Qwen3VL-8B-Instruct-F16.gguf "https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-8B-Instruct-F16.gguf"
```

* **Python 3.11+ with Pillow.** Nothing else — the wrapper is standard library
  apart from the image decode.

---

## Running it

Two processes. Start the model first; it takes a few seconds to load.

```bash
powershell -ExecutionPolicy Bypass -File server/start-vlm.ps1
```

```bash
python server/ocr_server.py
```

Then in the app: **Settings → Assisted reading**, enter the address and the
token, and press *Test connection*.

Print the token with:

```bash
python server/ocr_server.py --show-token
```

Check it by hand without the app:

```bash
curl -s -X POST --data-binary "@tools/fixtures/106-88-104/IMG_20260824_185304.jpg" -H "Content-Type: image/jpeg" -H "Authorization: Bearer $(python server/ocr_server.py --show-token)" http://127.0.0.1:6000/read
```

### Addresses

On the same network, use the machine's LAN address (`ipconfig`), not
`127.0.0.1` — the phone is a different machine. Through a tunnel, use the
hostname.

The app fills in the scheme when you leave it off, and the rule is deliberate: a
bare IPv4 address, `localhost` or a `.local` name gets `http://`, because a
private address has no certificate and never will. Anything else gets
`https://`, because a name that resolves from outside your house must not carry
a bearer token and a photograph of a medical reading in the clear. Type a scheme
explicitly if you want to override it.

---

## Access control

Every request must carry `Authorization: Bearer <token>`. A missing token, a
wrong token and an unknown path all get the same response:

```
401  {"error": "unauthorised"}
```

Identical on purpose. Someone probing the hostname cannot use the difference
between those cases to work out what is running or which routes exist.

The token is 256 bits from the OS entropy source, generated on first run into
`server/token.txt` and gitignored. It is compared with `hmac.compare_digest`
rather than `==`: a plain string comparison returns as soon as it finds a
differing byte, and that timing difference is measurable over a network — enough
to recover a secret one byte at a time. Set `HH_OCR_TOKEN` to override the file.

To rotate: delete `server/token.txt`, restart, and paste the new value into the
app.

### Behind a Cloudflare tunnel

The intended deployment. `cloudflared` connects outbound, so nothing is
port-forwarded and the machine stays off the public internet:

```bash
cloudflared tunnel --url http://localhost:6000
```

For a permanent hostname, create a named tunnel and point the ingress rule at
`http://localhost:6000`, then set the app's address to that hostname.

Two things worth being clear about. The token is now the *only* boundary — on a
LAN the network itself was one, and through a tunnel there is nothing left but
the secret, so treat it as a password. And Cloudflare terminates TLS, which
means the connection is encrypted from the phone to Cloudflare and from
Cloudflare to `cloudflared`, but Cloudflare is in the middle of it. If that is
not acceptable, keep it on the LAN. Putting Cloudflare Access in front of the
hostname adds a second gate, at the cost of the app not being able to
authenticate through it — the bearer token is what this server understands.

---

## Which GPU

Selected by name, not by index:

```bash
HH_VLM_GPU=igpu    powershell -ExecutionPolicy Bypass -File server/start-vlm.ps1
```

```bash
HH_VLM_GPU=nvidia  powershell -ExecutionPolicy Bypass -File server/start-vlm.ps1
```

`igpu` is the default. An exact id (`Vulkan1`) also works if you know it.

**Do not hardcode a device index.** llama.cpp's numbering is not stable — on this
machine `--list-devices` reported `Vulkan0` as the RTX 3060 one hour and as the
Radeon 8060S the next, with no change to the build or the hardware. That is why
`start-vlm.ps1` resolves the id by matching the adapter name at every launch,
and why it prints which one it picked.

Measured over the full fixture set, four renderings per photo:

| | Radeon 8060S (iGPU) | RTX 3060 |
|---|---|---|
| Per photo | ~16.6 s | ~11.0 s |
| Produced a reading | 24 of 27 | 23 of 27 |
| Fully correct | 25 of 27 | 24 of 27 |
| **Blood pressure wrong** | **0** | **0** |
| Dedicated VRAM | 5.55 GB of the 64 GB carve | ~7.4 GB of 12 GB |
| System RAM | ~0.95 GB working set | ~0.7 GB working set |

The iGPU is about 50% slower. It also accepted one photo the discrete card
refused, and **that is not evidence it is better** — it is one borderline image
out of 27. The two backends compile their shaders differently and reduce in a
different order, so logits differ in the last bits, and an image whose
renderings were already on the edge of disagreeing can fall either way. Read it
as noise, not as a reason to choose.

What is not noise is the column that matters: zero wrong on both.

So this is a resource decision, not a quality one. Since the read is a
background job the camera no longer waits on, five seconds rarely decides
anything. The iGPU leaves the 3060 completely free; the 3060 leaves system
memory alone.

## Memory

Three flags carry the "VRAM only, and RAM must not creep" requirement:

| Flag | Default | Why it is changed |
|---|---|---|
| `--load-mode dio` | `auto` (mmap) | mmap leaves the whole 5 GB weights file resident in the OS page cache. It is reclaimable, but it reads as the model having been loaded twice. DirectIO goes disk → VRAM and skips the cache. |
| `--cache-ram 0` | `8192` MiB | **This is the one that matters.** llama.cpp parks a slot's KV state in host RAM when it is evicted, up to 8 GB by default. That is what makes RAM climb request after request. We never reuse a prompt between photos, so the cache buys nothing. |
| `--n-gpu-layers 999` | varies | Anything left behind runs on the CPU, out of RAM. |

Measured, across roughly 150 requests: **working set 708 MB → 715 MB** on the
discrete card, and **949 MB** on the iGPU. Flat either way. You will also see a
private commit figure of about 8 GB; on Windows that is WDDM's mandatory
system-memory backing store for video allocations, not a second copy. Watch the
working set.

That first flag is worth seeing the effect of. The 27B text model on this same
machine, started without it, shows a **16 GB working set** — the whole weights
file resident in the page cache. Same runtime, same GPU, one flag apart.

### The iGPU does not eat system RAM here, and that is not automatic

On a machine where the iGPU takes memory dynamically, "VRAM" really is system
RAM. This one is configured differently: 128 GB unified with **64 GB carved off
in the BIOS as dedicated VRAM**, leaving 64 GB as system memory. The carve is
separate silicon budget, so a model in it costs the system nothing.

Measured, by stopping the server and diffing the counter:

```
iGPU dedicated with our model : 42.34 GB
iGPU dedicated without it     : 36.79 GB
our model                     :  5.55 GB
```

against a **949 MB** process working set. The weights are in the carve and not
duplicated into RAM — which is the entire point of `--load-mode dio` and is not
what you get by default. With mmap the GGUF lands in system RAM *and* is copied
into the carve: paid for twice out of the same silicon.

Read the split with:

```powershell
(Get-Counter "\GPU Adapter Memory(*)\Dedicated Usage").CounterSamples | Where-Object CookedValue -gt 0 | Select-Object InstanceName,@{n='GB';e={[math]::Round($_.CookedValue/1GB,2)}}
```

Two traps in the numbers, both of which cost an hour if you trust them:

- **Private commit is not RAM.** The server shows ~8 GB of private bytes, which
  WDDM charges to process commit for video allocations that occupy neither
  working set nor pagefile. Watch the working set and the counter above; ignore
  private bytes. Commit *headroom* is still worth checking before adding
  anything resident, because the first allocation past the limit is the one that
  fails.
- **`--list-devices` free space is not headroom.** It reports the iGPU at
  114 458 MiB, which is the 64 GiB carve plus a ~48 GiB system-memory aperture,
  and it ignores what other processes have already committed.

## What this costs you

The app is built so that released binaries have no `INTERNET` permission at all
— see the comment at the top of `app.config.ts`. That is not a promise in a
privacy policy, it is a thing Android enforces.

Assisted reading needs that permission. So it is a **separate build**:

```bash
npm run build:apk:assisted
```

`preview`, `production` and `production-apk` are unchanged and still come out
with no network access whatsoever. The trade, stated plainly:

* **Unchanged.** Readings, photos, history and backups stay on the phone. The
  server is sent one photo per scan, holds it in memory for the length of that
  request, and returns three numbers. It has no database and no upload
  directory; the only file it ever writes is its own `token.txt`. Even the
  console line omits the values — `read 960x1280 accepted in 11336ms` — because
  a log one redirect away from a file is not a place measurements belong.
  `--debug-dir` is the single exception, it keeps frames, and the app never
  sets it.
* **Changed.** The binary is now *capable* of network access. "The photo is only
  sent to the address you typed" is a property of this source code, not
  something the operating system is enforcing on your behalf.
* **Also changed.** Cleartext HTTP is enabled, because a server on your own
  network has no certificate a phone would trust.

If the stronger guarantee is what you want, leave the field empty and build
`production-apk`. The device reader is still there, and still refuses rather
than guesses.

---

## Grading it

```bash
python tools/vlm-grade.py
```

Runs every fixture through the running server and prints two numbers. **Read
them differently:** a refusal costs a manual entry, while a wrong reading puts a
number nobody measured into a medical history where nothing later questions it.
The script exits non-zero only on the second.

Current, on an RTX 3060:

```
photos graded          27
produced a reading     23  (85%)
fully correct          24  (89%)
blood pressure WRONG   0      <- must stay 0
pulse wrong            0
mean time              11155 ms
```

Each photo is read four ways and the answers must agree, so about eleven seconds
covers four inferences. `--passes 1` skips the agreement check, which is useful
for measuring the model alone and is not safe to run against.

---

## The API

| | |
|---|---|
| `GET /health` | `{"ok": true}` when the model is loaded. 503 otherwise. |
| `POST /read` | Body is either raw JPEG bytes with `Content-Type: image/jpeg`, or `{"image": "<base64>"}` as JSON. |

```json
{
  "ok": true,
  "systolic": 106,
  "diastolic": 88,
  "pulse": 104,
  "reason": null,
  "warnings": [],
  "elapsedMs": 1840,
  "source": "vlm"
}
```

`ok` is false whenever the app must not save the result unaided — an illegible
panel, or the power-on self test with every segment lit. `systolic` and
`diastolic` are either both present or both absent; `pulse` can be null on its
own, since a missing pulse is worth strictly less than a wrong one.
