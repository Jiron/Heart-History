# Reading a seven-segment display

How Heart History turns a photo of a blood-pressure monitor into three numbers,
why it is built this way, and how well it actually works.

Everything described here lives in [`src/ocr/`](../src/ocr) and is plain
TypeScript over typed arrays — no native modules, no network, no model weights.
The same source runs on the phone under Hermes and in Node under `npm test`,
which is the property that makes any of it testable.

## Why not an off-the-shelf OCR library?

General text recognisers are trained on printed and handwritten *letterforms*.
A seven-segment glyph is not a letterform: it is seven disconnected bars with
visible gaps at every junction, and a `1` is two floating strokes with nothing
between them. General OCR reads these poorly and, worse, reads them poorly in
ways that look confident.

The alternative is to exploit what makes the problem easy. The display is a rigid
grid of known geometry. Once you know where a digit's cell is, you do not need to
recognise a shape at all — you only need to ask seven yes/no questions: *is this
segment lit?* That is a far more reliable question than "which of 10 shapes is
this", and it degrades gracefully: a marginal answer is measurable, so the
recogniser can tell when it is unsure.

So the hard part is not reading the digits. It is **finding the cells**.

## The pipeline

```
photo ─► grayscale ─► downscale ─► adaptive threshold ─► connected components
      ─► bands (rows) ─► value-block selection ─► glyph cells ─► segment probes
      ─► digits ─► plausibility checks ─► result
```

### 1. Ink, not brightness

The image is thresholded with Bradley–Roth adaptive thresholding: a pixel is
"ink" when it is darker than the average of its neighbourhood. That handles the
uneven lighting of a hand-held photo, where one side of the panel can be twice as
bright as the other.

Adaptive thresholding alone is not enough, though. In a *uniformly* dark region —
a monitor sitting on a dark table — the local average is dark too, so sensor
noise flickers across the threshold and the mask fills with speckle. An extra
**absolute contrast floor** fixes it: the pixel must also sit a minimum number of
gray levels below its neighbourhood. Noise cannot clear that bar; the display's
~70-level digit-against-background gap clears it easily.

### 2. The threshold window is the whole ball game

The neighbourhood size trades two failure modes against each other:

- **Too large** and the step edge at the LCD bezel grows a thick ink *halo*
  (roughly 0.28 × the window). Anything the halo touches gets absorbed into one
  giant blob. In practice that is the small date row hugging the top of the
  panel, which simply vanishes.
- **Too small** and the window fits *inside* a thick stroke, so the middle of
  each segment measures as "same as its surroundings" and drops out.

There is no single value that is right for every photo, so the window is sized
from the measured stroke width, and the recogniser runs **several passes** at
different multiples and keeps whichever produced the most coherent reading. One
pass uses a heavier denoise for grainy photos. A complete, self-consistent,
high-confidence result short-circuits the rest, so the common case still costs
one pass.

### 3. Rows, and the digit that breaks them

Components are grouped into horizontal bands by overlapping vertical extent. This
works because a seven-segment glyph's strokes tile its full height with no gap —
`a` on top, `b`/`f` upper, `g` across the middle, `c`/`e` lower, `d` at the
bottom — so a row of digits collapses into one continuous interval while the
blank space between display rows keeps neighbouring rows apart.

Except for `1`, which lights only `b` and `c` and has *nothing* on its centre
line. And `7`, which is `a`+`b` above and `c` below. A row reading `71` therefore
splits cleanly into an upper half and a lower half, and every downstream test
then fails — shifting all three values up a row and reporting the pulse as the
diastolic.

Two mechanisms handle this. Components in the same vertical channel separated by
a fraction of a stroke are bridged directly. And because the gap inside a glyph
can be the same size as the gap between two tightly-spaced rows, every **adjacent
pair of bands is also offered as a merged candidate**, letting the block selector
below decide which reading of the geometry is coherent. Provenance is tracked so
a merged pair and one of its own halves can never both be chosen.

### 4. Finding the three value rows

The device gives three strong structural guarantees, and requiring all of them
together is what rejects the printed bezel labels, the wordmark and the button
outlines:

1. the rows are **stacked** with a small vertical gap,
2. they use glyphs of **comparable height**, and
3. they are **right-aligned to a common edge**, because short values are padded
   with blanks on the left rather than leading zeros.

Every subset of candidate rows is scored against these, not just consecutive
ones — the icon strip puts symbols at heights that fall *between* the value rows,
and requiring adjacency meant a single cuff-fit tick could split the trio and
silently drop the pulse.

### 5. Right-anchored cells

Each glyph cell is anchored to its **right** edge, never its left or centre.

Every digit 0–9 lights `b` or `c`, so a column's right edge always coincides with
the true cell's right edge. The left edge does not: a `1` shows only the two
right-hand strokes, and `3` and `7` have nothing on the left at all. A
left-anchored or centred cell slides the probe windows off the strokes and
misreads the glyph.

Cell *width* comes from the aspect measured across the whole block rather than
from the row's own ink, for the same reason — a row of `111` occupies about a
quarter of its cells, and sizing from that shrinks the grid to a fraction of the
truth.

Positional reasoning also solves a problem shape tests cannot: the traffic-light
classification bar down the left edge of the LCD is narrow, solid and
full-height, which is *exactly* what a `1` looks like. What separates them is that
digits form a tightly pitched run ending at the shared right edge, and the
indicator bar sits far outside it.

### 6. Probing the segments

Seven windows are sampled per cell, each covering the *core* of a segment and
stopping short of the junctions so a lit neighbour bleeding round a corner cannot
register on an unlit segment. Coverage is the fraction of ink in each window.

Before thresholding, coverage is normalised by the row's own statistics: a
soft-focus photo lights every segment weakly, and without this the whole row
reads as blank.

The resulting seven-bit pattern is looked up. Patterns the display cannot produce
trigger a single-segment correction (flip the least certain bit and re-check),
which recovers the common case of one segment sitting right on the threshold —
and marks the digit as corrected, which costs it confidence.

### 7. Refusing to guess

This is the part that matters most for a health app. A log that silently records
122/79 as 70/40 is worse than one that asks for another photo, because a misread
is rarely obvious to the person reviewing it.

`ok: true` requires **all** of:

- **All three rows visible.** Rows are labelled by position, so with only two
  there is no way to distinguish "systolic and diastolic" from "systolic and
  pulse" — a clipped photo reads 154/70 exactly as confidently as the real
  154/92. This single rule removed the last false positive from the benchmark.
- **Self-consistent numbers.** Systolic above diastolic, both in range, and a
  plausible gap between them.
- **No corrected glyphs.** A snapped pattern means the cell grid was slightly
  off, which tends to be wrong in ways segment probes cannot see.
- **Separated populations.** Confidence is the gap between the weakest lit
  segment and the strongest unlit one — not distance from a threshold, which
  *saturates*. A misaligned cell can have every probe land decisively on ink or
  decisively on background and still be reading the wrong digit; asking whether
  the two populations are distinguishable at all catches that.

When it refuses, the review screen is still pre-filled with the best guess.
`ok: false` means "please check this", not "start again".

## Measured accuracy

`npm run ocr:bench` renders the display synthetically at known values, applies
photographic degradation, and checks what comes back. 336 images per run.

| Condition | Exact | Sys+Dia | Accepted | Wrongly accepted |
|---|---|---|---|---|
| Clean | 100% | 100% | 100% | 0 |
| Typical hand-held | 100% | 100% | 100% | 0 |
| Steep angle | 100% | 100% | 100% | 0 |
| Dim and grainy | 100% | 100% | 100% | 0 |
| Glare and blur | 100% | 100% | 100% | 0 |
| Severe | 81% | 96% | 81% | 0 |
| **Unreadable** | — | — | **0%** | **0 of 48** |

Roughly 45 ms per image in Node; on device the decode dominates and a scan takes
well under a second.

The `unreadable` row is a deliberate negative fixture — a photo a person could
not read either. Refusing all 48 is as much a pass as reading the others.

### Why synthetic fixtures

Ground truth. Measuring accuracy needs to know the right answer for every image,
which means either labelling hundreds of photos by hand or generating them.
[`tools/render-display.ts`](../tools/render-display.ts) reproduces the structural
traps rather than the exact pixels: right-aligned glyphs, an icon strip that can
bridge rows, printed labels outside the panel, rows of two and three digits
mixed. [`tools/augment.ts`](../tools/augment.ts) then applies perspective warp,
lighting gradients, glare, blur, sensor noise and JPEG artefacts, all seeded so a
failure reproduces exactly.

This is a genuine limitation and worth stating plainly: **it validates the
algorithm against the failure modes it was designed for, not against the full
variety of real photographs.** The synthetic set cannot contain a surprise the
renderer does not know how to produce.

To check it against real photographs, drop them into `tools/fixtures/` and run
`npm run ocr:debug -- --image path/to/photo.jpg`, which writes annotated PNGs of
the ink mask, the detected bands and the probed cells to `tools/out/`. Those
overlays are how every bug described above was found.

## Adapting to another monitor

The recogniser assumes a seven-segment display with right-aligned values, which
covers most home monitors, and nothing about the Microlife's specific layout is
hard-coded — no pixel coordinates, no fixed panel position. Values are found by
structure, so a different device with the same conventions should work as-is.

The tunable parts, all in [`types.ts`](../src/ocr/types.ts) and
[`sevenSegment.ts`](../src/ocr/sevenSegment.ts):

- `SEGMENT_WINDOWS` — where each segment is probed within a cell
- `GLYPH_ASPECT` — fallback cell width/height
- `DEFAULT_OCR_OPTIONS` — threshold sensitivity and the on/off band
- `PASS_VARIANTS` in `pipeline.ts` — the window sizes tried
