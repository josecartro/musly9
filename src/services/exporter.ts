import MediaEngine from "@projectyoked/expo-media-engine";
import { File, Paths } from "expo-file-system";
import { Asset, requestPermissionsAsync } from "expo-media-library";

import type {
  ExportSettings,
  GeneratedSoundtrack,
  VideoSelection,
} from "../domain";
import { createCompositionConfig } from "../lib/composition";

export interface ExportVideoRequest {
  video: VideoSelection;
  soundtrack: GeneratedSoundtrack;
  settings: ExportSettings;
}

export interface ExportedVideo {
  uri: string;
  assetId: string;
}

function fileUri(value: string): string {
  return value.startsWith("file://") ? value : `file://${value}`;
}

export async function exportVideoToPhotos(
  request: ExportVideoRequest,
): Promise<ExportedVideo> {
  if (!MediaEngine.isAvailable()) {
    throw new Error(
      "Video export needs the AxForge development build; it is unavailable in Expo Go.",
    );
  }

  const destination = new File(Paths.cache, `axforge-video-${Date.now()}.mp4`);
  const config = createCompositionConfig({
    ...request,
    outputUri: destination.uri,
  });

  const result = fileUri(await MediaEngine.composeCompositeVideo(config));
  const output = new File(result);
  if (!output.exists || !output.size) {
    throw new Error("The video exporter finished without producing a file.");
  }

  const permission = await requestPermissionsAsync(true);
  if (!permission.granted) {
    throw new Error("Allow photo-library access to save the exported video.");
  }

  const asset = await Asset.create(result);
  return { uri: result, assetId: asset.id };
}
