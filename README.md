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
intentions — the app is *incapable* of making a network request. (The one
exception is a development build, which needs to reach the Metro bundler; it is
never shipped.) Photos, readings and backups live in app-private storage; an
export only leaves the device when you pick a destination in the share sheet.

## How well does it read a display?

Measured over 336 synthetic photos with known ground truth, across capture
conditions from ideal to unusable:

| Condition | Exact (all three values) | Wrongly accepted |
|---|---|---|
| Clean | 100% | 0 |
| Typical hand-held | 100% | 0 |
| Steep angle | 100% | 0 |
| Dim and grainy | 100% | 0 |
| Glare and heavy blur | 100% | 0 |
| Severe | 81% | 0 |
| Genuinely unreadable | — | **0 of 48 accepted** |

The last column matters most. A blood-pressure log that silently records the
wrong number is worse than one that asks for another photo, so the recogniser
refuses rather than guesses — and it refused every unreadable photo it was given.
See [docs/ocr.md](docs/ocr.md) for how the recogniser works and why it fails safe.

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
| [ocr.md](docs/ocr.md) | How the display recogniser works |
| [architecture.md](docs/architecture.md) | Project layout and data model |
| [building.md](docs/building.md) | Running, testing and shipping |
| [roadmap.md](docs/roadmap.md) | Ideas worth building next |

## Developing

```bash
npm run android      # run in Expo Go
npm test             # recogniser test suite
npm run ocr:bench    # accuracy benchmark across capture conditions
npm run ocr:debug    # render one synthetic display and dump annotated PNGs
npm run typecheck
```

## A word on what this is

Heart History records measurements. It is not a medical device, it does not
diagnose anything, and the categories it shows describe a single reading rather
than a person. What your readings mean is a conversation to have with a doctor.
