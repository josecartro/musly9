import { clamp } from "./time";

export interface SoundtrackPosition {
  active: boolean;
  musicTime: number;
}

export function soundtrackPosition(
  videoTime: number,
  offsetSeconds: number,
  soundtrackDuration: number,
): SoundtrackPosition {
  const musicTime = videoTime - Math.max(0, offsetSeconds);
  const active = musicTime >= 0 && musicTime < soundtrackDuration;
  return {
    active,
    musicTime: clamp(musicTime, 0, Math.max(0, soundtrackDuration)),
  };
}
