# Running, testing and shipping

## Requirements

- Node 20+
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
$env:EAS_BUILD_PROFILE = "development"   # PowerShell; grants INTERNET for Metro
npx expo run:android
```

The `EAS_BUILD_PROFILE` matters: released builds have `INTERNET` stripped from
the manifest, and without it a local development build cannot reach Metro. See
[requirements.md](requirements.md).

If the emulator does not pick up Metro automatically:

```bash
adb reverse tcp:8081 tcp:8081
```

## Testing

```bash
npm test             # recogniser suite (renders and reads ~200 synthetic photos)
npm run typecheck    # tsc --noEmit
npm run lint
```

### Working on the recogniser

```bash
npm run ocr:bench                       # accuracy across every synthetic condition
npm run ocr:bench -- --preset dim --verbose --seeds 3
npm run ocr:real                        # accuracy against the real photos
npm run ocr:real -- --write-debug       # annotated masks to tools/out/real/
npm run ocr:debug                       # one display, annotated PNGs to tools/out/
npm run ocr:debug -- --sys 148 --dia 93 --pul 101 --preset hard
```

`ocr:real` is the one that decides whether a change was an improvement. See
[ocr.md](ocr.md) for what the two benchmarks measure and why both are needed.

`ocr:debug` writes `photo.png`, `gray.png` and `mask.png`. The mask overlay draws
detected bands in red and probed glyph cells in blue — looking at that image is
how nearly every recogniser bug in this project was found.

The benchmark's most important column is **FALSE+**: readings the app would have
accepted that are actually wrong. It is expected to stay at zero. A change that
raises the read rate while putting a number in that column is a regression, not
an improvement.

## Building an APK

### The quick one

```bash
npm run build:apk
```

Runs the `preview` profile on EAS: a release APK with internal distribution, so
the resulting link installs directly on any Android phone without the Play Store.
First run will prompt you to log in and to generate a keystore — let it, and keep
the credentials safe.

### The others

| Command | Profile | Output | For |
|---|---|---|---|
| `npm run build:apk` | `preview` | APK | sharing and sideloading |
| `npm run build:apk:prod` | `production-apk` | APK | a release build, still sideloadable |
| `npm run build:aab` | `production` | AAB | uploading to Google Play |
| `npm run build:dev` | `development` | APK | a dev client (needs Metro) |
| `npm run build:apk:local` | `preview`, local | APK | building on this machine |

A local build needs a JDK and the Android SDK on `PATH`; the cloud build needs
neither.

### Version numbers

`eas.json` sets `appVersionSource: "remote"`, so EAS owns `versionCode` and
increments it per production build. The user-facing `version` lives in
`app.config.ts` and you bump it by hand per release.

### The network permission

`app.config.ts` strips `android.permission.INTERNET` from every build **except**
`development`, which needs it to reach Metro. So `preview`, `production` and
`production-apk` produce an app that physically cannot make a network request.

You can confirm it on a built APK:

```bash
aapt dump permissions app-release.apk
```

`android.permission.INTERNET` should not appear. To check the config before
building:

```bash
npx expo config --type introspect
```

The permission appears with `tools:node: 'remove'`, which is the manifest-merger
directive that deletes it from the final APK.

If you ever add something that genuinely needs the network, remove the entry from
`blockedPermissions` — and update the claims in the README, `docs/requirements.md`
and the Settings screen, all three of which currently promise otherwise.

## Native project files

The app is fully managed; `android/` is generated and git-ignored. To inspect or
patch the native project:

```bash
npm run prebuild     # expo prebuild --platform android --clean
```

Treat the result as a build artefact — it is regenerated from `app.config.ts`,
and hand edits are lost on the next prebuild.
