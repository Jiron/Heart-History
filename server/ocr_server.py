"""
Reads a blood-pressure display out of a photo, using a local vision model.

    python server/ocr_server.py

Listens on 0.0.0.0:6000 so a phone on the same network can reach it, and
forwards to llama-server on 127.0.0.1:6001 (started by start-vlm.ps1).

## Access

Every request must carry `Authorization: Bearer <token>`. Anything without it --
wrong token, missing header, unknown path -- gets the same 401, so an
unauthenticated caller cannot even confirm what this is. The token is generated
on first run into server/token.txt (gitignored); print it with:

    python server/ocr_server.py --show-token

This matters because the intended deployment puts the server behind a public
hostname via a Cloudflare tunnel. On a LAN the network was the boundary; through
a tunnel there is no network boundary left, and the token is the only thing
between a stranger and free use of your GPU.

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
import hmac
import io
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image, ImageFilter, ImageOps

VLM_URL = os.environ.get("HH_VLM_URL", "http://127.0.0.1:6001/v1/chat/completions")

TOKEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "token.txt")


def load_or_create_token() -> str:
    """
    The shared secret every request must present.

    Taken from HH_OCR_TOKEN if set, otherwise from server/token.txt, otherwise
    generated once and written there. Generating rather than defaulting is
    deliberate: a server with a well-known default password is worse than one
    with none, because it looks protected.

    `token_urlsafe(32)` is 256 bits from the OS entropy source. That is not
    guessable, so the only realistic way to lose it is to leak it -- which is
    why it is never logged, never echoed in an error, and why token.txt is
    gitignored.
    """
    from_env = os.environ.get("HH_OCR_TOKEN", "").strip()
    if from_env:
        return from_env

    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, encoding="utf-8") as handle:
            existing = handle.read().strip()
        if existing:
            return existing

    created = secrets.token_urlsafe(32)
    with open(TOKEN_FILE, "w", encoding="utf-8") as handle:
        handle.write(created + "\n")
    try:
        os.chmod(TOKEN_FILE, 0o600)
    except OSError:
        # Windows ignores POSIX modes. The file is in the user's own directory,
        # which is the protection that actually applies there.
        pass
    return created


TOKEN = load_or_create_token()

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


# Four renderings of the same photo, used to catch a segment the camera did not
# resolve. They are not attempts to improve the image -- the point is that a bar
# which is genuinely lit reads the same in all four, while one that only looked
# a certain way because of where a shadow or a highlight fell does not. See
# `consensus`.
#
# They are ordered cheapest-first and chosen to fail *differently*, which is the
# only property that matters here. Two renderings that distort an image the same
# way agree with each other and prove nothing:
#
#   plain      the photo as taken
#   contrast   endpoints stretched; moves a shadow boundary without touching
#              relative brightness within the panel
#   sharp      small-radius unsharp mask; recovers a thin bar lost to softness
#   equalize   histogram flattened, which redistributes tone completely. This is
#              the one that disagrees under heavy glare -- measured on
#              IMG_20260824_185308, where the first three all read the washed-out
#              pulse row as 74 and this one read 88. Neither is right; the
#              display said 104 and the row is not recoverable. Disagreeing is
#              the correct outcome, and without this rendering that photo
#              returned a confident wrong pulse.
RENDERINGS = (
    ("plain", lambda im: im),
    ("contrast", lambda im: ImageOps.autocontrast(im, cutoff=1)),
    ("sharp", lambda im: im.filter(ImageFilter.UnsharpMask(radius=2, percent=140, threshold=3))),
    ("equalize", lambda im: ImageOps.equalize(im)),
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

    def _authorised(self) -> bool:
        """
        Constant-time check of the bearer token.

        `compare_digest` rather than `==` because a plain comparison returns as
        soon as it finds a differing byte, and the time that takes is
        measurable over a network -- enough to recover a secret one byte at a
        time. Cheap to avoid, so avoid it.
        """
        header = self.headers.get("Authorization", "")
        presented = header[7:].strip() if header.startswith("Bearer ") else ""
        return hmac.compare_digest(presented, TOKEN)

    def _reject(self) -> None:
        """
        The single response to anything that is not authorised.

        Identical for a missing token, a wrong token and an unknown path, so a
        caller without the secret cannot use the difference to learn what this
        server is or which routes it has. Once past this, real 404s are fine --
        by then you already hold the token.
        """
        self._send(401, {"error": "unauthorised"})

    def do_GET(self) -> None:  # noqa: N802
        if not self._authorised():
            self._reject()
            return
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
        if not self._authorised():
            # Drain the body first. Without this the client is still writing a
            # multi-megabyte upload when the socket closes, and it sees a
            # connection reset rather than the 401 that explains the problem.
            pending = int(self.headers.get("Content-Length", "0") or 0)
            while pending > 0:
                pending -= len(self.rfile.read(min(pending, 65536)))
            self._reject()
            return

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
        result["renderings"] = [
            {
                "as": label,
                "sys": answer.get("systolic"),
                "dia": answer.get("diastolic"),
                "pul": answer.get("pulse"),
            }
            for (label, _), answer in zip(renderings, answers)
        ]
        self._send(200, result)

        # Deliberately without the values.
        #
        # This server is not a place readings are kept, and a console line is one
        # `> server.log` away from being exactly that. What is useful for
        # operating it -- did a request arrive, was it accepted, how long did it
        # take -- carries none of the measurement. The numbers go to the phone
        # that asked for them and nowhere else.
        #
        # --debug-dir already means "I am working on this and want frames kept",
        # so that is the one mode where the values are printed too.
        if self.debug_dir:
            sys.stderr.write(
                "read %dx%d -> %s/%s/%s ok=%s in %dms\n"
                % (
                    image.width,
                    image.height,
                    result["systolic"],
                    result["diastolic"],
                    result["pulse"],
                    result["ok"],
                    result["elapsedMs"],
                )
            )
        else:
            sys.stderr.write(
                "read %dx%d  %s  %s  in %dms\n"
                % (
                    image.width,
                    image.height,
                    "accepted" if result["ok"] else "refused",
                    "pulse dropped" if result["ok"] and result["pulse"] is None else "",
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
    parser.add_argument(
        "--show-token",
        action="store_true",
        help="Print the access token and exit, for copying into the app.",
    )
    args = parser.parse_args()

    if args.show_token:
        print(TOKEN)
        return

    Handler.debug_dir = args.debug_dir
    Handler.passes = args.passes
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print("OCR server on http://%s:%d  ->  %s" % (args.host, args.port, VLM_URL))
    print("%d rendering(s) per photo, agreement required" % args.passes)
    # Shown truncated. Enough to tell at a glance whether the app holds the same
    # one, without putting the secret into a terminal buffer or a screenshot.
    print("token %s… (full value: python server/ocr_server.py --show-token)" % TOKEN[:6])
    if args.debug_dir:
        print("WARNING: keeping frames in %s" % args.debug_dir)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
