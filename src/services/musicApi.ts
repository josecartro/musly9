import { File, Paths } from "expo-file-system";
import { EncodingType, writeAsStringAsync } from "expo-file-system/legacy";

import type { GeneratedSoundtrack } from "../domain";
import { apiErrorMessage, parseMusicResponse } from "../lib/musicResponse";
import { clamp } from "../lib/time";
import { wavDurationSeconds } from "../lib/wav";
import { normalizeApiBaseUrl } from "./credentials";

export interface GenerateMusicRequest {
  apiKey: string;
  baseUrl: string;
  prompt: string;
  durationSeconds: number;
  signal?: AbortSignal;
  seed?: number;
}

export async function generateMusic(
  request: GenerateMusicRequest,
): Promise<GeneratedSoundtrack> {
  const prompt = request.prompt.trim();
  if (!prompt) {
    throw new Error("Describe the soundtrack you want.");
  }
  if (!request.apiKey.trim()) {
    throw new Error("Connect an AxForge API key first.");
  }

  const durationSeconds = clamp(Math.ceil(request.durationSeconds), 5, 300);
  const response = await fetch(
    `${normalizeApiBaseUrl(request.baseUrl)}/audio/music`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${request.apiKey.trim()}`,
        "Content-Type": "application/json",
        "x-axforge-region": "eu-se-1",
      },
      body: JSON.stringify({
        model: "minimax-music3",
        prompt,
        duration_s: durationSeconds,
        ...(request.seed === undefined ? {} : { seed: request.seed }),
      }),
      signal: request.signal,
    },
  );

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (!response.ok) {
      throw new Error(`Music generation failed (${response.status}).`);
    }
    throw new Error("The music service returned unreadable data.");
  }

  if (!response.ok) {
    throw new Error(apiErrorMessage(response.status, body));
  }

  const parsed = parseMusicResponse(body);
  const actualDurationSeconds = wavDurationSeconds(parsed.base64);
  const destination = new File(
    Paths.cache,
    `axforge-soundtrack-${Date.now()}.wav`,
  );
  try {
    await writeAsStringAsync(destination.uri, parsed.base64, {
      encoding: EncodingType.Base64,
    });
  } catch (error) {
    if (destination.exists) {
      destination.delete();
    }
    throw error;
  }

  return {
    uri: destination.uri,
    durationSeconds: actualDurationSeconds,
    createdAt: parsed.createdAt,
    format: parsed.format,
  };
}
