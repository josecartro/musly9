import type {
  CompositionConfig,
  CompositeTrack,
  VolumeKeyframe,
} from "@projectyoked/expo-media-engine";

import type {
  ExportSettings,
  GeneratedSoundtrack,
  VideoSelection,
} from "../domain";
import { clamp } from "./time";

const MAX_OUTPUT_EDGE = 1920;
const MIN_CLIP_SECONDS = 0.05;

export interface CompositionInput {
  video: VideoSelection;
  soundtrack: GeneratedSoundtrack;
  settings: ExportSettings;
  outputUri: string;
}

export function boundedVideoSize(
  width: number,
  height: number,
): { width: number; height: number } {
  const safeWidth = width > 0 ? width : 1080;
  const safeHeight = height > 0 ? height : 1920;
  const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(safeWidth, safeHeight));
  const even = (value: number) =>
    Math.max(2, Math.round((value * scale) / 2) * 2);
  return { width: even(safeWidth), height: even(safeHeight) };
}

function fadeEnvelope(
  duration: number,
): { keyframes: VolumeKeyframe[] } | undefined {
  if (duration < 0.5) {
    return undefined;
  }

  const fadeInEnd = Math.min(0.2, duration / 4);
  const fadeOutStart = Math.max(
    fadeInEnd,
    duration - Math.min(0.75, duration / 3),
  );
  return {
    keyframes: [
      { time: 0, volume: 0 },
      { time: fadeInEnd, volume: 1 },
      { time: fadeOutStart, volume: 1 },
      { time: duration, volume: 0 },
    ],
  };
}

export function createCompositionConfig(
  input: CompositionInput,
): CompositionConfig {
  const { video, soundtrack, settings, outputUri } = input;
  if (!video.uri || !soundtrack.uri || !outputUri) {
    throw new Error("Video, soundtrack, and output paths are required.");
  }
  if (video.durationSeconds <= 0) {
    throw new Error("The selected video has no measurable duration.");
  }

  const offset = clamp(
    settings.offsetSeconds,
    0,
    Math.max(0, video.durationSeconds - MIN_CLIP_SECONDS),
  );
  const availableTimeline = Math.max(
    MIN_CLIP_SECONDS,
    video.durationSeconds - offset,
  );
  const soundtrackDuration = Math.min(
    soundtrack.durationSeconds,
    availableTimeline,
  );
  const dimensions = boundedVideoSize(video.width, video.height);

  const tracks: CompositeTrack[] = [
    {
      type: "video",
      clips: [
        {
          uri: video.uri,
          startTime: 0,
          duration: video.durationSeconds,
          resizeMode: "contain",
        },
      ],
    },
  ];

  // The exporter treats video and audio as separate layers. Add the source
  // video again as an audio layer when the user wants its sound retained.
  if (settings.mode === "mix" && video.hasOriginalAudio !== false) {
    tracks.push({
      type: "audio",
      clips: [
        {
          uri: video.uri,
          startTime: 0,
          duration: video.durationSeconds,
          clipStart: 0,
          volume: clamp(settings.originalVolume, 0, 1),
        },
      ],
    });
  }

  tracks.push({
    type: "audio",
    clips: [
      {
        uri: soundtrack.uri,
        startTime: offset,
        duration: soundtrackDuration,
        clipStart: 0,
        volume: clamp(settings.musicVolume, 0, 1),
        volumeEnvelope: fadeEnvelope(soundtrackDuration),
      },
    ],
  });

  return {
    outputUri,
    width: dimensions.width,
    height: dimensions.height,
    frameRate: 30,
    quality: "high",
    audioBitrate: 192_000,
    enablePassthrough: true,
    tracks,
  };
}
