# Development tools

None of this ships. It exists so the recogniser can be measured rather than
guessed at.

| File | What it does |
|---|---|
| `render-display.ts` | Draws a Microlife BP B1 Classic display at given values |
| `augment.ts` | Turns a clean render into a realistic photo (perspective, glare, blur, noise, JPEG) |
| `presets.ts` | Named capture conditions, from `clean` to `unreadable` |
| `ocr-bench.ts` | Accuracy across every synthetic preset |
| `ocr-real.ts` | Accuracy against the real photographs listed in `fixtures/expected.json` — the number that decides whether a change was an improvement |
| `ocr-folders.ts` | Accuracy against the `fixtures/<sys>-<dia>-<pul>/` folders, the hand-held photographs the device reader mostly refuses |
| `vlm-grade.py` | Grades the [assisted reader](../server/README.md#grading-it) against every fixture, loose and foldered; needs the server running |
| `fixture-photo.ts` | Loads a real photo the way the phone would, shared by the benchmark and the tests |
| `crop.ts` | Magnifies a region of an image or a debug mask, for looking at what went wrong |
| `ocr-debug.ts` | One display, with annotated PNGs of every stage written to `tools/out/` |
| `ocr-debug-helpers.ts` | PNG writing and box overlays for `ocr-real.ts --write-debug` |
| `diag.ts` | Prints the band/column/candidate structure for one image |
| `make-sample.ts` | Writes sample monitor photos as JPEGs, for testing on a device |
| `seed-demo.ts` | Generates a backup file of realistic history, to exercise the charts |
| `report-preview.ts` | Renders the doctor's report to HTML so its layout can be looked at in a browser |

```bash
npm run ocr:bench
npm run ocr:bench -- --preset dim --verbose --seeds 3
npm run ocr:real
npm run ocr:real -- --verbose         # per-preprocessing-chain detail
npm run ocr:real -- --write-debug     # annotated masks into tools/out/real/
npm run ocr:folders
npm run ocr:debug -- --sys 148 --dia 93 --pul 101 --preset hard
npx tsx tools/crop.ts tools/fixtures/IMG_x.jpg 0.4 0.3 0.4 0.3 2   # x y w h zoom
npx tsx tools/make-sample.ts          # sample photos into tools/out/
npx tsx tools/seed-demo.ts > demo.json
npx tsx tools/report-preview.ts       # tools/out/report.html
```

## Looking at the doctor's report

On the device the report goes straight into a PDF and then into a share sheet,
which makes "does it actually look right" surprisingly hard to answer.
`buildReportHtml` is free of React Native and Expo imports precisely so that
`report-preview.ts` can run it here and write the same markup to a file. Both
bugs found that way — a page with no background, which a dark-mode WebView
rendered as dark text on dark, and a context column printing storage keys like
`beforeMedication` into a German report — were invisible from the app itself.

## Adding a real photo

Put the file in `fixtures/`, add an entry to `fixtures/expected.json` with the
values a human reads off the display, and run `npm run ocr:real`. The vitest
suite picks it up from the same manifest, so a new photo becomes a regression
test for free.

For several photos of one reading, make a folder named `sys-dia-pul` under
`fixtures/` instead and drop them in; the name is the ground truth, and
`npm run ocr:folders`, `vlm-grade.py` and the tests find it without a manifest
entry. Anything the name cannot say goes in a `folder.json` beside the photos —
see [server/README.md](../server/README.md#adding-fixtures).

## Reading the benchmarks

The column that matters in all of them is the wrong acceptances — `FALSE+` in
`ocr:bench`, **wrongly accepted** in `ocr:real`, `WRONG` in `ocr:folders`:
readings the app would have saved that are wrong. It is expected to stay at
zero. A change that lifts the read rate while putting a number in that column is
a regression, not an improvement.

`ocr:real` reads every photo through several resize-and-re-encode chains rather
than one, because the exact chain a phone uses cannot be reproduced offline and
these photographs are marginal enough that a grey level or two changes the
answer. A result that only holds for one chain is not a result.

Both `ocr:debug` and `ocr:real --write-debug` write masks with detected bands in
red and probed glyph cells in blue. Looking at those images is how nearly every
recogniser bug in this project was found — far faster than reasoning about why a
number came out wrong. `crop.ts` magnifies a region of either a photo or a mask
when the detail is too small to see.
