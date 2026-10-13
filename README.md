# Musly9

An AI soundtrack app for your videos: pick a video, describe the music, generate it, place it on the timeline and
export the result. iOS and Android, built with Expo (React Native).

Musly9 started on 2026-08-26 as an experiment inside AxForge, named "AxForge Soundtrack", and moved to its own home on
2026-10-14. The code still carries its first names (the app "AxForge Soundtrack", the package `ai.axforge.soundtrack`)
and talks to AxForge's API (`https://api.axforge.ai/v1`, the music endpoint `POST /v1/audio/music`). Rename them when
Musly9 gets its own identity.

## Run it

```sh
npm install
npm run typecheck
npm test
npm run prebuild
npm run android
```

It needs an Expo development build (a native media exporter is inside, so Expo Go cannot run it). Each user enters
their own API key in the app; it is kept in the iOS Keychain or the Android Keystore.

## The local toolchain (on the computer it came from)

`toolchain/` is not in git. It holds the Android SDK and the JDK the app was built with. Point the build at them first:

```powershell
$env:ANDROID_HOME = "$PWD\toolchain\android-sdk"
$env:JAVA_HOME = "$PWD\toolchain\jdk\jdk-17.0.20.1+1"
```

## The original notes

`README.original.md` (the experiment's own README: the flow, the media implementation, the build profiles) and
`API-SETUP.md` (the API connection).

## License

Copyright (C) 2026 Jose Cartro. Musly9 is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License version 3 (GPL-3.0-only), see `LICENSE`.
