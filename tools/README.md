# Development tools

None of this ships. It exists so the recogniser can be measured rather than
guessed at.

| File | What it does |
|---|---|
| `render-display.ts` | Draws a Microlife BP B1 Classic display at given values |
| `augment.ts` | Turns a clean render into a realistic photo (perspective, glare, blur, noise, JPEG) |
| `presets.ts` | Named capture conditions, from `clean` to `unreadable` |
| `ocr-bench.ts` | Accuracy across every synthetic preset |
| `ocr-real.ts` | Accuracy against the real photographs in `fixtures/` — the number that decides whether a change was an improvement |
| `fixture-photo.ts` | Loads a real photo the way the phone would, shared by the benchmark and the tests |
| `crop.ts` | Magnifies a region of an image or a debug mask, for looking at what went wrong |
| `ocr-debug.ts` | One display, with annotated PNGs of every stage written to `tools/out/` |
| `diag.ts` | Prints the band/column/candidate structure for one image |
| `make-sample.ts` | Writes sample monitor photos as JPEGs, for testing on a device |
| `seed-demo.ts` | Generates a backup file of realistic history, to exercise the charts |

```bash
npm run ocr:bench
npm run ocr:bench -- --preset dim --verbose --seeds 3
npm run ocr:real
npm run ocr:real -- --verbose         # per-preprocessing-chain detail
npm run ocr:real -- --write-debug     # annotated masks into tools/out/real/
npm run ocr:debug -- --sys 148 --dia 93 --pul 101 --preset hard
npx tsx tools/crop.ts fixtures/IMG_x.jpg 0.4 0.3 0.4 0.3 2   # x y w h zoom
npx tsx tools/make-sample.ts          # sample photos into tools/out/
npx tsx tools/seed-demo.ts > demo.json
```

## Adding a real photo

Put the file in `fixtures/`, add an entry to `fixtures/expected.json` with the
values a human reads off the display, and run `npm run ocr:real`. The vitest
suite picks it up from the same manifest, so a new photo becomes a regression
test for free.

## Reading the benchmarks

The column that matters in both is **wrongly accepted**: readings the app would
have saved that are wrong. It is expected to stay at zero. A change that lifts
the read rate while putting a number in that column is a regression, not an
improvement.

`ocr:real` reads every photo through several resize-and-re-encode chains rather
than one, because the exact chain a phone uses cannot be reproduced offline and
these photographs are marginal enough that a grey level or two changes the
answer. A result that only holds for one chain is not a result.

Both `ocr:debug` and `ocr:real --write-debug` write masks with detected bands in
red and probed glyph cells in blue. Looking at those images is how nearly every
recogniser bug in this project was found — far faster than reasoning about why a
number came out wrong. `crop.ts` magnifies a region of either a photo or a mask
when the detail is too small to see.
