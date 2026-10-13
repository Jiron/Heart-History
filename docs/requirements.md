# Requirements and decisions

The brief, as agreed, plus the decisions taken while building. Anything marked
**Done** is implemented and verified; **Planned** is scoped but not yet built.

## Non-negotiables

| # | Requirement | Status |
|---|---|---|
| 1 | React Native app, Android first, runs in Expo Go, buildable to APK on expo.dev | Done |
| 2 | Read systolic / diastolic / pulse from a photo of the monitor | Done |
| 3 | Must generalise, not be tuned to the four sample photos | Done |
| 4 | History, charts, trends | Done |
| 5 | Local storage, backup, export, import | Done |
| 6 | **Everything client-side. No server.** | Done — the default builds. See below |
| 7 | Filter by last week / month / year / all, and between two dates | Done |
| 8 | Add an entry fully manually, without a photo | Done |
| 9 | Edit any individual entry after the fact | Done |
| 10 | Good-looking, responsive, mobile-first | Done |
| 11 | Language selector, German by default | Done |

## No server, and how that is enforced

The recogniser is plain TypeScript over typed arrays. It has no network calls, no
native modules and no cloud dependency — the same source file runs on the phone
under Hermes and in Node under the test suite.

This is enforced structurally rather than promised:

- `src/ocr/` imports nothing from React Native, Expo or Node.
- `app.config.ts` strips `android.permission.INTERNET` from the manifest of every
  released build (`preview`, `production`, `production-apk`), using the
  manifest-merger's `tools:node="remove"`. The app is *incapable* of sending a
  photo anywhere, so the guarantee is held by the operating system rather than by
  our good intentions. Verify with `npx expo config --type introspect`, or
  `aapt dump permissions` on a built APK.
- Two profiles are exempt. `development` needs the network to reach the Metro
  bundler and is never distributed. `assisted-apk` is discussed below.
- The only code in `src/` that calls `fetch` is `services/remoteOcr.ts`, and it
  is unreachable unless the user has typed a server address into Settings.
- Photos, readings and backups live in app-private storage. Exports are written
  to a file the user explicitly shares.

In the default builds there is therefore no "processing job" to delete from a
server, because no photo ever leaves the device. The one exception is opt-in and
described next.

### Where requirement 6 was relaxed, and why

Requirement 3 said the reader must generalise rather than be tuned to the four
sample photographs. Measured against twenty-three photographs taken normally, the
on-device recogniser read **one**. It is not tuned to the samples — it fails on
them honestly and refuses — but it does not work, and the number is in
[ocr.md](ocr.md).

Requirements 3 and 6 turned out to be in tension, and this is the resolution:

- **The default build still satisfies 6 completely.** `preview`, `production` and
  `production-apk` have no `INTERNET` permission. Nothing changed for anyone who
  does not go looking.
- **A separate `assisted-apk` build** can send the photo to a vision model on a
  machine the user runs, which reads those photographs. It is a different binary,
  not a setting, so that the guarantee for the default build stays enforced by
  Android rather than by this codebase's good behaviour.
- **The server stores nothing.** It holds one photo in memory for one request and
  returns three numbers. That is a property of code the user runs themselves,
  which is a weaker kind of assurance than a missing permission, and it is
  described that way everywhere it appears.

The honest summary: requirement 6 holds for the app as shipped, and the user may
opt out of it for themselves, on their own hardware, having been told the cost.
[assisted-reading.md](assisted-reading.md) is the full account.

## Languages

German and English, with German as the default. The picker lives in Settings and
offers **Automatisch** as well, which follows the phone's language and falls back
to German when it is neither.

The German dictionary in [`src/i18n/de.ts`](../src/i18n/de.ts) is the source of
truth: every other language is typed against it, so adding a string is a compile
error until it has been translated everywhere. Swiss orthography throughout —
"ss" rather than "ß".

Two consequences worth knowing about:

- **Dates and numbers follow the chosen language, not the phone.** Picking
  English on a German phone switches date formatting too (`de-CH` / `en-GB`),
  because a screen that mixes the two reads as a bug.
- **Tags are stored as keys, not labels.** A reading tagged *Vor Medikament* in
  German still reads correctly as *Before medication* after switching, and CSV
  exports come out in whatever language is active at export time.

Nothing user-visible is produced outside the dictionaries — the recogniser
returns warning *codes* rather than sentences, and the classification layer
returns category *keys* rather than labels, so neither has any idea what language
the reader uses.

## Ordering and the monitor's own clock

The Microlife BP B1 Classic alternates its top-right field between a date
(`8-23`) and a clock (`8:15`). Because the same field means different things at
different moments, it is **never** used to order or group readings.

Readings are ordered by `measuredAt`, which defaults to when the photo was taken
or when the entry was made, and which the user can correct. Whatever the monitor
happened to be showing is stored alongside as `deviceDisplayHint` and offered in
the review screen as a one-tap "use this date" suggestion — a hint, never a
source of truth.

## Categories, and letting the thresholds move

Every reading carries a category, and it is the only interpretation this app
offers. Three things follow from that, and all three are load-bearing:

**It says where the lines are.** Settings › Classification › "Ranges and
thresholds" lists all seven categories with their systolic and diastolic spans
and a sentence on what each describes. A colour with no stated meaning is not
information.

**The lines can be moved, and a broken set is refused.** Guidance is not the
only defensible scale — a clinician may give someone different targets, and
before this there were two fixed choices. A custom scale whose boundaries do not
rise is rejected by the editor, by name, because such a set has a category no
reading can ever land in: that fails as a colour which never appears rather than
as an error. A stored value that would do the same — an older build's, a hand
edit, a corrupted row — is turned away on read and the standard scale is used
instead. A reading with no category is worse than one graded against numbers the
user did not pick.

**A report that leaves the phone says which thresholds it used.** Once the
scale is editable, "grade 1" on a PDF handed to a doctor no longer means one
thing. The report prints the boundaries under the readings table.

None of this is a diagnosis, and the screen says so. A category describes one
measurement; single readings vary widely.

## Refusing rather than guessing

A blood-pressure log that silently records a wrong number is worse than one that
asks for another photo. The recogniser therefore only reports `ok: true` when:

- all three value rows are visible (with two rows there is no way to tell
  "systolic and diastolic" from "systolic and pulse"),
- the numbers are self-consistent (systolic above diastolic, plausible gap),
- no glyph had to be snapped to a nearest-match pattern, and
- lit and unlit segments are cleanly separated in the image.

Pulse is held to a stricter bar than blood pressure and simply left out when it
cannot be resolved. It is optional in a reading, it sits in the least legible
corner of the panel, and there is no cost to omitting it against a real cost to
recording a wrong one.

Measured across 256 synthetic photos and 16 reads of real ones, nothing wrong has
ever been accepted. Readable synthetic photos are read exactly; the real photos
in the fixture set are hard shots and are read about a quarter of the time, with
the rest handed to the user to confirm. See [ocr.md](ocr.md) for the numbers and
what limits them.

Even when it refuses, the review screen is still pre-filled with the best guess —
`ok: false` means "please check this", not "start again".
