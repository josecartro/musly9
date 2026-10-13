# AxForge Soundtrack

A focused iOS and Android editor for adding an AxForge-generated soundtrack to a video.

## Flow

1. Pick or record a video up to five minutes.
2. Describe the music and generate it with `POST /v1/audio/music`.
3. Preview and move the soundtrack start time.
4. Mix it with the video's original sound or replace that sound.
5. Export the result to the device photo library.

The customer-facing screen identifies MiniMax-Music3 and labels its output as machine-generated, as required by the model licence.

## Local setup

This app contains a native media exporter and cannot run in Expo Go. Use an Expo development build.

```sh
npm install
npm run typecheck
npm test
npm run prebuild
npm run android
```

Build iOS with `npm run ios` on macOS, or use an EAS development build. Enter an AxForge API key in the app's connection sheet; it is stored in iOS Keychain or Android Keystore. The base URL defaults to `https://api.axforge.ai/v1` and can be overridden with `EXPO_PUBLIC_AXFORGE_API_BASE_URL`.

The included `eas.json` has development, internal-preview, and production profiles. Run `eas build:configure` once after attaching the app to the AxForge Expo account.

Do not compile a shared production API key into the app. Before public distribution, replace the prototype's per-device API-key entry with AxForge user login and short-lived user-scoped tokens.

## Media implementation

- Preview: `expo-video` and `expo-audio`, synchronized against the video clock.
- Export: `@projectyoked/expo-media-engine`, isolated behind `src/services/exporter.ts`.
- iOS export: AVFoundation.
- Android export: MediaCodec/MediaMuxer.
- Generated response: base64-encoded 32 kHz stereo WAV, written to the app cache.

The exporter dependency is pinned to an exact prerelease version. Test export on representative physical iOS and Android devices before store release.
