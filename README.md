# Heart History

Point your phone at a blood-pressure monitor. Heart History reads the numbers off
the display, keeps the history, and draws the charts — entirely on the device.

Built for the **Microlife BP B1 Classic**, and written to generalise to other
seven-segment monitors rather than being tuned to one set of photos.

```bash
npm install
npm run android      # Expo Go on a connected device or emulator
```

## What it does

- **Scan a reading.** Photograph the display; systolic, diastolic and pulse are
  read on the phone and pre-filled for you to confirm.
- **Or type it in.** Full manual entry, no photo needed. Every reading can be
  edited or deleted afterwards.
- **See the history.** Grouped by day, filtered by last week / month / 3 months /
  year / all, or between any two dates, and by how raised the reading was.
- **See the trends.** Systolic and diastolic over time, distribution across the
  categories, averages by time of day, and the 7-day morning-and-evening average
  that home-monitoring guidance asks for.
- **Keep it safe.** JSON backup, CSV export, and a printable PDF report for a
  doctor's appointment. Restore by merging or replacing.
- **Share the monitor.** Separate profiles, each with its own history and targets.
- **Read it in your language.** German and English, German by default, switchable
  in Settings. Dates and number formats follow the choice.

## No server

There isn't one, and there is no way to add one by accident.

The recogniser is plain TypeScript over typed arrays: no native modules, no
network calls, no cloud service. The *same source file* runs on the phone under
Hermes and in Node under the test suite, which is what makes it testable at all.

`app.config.ts` strips `android.permission.INTERNET` from the manifest of every
released build, so the guarantee is enforced by Android rather than by our good
intentions — the app is *incapable* of making a network request. Photos, readings
and backups live in app-private storage; an export only leaves the device when
you pick a destination in the share sheet.

Two builds are exempt, both opt-in and neither the default. A **development**
build has to reach the Metro bundler to load JavaScript at all. And an
**`assisted-apk`** build can reach a reading server you run yourself — see
[assisted reading](#assisted-reading) below, which is a real trade and is
described as one. `preview`, `production` and `production-apk` are unchanged.

## How well does it read a display?

Two benchmarks, because they answer different questions.

**256 synthetic photos** with known ground truth, spanning capture conditions
from ideal to unusable:

| Condition | Exact (all three values) | Wrongly accepted |
|---|---|---|
| Clean | 100% | 0 |
| Typical hand-held | 100% | 0 |
| Steep angle | 100% | 0 |
| Dim and grainy | 100% | 0 |
| Glare and heavy blur | 100% | 0 |
| Brutal | 100% | 0 |
| Severe | 97% | 0 |
| Genuinely unreadable | — | **0 of 32 accepted** |

**Real photographs of the monitor**, each read through four different
resize-and-re-encode chains because the exact one a phone uses cannot be
reproduced offline — and on marginal photos a grey level or two decides whether a
segment reads as lit:

| Photo | Truth | Accepted | Read |
|---|---|---|---|
| Stored average, bright reflection | 117/81/81 | 1 of 4 | 117/81 |
| Straight-on, panel fading to the right | 122/79/98 | 1 of 4 | 122/79 |
| Low contrast, hard shadow over the glass | 107/78/98 | 2 of 4 | 107/78 |
| Power-on self test (all segments lit) | must refuse | 0 of 4 | — |

**Nothing wrong was ever accepted** — not in 256 synthetic images, not in 16 real
reads. That is the column that matters: a blood-pressure log which silently
records a number you did not measure is worse than one that asks you to check.

### And where it stops working

Twenty-three later photographs, taken the way a person actually takes them —
monitor small in frame, at an angle, lit by a phone torch — were read through
the same four chains:

```
runs 92   accepted 4   correct 4   WRONG 0
```

**One photograph out of twenty-three.** Still nothing wrong, but as a reader,
on the input that matters, it does not work. The cause is structural rather than
a matter of tuning: nothing in the pipeline finds the display or corrects
perspective, so a panel at a tenth of the frame and twenty degrees never reaches
the code that reads digits. [docs/ocr.md](docs/ocr.md) has the detail.

## Assisted reading

Optional, off by default, and it needs a machine of your own. A vision model
running locally reads those same photographs:

| | On device | Assisted |
|---|---|---|
| Photos read | 1 of 23 | **24 of 27** |
| Blood pressure wrong | 0 | **0** |
| Time per photo | under a second | 11 s on a 3060, 17 s on an iGPU |
| Needs a network | no | yes, to your own machine |

Each photo is read four times, from four renderings, and a value is accepted only
if all of them agree — not by majority, because on the hardest photo the majority
was wrong. That is what keeps the wrong column at zero.

The server keeps nothing: the photo lives in memory for one request, there is no
database and no upload directory, and even the console line omits the values.
History, photos and backups stay on the phone. Every endpoint requires a bearer
token, generated on first run, so the server can safely sit behind a Cloudflare
tunnel rather than only on the LAN.

Setup is in [server/README.md](server/README.md); the reasoning, including what
was tried and discarded, is in
[docs/assisted-reading.md](docs/assisted-reading.md).

## Building an APK

```bash
npm run build:apk        # shareable APK via EAS
```

Full instructions, including local builds and Play Store bundles, are in
[docs/building.md](docs/building.md).

## Documentation

| | |
|---|---|
| [requirements.md](docs/requirements.md) | The brief, and the decisions taken against it |
| [ocr.md](docs/ocr.md) | How the on-device recogniser works, and where it stops |
| [assisted-reading.md](docs/assisted-reading.md) | The local vision model: what was tried, measured and rejected |
| [architecture.md](docs/architecture.md) | Project layout and data model |
| [building.md](docs/building.md) | Running, testing and shipping |
| [roadmap.md](docs/roadmap.md) | Ideas worth building next |

## Developing

```bash
npm run android      # run in Expo Go
npm test             # recogniser test suite
npm run ocr:bench    # accuracy benchmark across synthetic capture conditions
npm run ocr:real     # accuracy against the real photos in tools/fixtures/
npm run ocr:debug    # render one synthetic display and dump annotated PNGs
npm run typecheck
```

## A word on what this is

Heart History records measurements. It is not a medical device, it does not
diagnose anything, and the categories it shows describe a single reading rather
than a person. What your readings mean is a conversation to have with a doctor.
