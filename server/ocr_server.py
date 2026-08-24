"""
Reads a blood-pressure display out of a photo, using a local vision model.

    python server/ocr_server.py

Listens on 0.0.0.0:6000 so a phone on the same network can reach it, and
forwards to llama-server on 127.0.0.1:6001 (started by start-vlm.ps1).

## What this keeps

The photo exists as bytes in memory for the length of one request and is then
dropped. Nothing is written to disk: no upload directory, no cache, no log of
the image. The only thing that leaves this process is the three numbers. Run
with --debug-dir if you want frames kept while working on the prompt; it is off
unless you ask for it, and the app never sets it.

## Why a wrapper rather than talking to llama-server directly

Three reasons, all of which would otherwise end up baked into the APK:

  * The prompt and the JSON schema live here, so improving the reading does not
    mean shipping a new build.
  * Downscaling happens here. A 12-megapixel photo costs several seconds of
    vision-tower time for detail that does not survive the encoder anyway.
  * Refusal is enforced here. A language model asked for numbers will produce
    numbers; the plausibility checks below are what turn "always answers" into
    "answers or admits it cannot", which is the behaviour the app needs.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image, ImageFilter, ImageOps

VLM_URL = os.environ.get("HH_VLM_URL", "http://127.0.0.1:6001/v1/chat/completions")

# The vision tower resamples to its own grid, so pixels beyond this buy nothing
# and cost decode time.
MAX_DIM = 1280
JPEG_QUALITY = 90

# Ranges a real measurement falls in. A monitor that reads outside these is
# broken; a model that reports outside these has hallucinated.
SYS_RANGE = (60, 260)
DIA_RANGE = (30, 200)
PUL_RANGE = (30, 220)

PROMPT = """You are reading the LCD of a Microlife upper-arm blood pressure monitor from a photograph.

The display stacks three numbers vertically, each with its label printed to the RIGHT of the panel:
  - SYS (mmHg)  - the TOP number, shown in the largest digits
  - DIA (mmHg)  - the MIDDLE number, same size or slightly smaller
  - PUL (/min)  - the BOTTOM number, smallest digits

Rules you must follow:
1. The small number in the TOP-RIGHT corner of the panel is a clock or a date (for example 13:50 or 8-22). It is NEVER one of the three readings. Ignore it.
2. Read the seven-segment digits exactly as they are lit. Do not correct a value because it looks unusual.
3. If EVERY segment of every digit is lit (the display shows 888 in all three rows), this is the power-on self test, not a measurement. Set all_segments_lit to true and all three numbers to null.
4. Look carefully at the MIDDLE horizontal bar of each digit before deciding. On a seven-segment display 8 and 0 differ only by that bar, and so do 9 and 3, 6 and 5. Glare and shadow wash that bar out first.
5. If the display is cut off, too blurred, too dark or otherwise not legible, set the numbers you cannot read to null. Reporting null is correct and useful. Guessing is not.
6. Report only what is on the display.

Answer with JSON only."""

SCHEMA = {
    "type": "object",
    "properties": {
        "systolic": {"type": ["integer", "null"]},
        "diastolic": {"type": ["integer", "null"]},
        "pulse": {"type": ["integer", "null"]},
        "all_segments_lit": {"type": "boolean"},
        "display_legible": {"type": "boolean"},
    },
    "required": [
        "systolic",
        "diastolic",
        "pulse",
        "all_segments_lit",
        "display_legible",
    ],
    "additionalProperties": False,
}


def decode(raw: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(raw))
    # Phones record orientation in EXIF rather than rotating the pixels. Without
    # this a portrait photo arrives on its side and the rows stop being rows.
    image = ImageOps.exif_transpose(image)
    image = image.convert("RGB")

    longest = max(image.size)
    if longest > MAX_DIM:
        scale = MAX_DIM / longest
        image = image.resize(
            (round(image.width * scale), round(image.height * scale)),
            Image.LANCZOS,
        )
    return image


def encode(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=JPEG_QUALITY)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


# Three renderings of the same photo, used to catch a segment the camera did not
# resolve. They are not attempts to improve the image -- the point is that a bar
# which is genuinely lit survives all three, while one that only looked lit
# because of where a shadow fell does not. See `consensus`.
RENDERINGS = (
    ("plain", lambda im: im),
    ("contrast", lambda im: ImageOps.autocontrast(im, cutoff=1)),
    ("sharp", lambda im: im.filter(ImageFilter.UnsharpMask(radius=2, percent=140, threshold=3))),
)


def ask_model(b64: str, timeout: float = 180.0) -> dict:
    payload = {
        "model": "heart-history-vlm",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {"url": "data:image/jpeg;base64," + b64},
                    },
                ],
            }
        ],
        # Greedy, so the same photo gives the same answer every time. A reading
        # that changes between runs is impossible to debug and worse to trust.
        "temperature": 0.0,
        "top_k": 1,
        "max_tokens": 200,
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "reading", "strict": True, "schema": SCHEMA},
        },
    }
    request = urllib.request.Request(
        VLM_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = json.loads(response.read().decode("utf-8"))
    return json.loads(body["choices"][0]["message"]["content"])


def in_range(value, bounds) -> bool:
    return value is not None and bounds[0] <= value <= bounds[1]


def consensus(votes: list, minimum: int) -> tuple[int | None, bool]:
    """
    One value the readings agree on, or nothing.

    Returns (value, disagreed). `disagreed` is the important half: two readings
    that name *different* numbers is a stronger signal than either of them, and
    the caller must refuse rather than pick a winner.

    ## Why this is here

    The reference run over these photographs got 19 of 23 exactly right. Of the
    four misses, three were the same mistake: a diastolic of 88 read as 80, on
    three shots where a shadow edge fell across the DIA row and washed out the
    middle bar of the second digit. The model was not unsure. It returned 80,
    confidently, and a confident wrong number is the one failure this app cannot
    absorb -- it lands in a medical history where nothing later questions it.

    A washed-out bar is unstable under contrast and sharpening; a bar that is
    really lit is not. So the same photo is read three ways and the answers are
    required to match. It costs three inferences and turns that class of error
    from a wrong reading into a refusal, which the user can fix by retaking the
    photo or typing four characters.
    """
    seen = [value for value in votes if value is not None]
    if not seen:
        return None, False
    distinct = set(seen)
    if len(distinct) > 1:
        return None, True
    value = distinct.pop()
    return (value, False) if len(seen) >= minimum else (None, False)


def agree(answers: list[dict]) -> dict:
    """
    Folds several readings of the same photo into one, or into a refusal.

    A single reading passes through unchanged, so `--passes 1` measures the model
    on its own. With more, a value has to be named by a majority and contradicted
    by nobody.
    """
    if len(answers) == 1:
        return dict(answers[0])

    # One rendering seeing an all-lit display is enough to stop: the self test is
    # unmistakable when it is there, so a single sighting is far more likely to
    # be real than the others are to have missed it.
    if any(answer.get("all_segments_lit") for answer in answers):
        return {"all_segments_lit": True}

    majority = len(answers) // 2 + 1
    systolic, sys_split = consensus([a.get("systolic") for a in answers], majority)
    diastolic, dia_split = consensus([a.get("diastolic") for a in answers], majority)
    pulse, pulse_split = consensus([a.get("pulse") for a in answers], majority)

    warnings = []
    if sys_split or dia_split or pulse_split:
        warnings.append("readingsDisagreed")

    return {
        "systolic": systolic,
        "diastolic": diastolic,
        "pulse": pulse,
        "all_segments_lit": False,
        "warnings": warnings,
    }


def validate(raw: dict) -> dict:
    """
    Turns the model's answer into something the app is allowed to save.

    Everything here is a refusal rule. The model is good at reading the digits
    and bad at knowing when it has not, so implausible values are dropped rather
    than reported with low confidence -- the app has no way to act on "probably".
    """
    systolic = raw.get("systolic")
    diastolic = raw.get("diastolic")
    pulse = raw.get("pulse")
    warnings: list[str] = list(raw.get("warnings", []))

    if raw.get("all_segments_lit"):
        return {
            "ok": False,
            "systolic": None,
            "diastolic": None,
            "pulse": None,
            "reason": "selfTest",
            "warnings": ["allSegmentsLit"],
        }

    if not in_range(systolic, SYS_RANGE):
        systolic = None
    if not in_range(diastolic, DIA_RANGE):
        diastolic = None
    if not in_range(pulse, PUL_RANGE):
        pulse = None

    # A cuff cannot measure a diastolic above its systolic. If the pair is
    # inverted one of the two was misread, and there is no way to tell which.
    if systolic is not None and diastolic is not None and diastolic >= systolic:
        systolic = diastolic = None
        warnings.append("implausiblePair")

    ok = systolic is not None and diastolic is not None
    return {
        "ok": ok,
        "systolic": systolic,
        "diastolic": diastolic,
        "pulse": pulse,
        "reason": None if ok else "illegible",
        "warnings": warnings,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "HeartHistoryOCR/1.0"
    debug_dir = None
    passes = len(RENDERINGS)

    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            try:
                probe = VLM_URL.replace("/v1/chat/completions", "/health")
                with urllib.request.urlopen(probe, timeout=5) as response:
                    upstream = response.status == 200
            except Exception:
                upstream = False
            self._send(200 if upstream else 503, {"ok": upstream, "model": upstream})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/read":
            self._send(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 25 * 1024 * 1024:
            self._send(400, {"error": "expected an image body under 25 MB"})
            return

        raw = self.rfile.read(length)
        content_type = self.headers.get("Content-Type", "")
        if content_type.startswith("application/json"):
            try:
                raw = base64.b64decode(json.loads(raw.decode("utf-8"))["image"])
            except Exception:
                self._send(400, {"error": "expected a JSON body with an image field"})
                return

        started = time.time()
        try:
            image = decode(raw)
        except Exception as error:
            self._send(400, {"error": "could not decode the image: %s" % error})
            return

        renderings = RENDERINGS[: max(1, self.passes)]
        answers = []
        try:
            for label, render in renderings:
                b64 = encode(render(image))
                if self.debug_dir:
                    os.makedirs(self.debug_dir, exist_ok=True)
                    name = "%d-%s.jpg" % (int(started * 1000), label)
                    with open(os.path.join(self.debug_dir, name), "wb") as handle:
                        handle.write(base64.b64decode(b64))
                answers.append(ask_model(b64))
        except urllib.error.URLError as error:
            self._send(502, {"error": "vision model unreachable: %s" % error.reason})
            return
        except Exception as error:
            self._send(502, {"error": "vision model failed: %s" % error})
            return

        result = validate(agree(answers))
        result["elapsedMs"] = int((time.time() - started) * 1000)
        result["source"] = "vlm"
        self._send(200, result)

        sys.stderr.write(
            "read %dx%d -> %s/%s/%s ok=%s in %dms\n"
            % (
                width,
                height,
                result["systolic"],
                result["diastolic"],
                result["pulse"],
                result["ok"],
                result["elapsedMs"],
            )
        )

    def log_message(self, *args) -> None:
        # The default logs every request line to stderr; the summary above is
        # more useful and one line shorter.
        pass


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=6000)
    parser.add_argument(
        "--passes",
        type=int,
        default=len(RENDERINGS),
        help="How many renderings to read and require agreement between (1-%d)." % len(RENDERINGS),
    )
    parser.add_argument(
        "--debug-dir",
        default=None,
        help="Keep the downscaled frames here. Off by default; the app never sets it.",
    )
    args = parser.parse_args()

    Handler.debug_dir = args.debug_dir
    Handler.passes = args.passes
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print("OCR server on http://%s:%d  ->  %s" % (args.host, args.port, VLM_URL))
    print("%d rendering(s) per photo, agreement required" % args.passes)
    if args.debug_dir:
        print("WARNING: keeping frames in %s" % args.debug_dir)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
