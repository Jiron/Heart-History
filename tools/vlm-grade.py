"""
Grades the vision model against the real photographs in tools/fixtures.

    python tools/vlm-grade.py                    every fixture
    python tools/vlm-grade.py --folder 106-88-104
    python tools/vlm-grade.py --repeat 3         same photo several times

Needs both halves running: start-vlm.ps1, then ocr_server.py.

Folders are named sys-dia-pul and every photo inside shows that reading. The
loose files at the top level are the older fixtures and are described by
expected.json.

Two numbers matter, and they are not equally important:

  read      how many photos produced a reading at all. A refusal costs the user
            a manual entry, which is annoying.
  WRONG     how many produced a reading that was not what the display said. This
            puts a number the user never measured into their medical history,
            where nothing later will question it. It has to be zero.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURE_DIR = os.path.join(ROOT, "tools", "fixtures")
SERVER = os.environ.get("HH_OCR_URL", "http://127.0.0.1:6000/read")


def token() -> str:
    """The same token the server generated, read from where it wrote it."""
    from_env = os.environ.get("HH_OCR_TOKEN", "").strip()
    if from_env:
        return from_env
    path = os.path.join(ROOT, "server", "token.txt")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as handle:
            return handle.read().strip()
    return ""


TOKEN = token()


def read_photo(path: str, timeout: float = 300.0) -> dict:
    with open(path, "rb") as handle:
        body = handle.read()
    request = urllib.request.Request(
        SERVER,
        data=body,
        headers={
            "Content-Type": "image/jpeg",
            "Content-Length": str(len(body)),
            "Authorization": "Bearer " + TOKEN,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def show(value) -> str:
    return "--" if value is None else str(value)


def cases(only: str | None) -> list[tuple[str, str, dict]]:
    """(label, path, expectation) for everything we can grade."""
    out: list[tuple[str, str, dict]] = []

    manifest = os.path.join(FIXTURE_DIR, "expected.json")
    if os.path.exists(manifest) and not only:
        with open(manifest, encoding="utf-8") as handle:
            for photo in json.load(handle)["photos"]:
                path = os.path.join(FIXTURE_DIR, photo["file"])
                if os.path.exists(path):
                    out.append(("loose", path, photo))

    for entry in sorted(os.listdir(FIXTURE_DIR)):
        folder = os.path.join(FIXTURE_DIR, entry)
        if not os.path.isdir(folder) or not re.fullmatch(r"\d+-\d+-\d+", entry):
            continue
        if only and entry != only:
            continue
        systolic, diastolic, pulse = (int(part) for part in entry.split("-"))
        for name in sorted(os.listdir(folder)):
            if not re.search(r"\.(jpe?g|png)$", name, re.I):
                continue
            out.append(
                (
                    entry,
                    os.path.join(folder, name),
                    {"file": name, "sys": systolic, "dia": diastolic, "pul": pulse},
                )
            )
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--folder", default=None)
    parser.add_argument("--repeat", type=int, default=1)
    args = parser.parse_args()

    work = cases(args.folder)
    if not work:
        print("No fixtures found under %s" % FIXTURE_DIR)
        return 1

    total = 0
    got_reading = 0
    exact = 0
    wrong = 0
    pulse_wrong = 0
    elapsed_total = 0
    failures: list[str] = []
    group = None

    for label, path, expected in work:
        if label != group:
            group = label
            want = (
                "refuse"
                if expected.get("accept") is False
                else "%s/%s/%s" % (show(expected.get("sys")), show(expected.get("dia")), show(expected.get("pul")))
            )
            print("\n=== %s (expect %s) ===" % (label, want if label != "loose" else "per manifest"))

        for attempt in range(args.repeat):
            total += 1
            started = time.time()
            try:
                result = read_photo(path)
            except Exception as error:
                print("  %-30s ERROR %s" % (expected["file"][:30], error))
                failures.append("%s: transport %s" % (expected["file"], error))
                continue
            elapsed_total += int((time.time() - started) * 1000)

            should_refuse = expected.get("accept") is False
            got = "%s/%s/%s" % (show(result["systolic"]), show(result["diastolic"]), show(result["pulse"]))

            if not result["ok"]:
                verdict = "refused" if should_refuse else "REFUSED"
                if should_refuse:
                    exact += 1
                print("  %-30s %-14s %s (%s)" % (expected["file"][:30], got, verdict, result.get("reason")))
                continue

            got_reading += 1
            if should_refuse:
                wrong += 1
                failures.append("%s: accepted %s, should have refused the self test" % (expected["file"], got))
                print("  %-30s %-14s WRONGLY ACCEPTED" % (expected["file"][:30], got))
                continue

            bp_ok = result["systolic"] == expected["sys"] and result["diastolic"] == expected["dia"]
            pulse_ok = result["pulse"] is None or result["pulse"] == expected.get("pul")
            if bp_ok and pulse_ok:
                exact += 1
                print("  %-30s %-14s ok  %dms" % (expected["file"][:30], got, result["elapsedMs"]))
            else:
                if not bp_ok:
                    wrong += 1
                    failures.append("%s: read %s, display said %s/%s/%s" % (
                        expected["file"], got, expected["sys"], expected["dia"], expected.get("pul")))
                else:
                    pulse_wrong += 1
                    failures.append("%s: pulse %s, display said %s" % (
                        expected["file"], result["pulse"], expected.get("pul")))
                print("  %-30s %-14s %s" % (expected["file"][:30], got, "WRONG" if not bp_ok else "pulse wrong"))

    print("\n  %s" % ("-" * 60))
    print("  photos graded          %d" % total)
    print("  produced a reading     %d  (%.0f%%)" % (got_reading, 100.0 * got_reading / max(1, total)))
    print("  fully correct          %d  (%.0f%%)" % (exact, 100.0 * exact / max(1, total)))
    print("  blood pressure WRONG   %d      <- must stay 0" % wrong)
    print("  pulse wrong            %d" % pulse_wrong)
    if got_reading:
        print("  mean time              %d ms" % (elapsed_total / max(1, total)))

    if failures:
        print("\n  detail:")
        for line in failures:
            print("    - %s" % line)
    print("")
    return 1 if wrong else 0


if __name__ == "__main__":
    sys.exit(main())
