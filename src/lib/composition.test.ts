import assert from "node:assert/strict";
import test from "node:test";

import type { GeneratedSoundtrack, VideoSelection } from "../domain";
import { boundedVideoSize, createCompositionConfig } from "./composition";

const video: VideoSelection = {
  uri: "file:///video.mp4",
  fileName: "video.mp4",
  durationSeconds: 42,
  width: 3840,
  height: 2160,
  hasOriginalAudio: true,
};

const soundtrack: GeneratedSoundtrack = {
  uri: "file:///music.wav",
  durationSeconds: 42,
  createdAt: 1,
  format: "wav",
};

test("bounds output dimensions while preserving aspect ratio", () => {
  assert.deepEqual(boundedVideoSize(3840, 2160), { width: 1920, height: 1080 });
  assert.deepEqual(boundedVideoSize(1080, 1920), { width: 1080, height: 1920 });
});

test("mix mode includes original audio as a separate track", () => {
  const config = createCompositionConfig({
    video,
    soundtrack,
    outputUri: "file:///output.mp4",
    settings: {
      mode: "mix",
      offsetSeconds: 5,
      originalVolume: 0.6,
      musicVolume: 0.8,
    },
  });

  assert.equal(config.tracks.length, 3);
  assert.equal(config.tracks[1].type, "audio");
  assert.equal(config.tracks[1].clips[0].uri, video.uri);
  assert.equal(config.tracks[1].clips[0].volume, 0.6);
  assert.equal(config.tracks[2].clips[0].startTime, 5);
  assert.equal(config.tracks[2].clips[0].duration, 37);
});

test("replace mode omits original audio", () => {
  const config = createCompositionConfig({
    video,
    soundtrack,
    outputUri: "file:///output.mp4",
    settings: {
      mode: "replace",
      offsetSeconds: 0,
      originalVolume: 1,
      musicVolume: 1,
    },
  });

  assert.equal(config.tracks.length, 2);
  assert.equal(config.tracks[0].type, "video");
  assert.equal(config.tracks[1].type, "audio");
  assert.equal(config.tracks[1].clips[0].uri, soundtrack.uri);
});

test("known silent videos skip their original audio track", () => {
  const config = createCompositionConfig({
    video: { ...video, hasOriginalAudio: false },
    soundtrack,
    outputUri: "file:///output.mp4",
    settings: {
      mode: "mix",
      offsetSeconds: 0,
      originalVolume: 1,
      musicVolume: 1,
    },
  });
  assert.equal(config.tracks.length, 2);
});
