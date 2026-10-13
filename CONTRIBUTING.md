# Contributing

Thanks for looking. Bug reports, photos of other monitors, translations and pull
requests are all welcome.

## The one rule

**A wrong reading is worse than no reading.** Every benchmark in this repo has a
"wrongly accepted" or "WRONG" column, and it has to stay at zero. A change that
reads more photos but puts a single number in that column is a regression, not
an improvement. Refusing and asking the user to type the value in is always an
acceptable outcome.

The same goes for the irregular-heartbeat symbol in assisted reading. A false
alarm puts a cardiac finding into someone's medical history, so that count has
to stay at zero too.

## Setting up

```bash
npm install
npm run android
```

[docs/building.md](docs/building.md) covers emulators, local builds and the one
thing that does not work inside Expo Go.

## Before opening a pull request

```bash
npm test
npm run typecheck
npm run lint
```

If you touched anything under `src/ocr/`, also run the benchmarks and include the
before and after numbers in the pull request:

```bash
npm run ocr:bench
npm run ocr:real
npm run ocr:folders
```

## Adding photos

Real photographs are the most useful thing you can contribute, especially of
monitors other than the Microlife BP B1 Classic. Put them in
`tools/fixtures/<sys>-<dia>-<pul>/`, named after what the display actually shows.
They then become regression tests automatically. [tools/README.md](tools/README.md)
has the details.

Before you add a photo, strip its metadata. Phone cameras can embed GPS
coordinates and device identifiers, and anything committed here is public.

## Text and translations

Every user-facing string lives in `src/i18n/`. English (`en.ts`) and German
(`de.ts`) are both required. `en.ts` is typed against the German dictionary, so
`npm run typecheck` fails if a string exists in only one of them.

## Style

Match the code around you. Comments explain *why*, not what. Documentation is
written in plain prose, and a claim about accuracy should name the command that
measured it.
