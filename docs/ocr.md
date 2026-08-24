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
different multiples, sensitivities and denoise levels. A complete,
self-consistent, high-confidence result short-circuits the rest, so the common
case still costs one pass.

#### Measuring the stroke width from the wrong thing

The window is sized from the stroke width, so getting that wrong makes every pass
wrong together. The first estimate is the median ink run over the whole photo -
and a photo of this device contains far more thin ink than thick: the moulded
`microlife` wordmark, the SYS/DIA/PUL bezel labels, the tiny date row. On a frame
where the panel fills only half the picture, the median lands nearer the *labels*
than the values. Measured against real photographs it came out at ~10 px against
a true segment thickness of ~20.

That failure is quiet and vicious. Every window is then sized for a stroke half
as thick as the one being read, so it fits *inside* each segment, and only the
segment's outline survives. The digit does not vanish - it becomes a different
digit, and `79` reads as `75`.

The way out is that the first pass does not need to read the digits correctly to
find *where* they are; banding survives a bad threshold. Once a glyph height is
known, segment thickness follows from the geometry of a seven-segment face
(about 0.16 x height), and the ladder is run again properly sized. Only one
refinement is allowed, and only if the first attempt was not already conclusive.

### 3. The panel's own border, and why it eats digits

The value digits sit close to the right edge of the LCD glass. At some exposures
the panel's dark border thresholds as ink - and when it does, it touches the
upper-right and lower-right segment of every digit it runs past. Eight separate
glyphs and a frame become **one** connected component: a sprawling outline that
the stroke filter correctly refuses to treat as a glyph, and therefore discards.

The digits do not disappear. They lose exactly their right-hand segments, so `9`
reads as `5` and `8` reads as `6`. On real photographs of this device that was
the single largest source of wrong readings.

Dropping the whole component is the wrong response, and so is keeping it. The
bridge is removed *before* anything is labelled, by erasing long thin straight
runs of ink. A border is long and thin; a lit segment is short and fat. Measuring
each ink pixel's horizontal and vertical run gives both numbers, and the ratio
separates them cleanly - a segment stroke runs three to six times its own
thickness, a panel edge fifty. Both thresholds sit far from the glyph population
rather than at its edge, because trimming a real stroke costs a misread while
leaving a border in place only costs this pass behaving as it used to.

This runs as its own pass variant, not as a default. A photo whose border stays
light does not need it, and any filter that can rescue a glyph can also trim one.

### 4. Rows, and the digit that breaks them

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

### 5. Finding the three value rows

The device gives three strong structural guarantees, and requiring all of them
together is what rejects the printed bezel labels, the wordmark and the button
outlines:

1. the rows are **stacked** with a small vertical gap,
2. systolic and diastolic share a height, and the pulse row below is **smaller**,
3. they are **right-aligned to a common edge**, because short values are padded
   with blanks on the left rather than leading zeros.

Every subset of candidate rows is scored against these, not just consecutive
ones - the icon strip puts symbols at heights that fall *between* the value rows,
and requiring adjacency meant a single cuff-fit tick could split the trio and
silently drop the pulse.

The second guarantee used to be stated as "all three rows are about the same
height", which is simply not true of the hardware: the pulse row is around two
thirds of the pressure rows. Scoring uniformity across all three punished the
correct block for a property the device guarantees, and on a real photo the true
trio scored *worse* than one that had swallowed the moulded wordmark - because
the wordmark happened to be closer in height to the pressure rows than the pulse
row is.

The right edge is the strongest of the three. The values are the only thing on
the panel that shares an exact right edge, so nothing accidental reproduces it,
and it is weighted accordingly.

### 6. Right-anchored cells

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

### 7. Probing the segments

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

### 8. One reading, assembled from several passes

A single pass has one threshold window and one sensitivity. A real photograph
does not have one contrast.

An LCD photographed even slightly off-axis fades unevenly: on one of the fixtures
here, a digit's left-hand segments sit 80 grey levels below their background
while the right-hand segments of the *same digit* sit only 20 below. The
parameters that resolve the top of the panel are not the ones that resolve the
bottom. Insisting that one pass read all three rows turns a solvable problem into
a search for a corner of parameter space that may not exist, and the pass ladder
has to grow combinatorially to keep finding it.

The rows are independent measurements of independent parts of the image, so they
are sourced independently: each of systolic, diastolic and pulse is taken from
whichever pass read *that row* most confidently. What keeps it honest is that a
row may only replace another if it describes the same piece of the photo - same
position, same height, same right edge - and only if it is more confident.

This is also why pass ranking multiplies by confidence rather than adding it.
When the two were added, a pass that filled all three rows with noise outscored
one that read two rows perfectly and admitted it could not see the third; the
ladder then chose the wrong mask, and because that mask was internally consistent
the wrongness survived to the acceptance check.

### 9. Refusing to guess

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
  off, which tends to be wrong in ways segment probes cannot see. Only rows that
  actually contributed a number count here: a pulse row already rejected as
  unreadable should not suppress a systolic and diastolic that both read
  perfectly.
- **Separated populations.** Confidence is the gap between the weakest lit
  segment and the strongest unlit one — not distance from a threshold, which
  *saturates*. A misaligned cell can have every probe land decisively on ink or
  decisively on background and still be reading the wrong digit; asking whether
  the two populations are distinguishable at all catches that.

Pulse is treated differently from blood pressure, and deliberately so. It sits at
the bottom of the panel in the smallest digits - exactly where a photo runs out
of contrast first - so on real photographs it is the row that fails while the two
pressure rows are still perfectly legible. A pulse the recogniser cannot stand
behind is **dropped rather than reported**: it is optional in a reading, blood
pressure is the measurement, and there is no cost to omitting it against a real
cost to recording a wrong one.

The bar is partly relative. An absolute floor alone is not enough, because a
misread is not always an *uncertain* read - when the panel border swallows a
segment, the probe lands decisively on background and the wrong digit comes back
well resolved. What gives it away is the comparison: a display whose systolic and
diastolic rows both read perfectly has no reason to produce a middling pulse, so
a pulse row markedly worse than its neighbours is evidence about that row rather
than about the photo.

Dropping the pulse does not weaken the row-identification guarantee above, which
depends on three rows being *located*, not on all three being readable.

When it refuses, the review screen is still pre-filled with the best guess.
`ok: false` means "please check this", not "start again".

## Measured accuracy

Two benchmarks, measuring different things. A change that improves one while
regressing the other is not an improvement.

### Against synthetic fixtures

`npm run ocr:bench` renders the display at known values, applies photographic
degradation, and checks what comes back. 256 images per run.

| Condition | Exact | Sys+Dia | Accepted | Wrongly accepted |
|---|---|---|---|---|
| Clean | 100% | 100% | 100% | 0 |
| Typical hand-held | 100% | 100% | 100% | 0 |
| Steep angle | 100% | 100% | 100% | 0 |
| Dim and grainy | 100% | 100% | 100% | 0 |
| Glare and blur | 100% | 100% | 100% | 0 |
| Brutal | 100% | 100% | 100% | 0 |
| Severe | 97% | 97% | 94% | 0 |
| **Unreadable** | - | - | **0%** | **0 of 32** |

Roughly 35 ms per image in Node for a clean photo, rising to ~200 ms for one
where every pass has to run because nothing succeeds.

The `unreadable` row is a deliberate negative fixture: glare covers the value
block and the blur is wider than a segment, so a person could not read it either.
Refusing all 32 is as much a pass as reading the others. `severe` was that
fixture until the border-severing and per-row merging described above made it
readable; it kept its own name so the evidence stays in the table.

### Against real photographs

`npm run ocr:real` runs actual photos of the device against
[`tools/fixtures/expected.json`](../tools/fixtures/expected.json).

Each photo is read **four times**, through different resize-and-re-encode chains.
That is not thoroughness for its own sake. A phone does not hand the recogniser
the file on disk; it hands it a resized, re-encoded copy produced by a native
pipeline whose resampling filter and JPEG encoder this benchmark cannot reproduce
exactly. On photographs this marginal, a difference of a grey level or two flips
a segment: the same algorithm reads `122/79` from one chain and `122/75` from
another. Fixing one chain and reporting its score would measure that chain's
luck, and it would disagree with the phone — which it did, until this benchmark
started varying it.

| Photo | Truth | Accepted | What it read when it did |
|---|---|---|---|
| Stored average, bright reflection | 117/81/81 | 1 of 4 | 117/81 |
| Straight-on, panel fading to the right | 122/79/98 | 1 of 4 | 122/79 |
| Low contrast, hard shadow across panel | 107/78/98 | 2 of 4 | 107/78 |
| Power-on self test (all segments lit) | must refuse | 0 of 4 | - |

**Wrongly accepted: 0 of 16.** Every reading the app would have saved was right.

The accept rate is the honest headline: on these three photographs it reads the
display about a quarter of the time and asks the user to check the rest. They are
all hard cases — a stored-average screen caught mid-fade, an LCD dimming across
its own panel, a shadow lying diagonally over the glass — and the synthetic
`clean` and `typical` rows above are what a squarely-lit photo looks like. But
the number is what it is, and the refusals are not arbitrary: each one is a
specific rule firing. Only two rows located, so systolic cannot be told from
pulse. Systolic below diastolic. A pulse row markedly less legible than the
pressure rows above it.

Every structural fix in the pipeline — the stroke-width refinement, the
row-height model, severing the panel border, per-row merging, confidence-weighted
pass ranking — came from one of these four photos. None was visible in the
synthetic set, which is the point of having them.

### Where this approach runs out

The four photographs above were taken to test the recogniser: the monitor fills
the frame and the camera is roughly square-on. Twenty-three later ones were not.
They are in `tools/fixtures/106-88-104/` and `tools/fixtures/107-78-98/`, taken
the way a person actually takes them - monitor small in frame, held at an angle,
lit by a phone torch, sometimes slightly soft. Run them with `npm run ocr:folders`.

```
runs 92   accepted 4   correct 4   WRONG 0
```

**One photograph out of twenty-three**, with all four accepts coming from the
same image. Still nothing wrong, which is the invariant holding under pressure.
But as a reader, on the input that matters, it does not work.

This is not a tuning failure and no combination of the knobs listed below fixes
it. Steps 2 through 6 of the pipeline all assume the panel is most of the picture
and roughly square-on. At a tenth of the frame the threshold window spans several
digits so strokes stop separating from the background; at twenty degrees the
bottom of the systolic row overlaps the top of the diastolic row in y and they
merge into one band. The multi-pass ladder varies parameters *downstream* of a
step that has already failed.

Fixing it means finding the LCD quadrilateral and warping it to a rectangle
before any of this runs - at which point everything above becomes useful again,
because it is good at reading a panel it can find. That work is not done. What
exists instead is an optional [assisted reader](./assisted-reading.md): a vision
model on your own machine, which needs none of the localisation and reads these
photographs. It is off by default and requires a build with network permission,
so the on-device path described on this page remains what ships.

### Why both

Synthetic fixtures give ground truth. Measuring accuracy needs to know the right
answer for every image, which means either labelling hundreds of photos by hand
or generating them. [`tools/render-display.ts`](../tools/render-display.ts)
reproduces the structural traps rather than the exact pixels: right-aligned
glyphs, an icon strip that can bridge rows, printed labels outside the panel,
rows of two and three digits mixed. [`tools/augment.ts`](../tools/augment.ts)
then applies perspective warp, lighting gradients, glare, blur, sensor noise and
JPEG artefacts, all seeded so a failure reproduces exactly.

What they cannot contain is a surprise the renderer does not know how to draw -
and every one of the real photographs contained at least one. An LCD that fades
across the panel so half a digit is at a fifth of the contrast of the other half.
A panel border dark enough to bridge into the digits. A pulse row two thirds the
height of the pressure rows. Those were not oversights in the renderer so much as
things nobody would think to draw.

**Adding your own photos.** Two ways. For a one-off, drop it in
`tools/fixtures/` and add an entry to `expected.json`. For a batch that all show
the same reading - which is the useful shape, since it takes a dozen angles of
one display to find a bias - make a folder named `sys-dia-pul`, for example
`tools/fixtures/106-88-104/`, and drop them in. No manifest entry needed: the
name is the ground truth. Then run `npm run ocr:real` or `npm run ocr:folders`;
the test suite picks them up automatically either way. Use
`npm run ocr:real -- --write-debug` for annotated PNGs of the ink mask, detected
bands and probed cells, and `npx tsx tools/crop.ts <file> <x> <y> <w> <h> <zoom>`
to magnify a region. Looking at those overlays is how nearly every bug described
on this page was found - far faster than reasoning about why a number came out
wrong.

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
- `PASS_VARIANTS` in `pipeline.ts` — the window sizes, sensitivities and
  denoise levels tried
- `PULSE_HEIGHT_RANGE` and `PRESSURE_HEIGHT_RATIO` in `layout.ts` — the row
  height model, if another device sizes its rows differently
