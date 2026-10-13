# Running, testing and shipping

## Requirements

- Node 20.19.4+, 22.13+ or 24.3+ (React Native's own floor)
- An Android device or emulator (or Expo Go on your phone)
- An [expo.dev](https://expo.dev) account, only for cloud builds

```bash
npm install
```

## Development

```bash
npm run android      # start Metro and open in Expo Go
npm start            # start Metro, scan the QR with Expo Go
npm run start:clear  # same, but clear the bundler cache first
```

Everything the app uses is bundled in Expo Go, so no custom development build is
needed for day-to-day work.

### The one thing Expo Go cannot do

**Restoring a backup does not work inside Expo Go.** The document picker copies
the chosen file into Expo Go's own cache directory, which is outside the sandbox
granted to the experience running inside it, so both file readers refuse it with
`Missing 'READ' permission` / `isn't readable`. It is a limitation of the host
app, not of the code — everything else, including export, runs normally.

To exercise restore, build and run the app for real:

```bash
$env:JAVA_HOME = "$env:USERPROFILE\.gradle\jdks\eclipse_adoptium-17-amd64-windows.2"
$env:EAS_BUILD_PROFILE = "development"   # grants INTERNET so it can reach Metro
npx expo run:android
```

Two things in that snippet are not optional:

**`EAS_BUILD_PROFILE`.** `app.config.ts` strips `INTERNET` from the manifest
unless the profile is `development` or `HH_ALLOW_NETWORK=1` is set. Without
this, a local development build cannot reach Metro and will sit on a blank
screen. See *The network permission* below.

**`JAVA_HOME` pointing at a JDK 17.** Android Studio now ships JBR 25, and
building against it fails in the CMake configure step for `react-native-worklets`
with the unhelpful message:

```
Execution failed for task ':react-native-worklets:configureCMakeDebug[x86_64]'.
> WARNING: A restricted method in java.lang.System has been called
```

That is JDK 24+ refusing a native call, surfacing as a warning the Gradle task
treats as failure. Gradle keeps a provisioned JDK 17 under `~/.gradle/jdks`;
point `JAVA_HOME` at it. EAS cloud builds are unaffected — they use JDK 17
already — so `npm run build:apk` needs none of this.

`expo run:android` also rewrites the `android` script in `package.json` to point
at itself. Change it back to `expo start --android`, or `npm run android` stops
opening Expo Go.

If the emulator does not pick up Metro automatically:

```bash
adb reverse tcp:8081 tcp:8081
```

## Testing

```bash
npm test             # vitest: the recogniser (~200 synthetic photos and the real
                     # fixtures), classification and the doctor's report
npm run typecheck    # tsc --noEmit
npm run lint
```

### Working on the recogniser

```bash
npm run ocr:bench                       # accuracy across every synthetic condition
npm run ocr:bench -- --preset dim --verbose --seeds 3
npm run ocr:real                        # accuracy against the real photos
npm run ocr:real -- --write-debug       # annotated masks to tools/out/real/
npm run ocr:folders                     # accuracy against the foldered photo sets
npm run ocr:debug                       # one display, annotated PNGs to tools/out/
npm run ocr:debug -- --sys 148 --dia 93 --pul 101 --preset hard
```

`ocr:real` is the one that decides whether a change was an improvement. See
[ocr.md](ocr.md) for what the two benchmarks measure and why both are needed.

`ocr:folders` reads every folder under `tools/fixtures/` named `sys-dia-pul`.
Adding photographs needs no manifest: the folder name is the ground truth. It is
also the benchmark the on-device recogniser currently fails — see
[assisted-reading.md](assisted-reading.md) — so treat a change there as
significant.

To measure the assisted reader instead, start it and run the grader:

```bash
npm run ocr:server:start
```

```bash
python tools/vlm-grade.py
```

`npm run ocr:server:stop` when you are done, `npm run ocr:server` for status.
Details in [server/README.md](../server/README.md).

`ocr:debug` writes `photo.png`, `gray.png` and `mask.png`. The mask overlay draws
detected bands in red and probed glyph cells in blue — looking at that image is
how nearly every recogniser bug in this project was found.

The benchmark's most important column is **FALSE+**: readings the app would have
accepted that are actually wrong. It is expected to stay at zero. A change that
raises the read rate while putting a number in that column is a regression, not
an improvement.

## Building an APK

### First run

The build scripts invoke the CLI as `npx eas-cli`, so there is nothing to install
globally — Expo advises against that anyway, because the CLI moves quickly and a
stale global copy is a common source of confusing build failures. The first
invocation downloads it and npm caches it from then on.

Two things happen only once, and both need you rather than the script:

```bash
npx eas-cli login          # an expo.dev account
npx eas-cli init           # links this folder to a project on your account
```

Without the first, every build stops at *"An Expo user account is required to
proceed."* `init` links the folder to a project, which EAS needs because
`eas.json` sets `appVersionSource: "remote"` and keeps `versionCode` on the
server. `app.config.ts` is a dynamic config, so `init` cannot edit it: it prints
the `extra.eas.projectId` to add, and you paste it in.

**If you have forked the repository**, `app.config.ts` still carries the
original author's `extra.eas.projectId` and the `updates.url` derived from it.
With an ID already present, `init` will not link a new project; it treats the
folder as belonging to that one, which is not on your account, and fails, as
does `eas build`. Delete both fields first, then run `init`; set `updates.url` to
`https://u.expo.dev/<your project id>`, or leave it out if you do not use EAS
Update. If you ship your own build, also change the package id
`ch.opten.hearthistory` (`android.package`, and `ios.bundleIdentifier`) to one
of your own: two apps with the same id cannot be installed side by side.

### The quick one

```bash
npm run build:apk
```

Runs the `preview` profile on EAS: a release APK with internal distribution, so
the resulting link installs directly on any Android phone without the Play Store.
First run will also offer to generate a keystore — let it, and keep the
credentials safe.

### The others

| Command | Profile | Output | Network | For |
|---|---|---|---|---|
| `npm run build:apk` | `preview` | APK | no | sharing and sideloading |
| `npm run build:apk:prod` | `production-apk` | APK | **no** | a release build, still sideloadable |
| `npm run build:aab` | `production` | AAB | no | uploading to Google Play |
| `npm run build:dev` | `development` | APK | yes | a dev client (needs Metro) |
| `npm run build:apk:local` | `preview`, local | APK | no | building on this machine |
| `npm run build:apk:assisted` | `assisted-apk` | APK | **yes** | using a self-hosted reading server |

**If you use a reading server, the production build you want is
`build:apk:assisted`, not `build:apk:prod`.** Both are the `production` config;
only the first has `INTERNET`. Installing the second over the first produces an
app that starts fine, reads photos on the device, and reports the server as
unreachable forever — with nothing on screen to suggest the binary is the
reason. See *The network permission* below.

The cloud build needs nothing installed locally. `build:apk:local` builds on this
machine instead, which means it needs the Android SDK and a **JDK 17** — see the
JBR 25 trap under *Development* above, which applies here too. It still needs the
account, because the signing credentials live on it.

### Version numbers

`eas.json` sets `appVersionSource: "remote"`, so EAS owns `versionCode` and
increments it on each `production` (AAB) build. `production-apk` and
`assisted-apk` turn `autoIncrement` off and reuse the current value. The
user-facing `version` lives in `app.config.ts` and you bump it by hand per
release.

### The network permission

`app.config.ts` strips `android.permission.INTERNET` from every build **except**
two: `development`, which needs it to reach Metro, and `assisted-apk`, which
needs it to reach a reading server you run yourself. So `preview`, `production`
and `production-apk` produce an app that physically cannot make a network
request.

`assisted-apk` also turns on `usesCleartextTraffic`, via `expo-build-properties`.
A server on your own network has no certificate a phone would trust, and Android
blocks plain HTTP by default — without it every request fails with an error that
does not say why. It also declares `ACCESS_LOCAL_NETWORK`, which Android 16
requires before an app may reach an address on the LAN. All three are driven by
the same `HH_ALLOW_NETWORK` variable, set in `eas.json` for that one profile, so
they cannot drift apart. (`development` gets the same three.)

You can confirm it on a built APK:

```bash
aapt dump permissions app-release.apk
```

`android.permission.INTERNET` should not appear for any profile but those two.
To check the config before building:

```bash
npx expo config --type introspect
```

The permission appears with `tools:node: 'remove'`, which is the manifest-merger
directive that deletes it from the final APK.

If you ever add something that genuinely needs the network in a *shipping* build,
remove the entry from `blockedPermissions` — and update the claims in the README,
`docs/requirements.md` and the Settings screen, all three of which currently
promise otherwise. Assisted reading deliberately did not do that: it took a
separate profile instead, so that the default build keeps a guarantee the
operating system enforces rather than one this codebase merely intends.

## Native project files

The app is fully managed; `android/` is generated and git-ignored. To inspect or
patch the native project:

```bash
npm run prebuild     # expo prebuild --platform android --clean
```

Treat the result as a build artefact — it is regenerated from `app.config.ts`,
and hand edits are lost on the next prebuild.
