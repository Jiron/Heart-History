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

**More real photographs, of more readings.** There are 37 now, across five
readings and the power-on self test, and every structural fix came from them.
What the set still cannot catch is a digit-specific bias: `8` misread as `0` was found only because a `88`
happened to be in the data. Each new *reading* is worth more than ten more
photographs of one already covered — particularly an `Err` screen, a low
battery, and values whose digits are not already represented. Drop a folder
named `sys-dia-pul` into `tools/fixtures/` and `tools/vlm-grade.py`,
`npm run ocr:folders` and the test suite all pick it up; a `folder.json` beside
the photos carries anything the name cannot say.

**Raise the accept rate on hard photos.** The recogniser never accepts a wrong
blood pressure, but on the three real fixtures it only reads the display about a
quarter of the time; the rest are handed to the user to confirm. The refusals are
each a specific rule firing rather than a vague lack of confidence, so they are
addressable one at a time — the most common is only two of the three value rows
being located, which the three-row safety rule then correctly refuses to guess
from.

**Detect the remaining display icons.** The irregular-heartbeat symbol is read
by the assisted reader now — see
[assisted-reading.md](assisted-reading.md#the-irregular-heartbeat-symbol) for
the measurements and why its aggregation rule is the opposite of the one the
numbers use. The assisted reader does not look for the cuff-fit tick, the
stored-average `A` or the traffic-light position, and none of them is stored
with a reading. Adding each is a schema field and a paragraph of prompt, and the
same grading harness measures it — but each one also needs fixtures where it is
lit *and* fixtures where it is not, because the false-alarm rate is the number
that decides whether it can be trusted. The device reader already recognises the
stored-average `A` in the header and warns about it; the other two, and the
irregular-heartbeat symbol, remain undetected there. They sit at known positions
relative to the value block, so it is tractable there too, and follows panel
detection.

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

**A cloud account, or sync.** The app's guarantee is that readings cannot leave
the device, and that is enforced by stripping the network permission from the
manifest. Sync would trade that for convenience. Backup files already cover
moving to a new phone, and they move under the user's control.

This is not contradicted by [assisted reading](./assisted-reading.md), and the
distinction is the point: that sends one photo to a machine the user owns, from
a build they chose, and nothing is stored or accounted anywhere. A hosted service
holding a history would be a different thing, and is still not planned.

**Panel detection and perspective correction** is the opposite: very much worth
building, just not built. It is the only route to reading a hand-held photo
offline, and it would make the existing segment reader good rather than replace
it. See [assisted-reading.md](./assisted-reading.md) for why the fallback exists
in the meantime.

**Diagnosis, risk scores, or advice.** Heart History records measurements and
describes them against published categories. Anything that reads as a medical
judgement belongs with a clinician, not a phone app.
