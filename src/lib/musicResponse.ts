export interface ParsedMusicResponse {
  base64: string;
  createdAt: number;
  format: "wav";
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

export function parseMusicResponse(value: unknown): ParsedMusicResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.data) ||
    value.data.length === 0
  ) {
    throw new Error("The music service returned no audio.");
  }

  const first = value.data[0];
  if (
    !isRecord(first) ||
    typeof first.b64_json !== "string" ||
    first.b64_json.length < 32
  ) {
    throw new Error("The music service returned an invalid audio payload.");
  }
  if (first.format !== "wav") {
    throw new Error(
      `Unsupported soundtrack format: ${String(first.format ?? "unknown")}`,
    );
  }

  return {
    base64: first.b64_json,
    createdAt:
      typeof value.created === "number"
        ? value.created
        : Math.floor(Date.now() / 1000),
    format: "wav",
  };
}

export function apiErrorMessage(status: number, value: unknown): string {
  if (isRecord(value)) {
    const message = value.detail ?? value.error ?? value.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }
  if (status === 401 || status === 403) {
    return "The API key was rejected.";
  }
  if (status === 429) {
    return "The music service is busy. Try again in a moment.";
  }
  if (status === 503) {
    return "MiniMax-Music3 is loading or temporarily unavailable.";
  }
  return `Music generation failed (${status}).`;
}
