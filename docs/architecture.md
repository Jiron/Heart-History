# Architecture

## Layout

```
app/                      expo-router routes — screens only, no logic
  (tabs)/                 Today · History · Trends · Settings
  scan.tsx                camera with an alignment frame
  review.tsx              confirm a scanned reading before saving
  entry.tsx               manual entry, no photo
  reading/[id].tsx        view / edit / delete one reading
  profiles.tsx            manage the people sharing the monitor

src/
  ocr/                    the display recogniser — pure TS, zero RN imports
  domain/                 types, BP classification, statistics
  db/                     SQLite schema, migrations, repository
  services/               scan (image to reading), backup, PDF report
    reportHtml.ts         the report's markup — no platform imports, so it can
                          be rendered and inspected in Node
  state/                  app-wide state and the scan hand-off
  i18n/                   dictionaries (German is the source of truth)
    locale.ts             the active locale, with no React or Expo imports
  ui/                     design tokens, primitives, reading widgets
  charts/                 SVG charts built on react-native-svg
  lib/                    ids and formatting

tools/                    dev only: synthetic renderer, augmentation, benchmarks
  fixtures/               real photographs of the device, with expected values
tests/                    vitest suites
docs/                     this
```

## The rule that shapes everything

**`src/ocr/` may not import React Native, Expo or Node.** It operates on typed
arrays and nothing else.

That constraint is what makes the recogniser testable. The same file that runs on
the phone runs in `vitest`, fed by a synthetic renderer or by real photographs
instead of a camera, so the benchmark numbers describe the code that actually
ships rather than a reimplementation of it. Every layer that *does* need a platform sits outside it:
`services/scan.ts` is the only place that knows about `expo-image-manipulator`
and `jpeg-js`.

## Data

One SQLite database, three tables.

```
profiles ──< readings          settings (key/value)
```

`readings.profileId` cascades on delete, so removing a person removes their
history in one statement. The only index that matters is
`(profileId, measuredAt DESC)` — every list, chart and statistic is "this
person's readings, newest first".

Migrations are an ordered array in [`db/database.ts`](../src/db/database.ts),
applied against `PRAGMA user_version`. A shipped migration is never edited; a
change means appending another one.

SQLite has no boolean or array type, so `irregularHeartbeat` is an integer and
`tags` is a JSON string. Both are converted at the repository boundary, and a
corrupt tag blob costs the tags rather than the reading.

### `measuredAt` is the only ordering key

The Microlife monitor alternates its top-right field between a date and a clock,
so what it displays cannot be trusted to say *when* a measurement happened. It is
stored verbatim as `deviceDisplayHint`, offered in the review screen as a one-tap
suggestion, and never used to sort or group.

Everything orders by `measuredAt`, which defaults to when the photo was taken and
which the user can change.

## State

A single `AppStateProvider` holds settings, profiles and the active profile's
readings, and exposes mutators that update SQLite and local state together. The
dataset is one person's blood-pressure history — thousands of rows at most — so
keeping it in memory is simpler and faster than re-querying per screen.

Startup status is published through a **separate** context. The two must not be
merged: dismissing the splash screen is itself a render, so gating the whole tree
on "the database has loaded" means a failed open leaves the splash up forever
with the error captured but nothing mounted to show it. `BootGate` in
[`app/_layout.tsx`](../app/_layout.tsx) renders the loading state, a readable
error with a retry, or the app.

Scan results pass from the camera to the review screen through a module-level
slot ([`state/scanBuffer.ts`](../src/state/scanBuffer.ts)) rather than router
params — an `OcrResult` does not belong in a URL. The review screen consumes it
on mount so a stale result can never be shown against a later photo.

## Rendering

Charts are hand-drawn on `react-native-svg` rather than pulled from a charting
library. The modern chart libraries for React Native depend on Skia, which is not
available in Expo Go, and the ones that are compatible impose their own visual
language. Drawing directly is a few hundred lines and gives full control over how
a systolic/diastolic pair reads.

Theming is two complete palettes rather than one with opacity tricks, so dark
mode is designed rather than derived.

## Language

German by default, English available, switchable in Settings.

The German dictionary is the source of truth and every other language is typed
against it, so a missing translation is a compile error rather than a string that
silently falls back to English.

The rule that keeps this honest is that **no layer below the UI produces
user-visible text**. The recogniser returns warning codes; `classification.ts`
returns category keys; `format.ts` takes the dictionary for anything with words
in it. Each is translated at the point of display, which is also why the domain
layer needed no changes at all when the second language was added.

`getLocale()` publishes the active BCP-47 tag through a module variable rather
than a React context, because date formatting happens in plain functions far from
any component and threading a locale through all of them would add a parameter to
code that is otherwise pure formatting.

That variable lives in `i18n/locale.ts`, apart from the provider, so that reading
the locale does not drag React Native in with it. It sounds fussy until something
needs to run outside the app: the doctor's report formats dates, so a report that
could only be built on a phone could only be *inspected* on a phone. With the
import chain kept clean, `tools/report-preview.ts` renders the real markup to a
file — which is how two bugs in it were found.

## Choices worth knowing about

**No native modules beyond what Expo Go ships.** Everything runs in Expo Go
unmodified, which keeps the edit-run loop to a reload.

**No network, enforced by the OS.** `INTERNET` is stripped from the manifest of
every non-development build. See [requirements.md](requirements.md).

**Pixel access in pure JavaScript.** `expo-image-manipulator` downscales the
photo and returns base64; `jpeg-js` decodes it to RGBA with `useTArray`, which
keeps it on typed arrays instead of Node `Buffer`s that do not exist under
Hermes. No polyfill required.

**Refuse rather than guess.** The recogniser only reports success when it can
justify it. See [ocr.md](ocr.md).
