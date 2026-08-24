"""
Tries to break the reader the way a stranger with the token would.

    python server/attack_test.py

Everything here is an *authenticated* attack, which is the case that matters:
without the token every request gets the same 401 and nothing below is
reachable. The question this answers is what someone who has the token — or a
phone of yours that has been taken — can do beyond asking for a reading.

Each case prints what the server did. A pass means it refused politely and
stayed up; the last check confirms it is still serving real photographs
afterwards, because a hardening change that breaks the actual feature is not a
fix.
"""

from __future__ import annotations

import io
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = os.environ.get("HH_OCR_URL", "http://127.0.0.1:6000/read")
PHOTO = os.path.join(ROOT, "tools", "fixtures", "106-88-104", "IMG_20260824_185304.jpg")


def token() -> str:
    from_env = os.environ.get("HH_OCR_TOKEN", "").strip()
    if from_env:
        return from_env
    with open(os.path.join(ROOT, "server", "token.txt"), encoding="utf-8") as handle:
        return handle.read().strip()


TOKEN = token()


def post(body: bytes, content_type: str = "image/jpeg", auth: bool = True, timeout: float = 300.0):
    headers = {"Content-Type": content_type, "Content-Length": str(len(body))}
    if auth:
        headers["Authorization"] = "Bearer " + TOKEN
    request = urllib.request.Request(URL, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()
    except Exception as error:
        # A refusal the client never gets to read is still a refusal. The
        # oversize case lands here: the server answers and closes while we are
        # still uploading, so the write fails before the reply arrives.
        return "closed", repr(error).encode()


def png_bomb(width: int, height: int) -> bytes:
    """A few dozen bytes of PNG that claim an enormous canvas."""
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    chunk = b"IHDR" + ihdr
    return (
        b"\x89PNG\r\n\x1a\n"
        + struct.pack(">I", len(ihdr))
        + chunk
        + struct.pack(">I", zlib.crc32(chunk) & 0xFFFFFFFF)
    )


def eps_payload() -> bytes:
    """
    An EPS file. Pillow rasterises these by shelling out to Ghostscript.

    Ghostscript is not installed here, so this is inert today. It is also the
    single upload that could turn into code execution the moment somebody
    installs it for an unrelated reason, which is exactly why the decoder
    allowlist exists rather than being left to luck.
    """
    return (
        b"%!PS-Adobe-3.0 EPSF-3.0\n"
        b"%%BoundingBox: 0 0 100 100\n"
        b"/Times-Roman findfont 12 scalefont setfont\n"
        b"0 0 moveto (x) show\n"
        b"showpage\n"
    )


def report(name: str, status, body: bytes, expect_refused: bool = True) -> bool:
    text = body.decode("utf-8", "replace").strip()
    if status == "closed":
        print("  %-34s %-4s %-9s %s" % (name, "--", "REFUSED", "connection closed mid-upload"))
        return expect_refused
    refused = status >= 400
    verdict = "REFUSED" if refused else "accepted"
    ok = refused if expect_refused else not refused
    print("  %-34s %s %-9s %s" % (name, status, verdict, text[:70]))
    return ok


def exif_is_stripped() -> bool:
    """
    A phone photograph carries GPS coordinates and a camera model. Re-encoding
    through Pillow without an `exif=` argument drops all of it, so the bytes the
    vision model is shown are pixels and nothing else.

    That is a consequence of how `encode` is written rather than a step someone
    remembered to add, which is exactly why it is worth a test: someone adding
    `exif=image.getexif()` to fix an orientation bug would silently start
    forwarding the location the photo was taken.
    """
    sys.path.insert(0, os.path.join(ROOT, "server"))
    import base64 as b64mod
    from fractions import Fraction

    from PIL import Image

    import ocr_server

    image = Image.open(PHOTO).convert("RGB")
    exif = image.getexif()
    exif[272] = "Phone X"
    gps = exif.get_ifd(34853)
    gps[1] = "N"
    gps[2] = (Fraction(47), Fraction(22), Fraction(0))
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", exif=exif, quality=90)

    sent = Image.open(io.BytesIO(b64mod.b64decode(ocr_server.encode(ocr_server.decode(buffer.getvalue())))))
    stripped = len(sent.getexif()) == 0 and not sent.getexif().get_ifd(34853)
    print("  %-34s %-4s %-9s %s" % (
        "GPS and camera model", "--", "STRIPPED" if stripped else "LEAKED",
        "the model is shown pixels only"))
    return stripped


def main() -> int:
    with open(PHOTO, "rb") as handle:
        real = handle.read()

    print("\n  Authenticated attacks (a stranger without the token gets 401 for all of these)\n")
    results = []

    results.append(report("random bytes", *post(os.urandom(4096))))
    results.append(report("empty body", *post(b"")))
    results.append(report("windows executable", *post(b"MZ\x90\x00" + os.urandom(2048))))
    results.append(report("zip archive", *post(b"PK\x03\x04" + os.urandom(2048))))
    results.append(report("shell script", *post(b"#!/bin/sh\nrm -rf /\n")))
    results.append(report("html with script tag", *post(b"<html><script>alert(1)</script>")))
    results.append(report("EPS (the ghostscript path)", *post(eps_payload())))
    results.append(report("GIF (decoder now excluded)", *post(b"GIF89a" + os.urandom(512))))
    results.append(report("TIFF (decoder now excluded)", *post(b"II\x2a\x00" + os.urandom(512))))
    results.append(report("PNG bomb 50000x50000", *post(png_bomb(50000, 50000))))
    results.append(report("PNG bomb 65535x65535", *post(png_bomb(65535, 65535))))
    results.append(report("truncated JPEG", *post(real[:512])))
    results.append(report("JPEG header + garbage", *post(real[:64] + os.urandom(8192))))
    results.append(report("oversized body (26 MB)", *post(b"\xff\xd8\xff" + b"\x00" * (26 * 1024 * 1024))))
    results.append(report("path traversal as filename",
                          *post(b'--X\r\nContent-Disposition: form-data; name="photo"; '
                                b'filename="../../../../etc/passwd"\r\n\r\nnot-an-image\r\n--X--\r\n',
                                "multipart/form-data; boundary=X")))
    results.append(report("no token at all", *post(real, auth=False)))

    global TOKEN
    good, TOKEN = TOKEN, "wrong-token-entirely"
    results.append(report("wrong token", *post(real)))
    TOKEN = good

    print("\n  Privacy: what actually reaches the model\n")
    results.append(exif_is_stripped())

    print("\n  And it still works afterwards:\n")
    started = time.time()
    status, body = post(real)
    reading = body.decode("utf-8", "replace")[:60]
    still_good = False
    if status == 200:
        try:
            parsed = json.loads(body.decode())
            reading = "%s/%s/%s" % (
                parsed.get("systolic"), parsed.get("diastolic"), parsed.get("pulse"))
            still_good = reading == "106/88/104"
        except Exception:
            pass
    print("  %-34s %s %-9s %s  [%.1fs]" % (
        "a real photograph", status, "accepted" if status == 200 else "REFUSED",
        reading, time.time() - started))

    passed = sum(1 for r in results if r)
    print("\n  %d of %d attacks refused; real photo still read: %s\n" % (
        passed, len(results), "yes" if still_good else "NO"))
    return 0 if passed == len(results) and still_good else 1


if __name__ == "__main__":
    sys.exit(main())
