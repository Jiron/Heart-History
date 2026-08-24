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

Then in the app: **Settings → Assisted reading**, enter `<your-ip>:6000`, and
press *Test connection*. Find the address with `ipconfig`; it needs to be the
LAN address, not `127.0.0.1`, because the phone is a different machine.

Check it by hand without the app:

```bash
curl -s -X POST --data-binary "@tools/fixtures/106-88-104/IMG_20260824_185304.jpg" -H "Content-Type: image/jpeg" http://127.0.0.1:6000/read
```

---

## Memory

The requirement was that the model live in VRAM and that RAM not creep upwards
with every request. Three flags in `start-vlm.ps1` carry that:

| Flag | Default | Why it is changed |
|---|---|---|
| `--load-mode dio` | `auto` (mmap) | mmap leaves the whole 5 GB weights file resident in the OS page cache. It is reclaimable, but it reads as the model having been loaded twice. DirectIO goes disk → VRAM and skips the cache. |
| `--cache-ram 0` | `8192` MiB | **This is the one that matters.** llama.cpp parks a slot's KV state in host RAM when it is evicted, up to 8 GB by default. That is what makes RAM climb request after request. We never reuse a prompt between photos, so the cache buys nothing. |
| `--n-gpu-layers 999` | varies | Anything left behind runs on the CPU, out of RAM. |

Expect roughly **7 GB of VRAM** (5.0 weights + 1.2 projector + KV) and a
resident set in the low hundreds of MB, flat across requests. llama.cpp still
needs a little RAM per request to hold the decoded image before uploading it;
that is transient and released.

If you would rather keep the 3060 free, `HH_VLM_DEVICE=Vulkan1` moves it to the
Radeon iGPU, which has far more (shared) memory and is slower.

> Check the device order before assuming: `llama-server.exe --list-devices`.
> On this machine `Vulkan0` is the RTX 3060 and `Vulkan1` the Radeon 8060S.

---

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

* **Unchanged.** Readings, photos and the database stay on the phone. The
  server is sent one photo per scan, holds it in memory, and returns three
  numbers. It writes nothing to disk unless you pass `--debug-dir`, which the
  app never does.
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
