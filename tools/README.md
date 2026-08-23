# Development tools

None of this ships. It exists so the recogniser can be measured rather than
guessed at.

| File | What it does |
|---|---|
| `render-display.ts` | Draws a Microlife BP B1 Classic display at given values |
| `augment.ts` | Turns a clean render into a realistic photo (perspective, glare, blur, noise, JPEG) |
| `presets.ts` | Named capture conditions, from `clean` to `unreadable` |
| `ocr-bench.ts` | Accuracy across every preset — the number that decides whether a change was an improvement |
| `ocr-debug.ts` | One display, with annotated PNGs of every stage written to `tools/out/` |
| `diag.ts` | Prints the band/column/candidate structure for one image |
| `make-sample.ts` | Writes sample monitor photos as JPEGs, for testing on a device |
| `seed-demo.ts` | Generates a backup file of realistic history, to exercise the charts |

```bash
npm run ocr:bench
npm run ocr:bench -- --preset dim --verbose --seeds 3
npm run ocr:debug -- --sys 148 --dia 93 --pul 101 --preset hard
npx tsx tools/make-sample.ts          # sample photos into tools/out/
npx tsx tools/seed-demo.ts > demo.json
```

## Reading the benchmark

The column that matters is **FALSE+**: readings the app would have accepted that
are wrong. It is expected to stay at zero. A change that lifts the read rate
while putting a number in that column is a regression, not an improvement.

`ocr:debug` writes `mask.png` with detected bands in red and probed glyph cells
in blue. Looking at that image is how nearly every recogniser bug in this project
was found — it is far faster than reasoning about why a number came out wrong.
