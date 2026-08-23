# Roadmap

Ideas worth building, roughly in order of value per unit of work. Nothing here is
committed — it is a list to pick from.

## Worth doing next

**Reminders.** A local notification at chosen times, because the hardest part of
home monitoring is remembering to do it. Needs `expo-notifications` and a
development build (local scheduling is limited in Expo Go), and it stays entirely
on-device — no push service.

**Guided measurement mode.** Guidance says to sit quietly for five minutes, then
take two or three readings a minute apart and average them. A mode that walks
through that — rest timer, then prompts for each reading, then saves the average
as one entry — would make the numbers meaningfully more reliable.

**Tune against real photographs.** The recogniser is validated against synthetic
fixtures with known ground truth, which covers the failure modes it was designed
for but cannot contain a surprise the renderer does not know how to produce. Drop
real photos into `tools/fixtures/` with expected values and extend the benchmark
to read them. This is the single highest-value item for recognition quality.

**Detect the display icons.** The monitor's irregular-heartbeat symbol,
cuff-fit-check tick and traffic-light position are read today only as user
toggles. They sit at known positions relative to the value block, so detecting
them is tractable — but it needs real photos to calibrate against, so it follows
the item above.

**Batch scanning of stored readings.** The monitor keeps its last 30
measurements. Stepping through them with `M` and scanning each is tedious; a mode
that stays on the camera and captures repeatedly, then presents the whole set for
one confirmation, would make importing a device's memory painless.

## Later

**Correcting a misread teaches the app.** When the user edits a scanned value,
that is a labelled example. Storing the photo alongside the correction would
build a real-world regression set over time, for free.

**Medication tracking.** What was taken and when, drawn on the same timeline.
Turns "my readings went down in March" into "my readings went down when the dose
changed". Modest to build, and probably the most clinically useful addition.

**Apple Health / Health Connect.** Write readings to the platform health store so
other apps can use them. Genuinely useful, but it is the first feature that lets
data leave the app, so it needs to be explicit, opt-in and clearly explained.

**Weight, symptoms and context.** Blood pressure rarely moves alone.

**Wear OS complication.** Glance at the last reading and the weekly average.

**More languages.** French and Italian are the obvious next two for
Switzerland. The dictionaries are typed against German, so adding one is a
mechanical exercise with a compiler checking the work — no code changes, and a
missing string fails the build rather than silently falling back.

**More device profiles.** The recogniser finds values structurally rather than by
hard-coded coordinates, so most seven-segment monitors should work already. A
short list of confirmed devices — and a per-device tweak file for the ones that
need it — would make that a promise rather than a hope.

## Deliberately not planned

**A cloud account, sync, or a server of any kind.** The app's guarantee is that
readings cannot leave the device, and that is enforced by stripping the network
permission from the manifest. Sync would trade that for convenience. Backup files
already cover moving to a new phone, and they move under the user's control.

**Diagnosis, risk scores, or advice.** Heart History records measurements and
describes them against published categories. Anything that reads as a medical
judgement belongs with a clinician, not a phone app.
