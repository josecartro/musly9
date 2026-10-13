export type AudioMode = "mix" | "replace";

export interface VideoSelection {
  uri: string;
  fileName: string;
  durationSeconds: number;
  width: number;
  height: number;
  hasOriginalAudio: boolean | null;
}

export interface GeneratedSoundtrack {
  uri: string;
  durationSeconds: number;
  createdAt: number;
  format: "wav";
}

export interface ExportSettings {
  mode: AudioMode;
  offsetSeconds: number;
  originalVolume: number;
  musicVolume: number;
}
