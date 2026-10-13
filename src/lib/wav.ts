const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const HEADER_BYTES = 8 * 1024;

function decodeBase64Prefix(value: string, maximumBytes: number): Uint8Array {
  const compact = value.replace(/\s/g, "");
  const characterLimit = Math.min(
    compact.length - (compact.length % 4),
    Math.ceil(maximumBytes / 3) * 4,
  );
  const bytes: number[] = [];

  for (let index = 0; index < characterLimit; index += 4) {
    const a = BASE64_ALPHABET.indexOf(compact[index]);
    const b = BASE64_ALPHABET.indexOf(compact[index + 1]);
    const third = compact[index + 2];
    const fourth = compact[index + 3];
    const c = third === "=" ? 0 : BASE64_ALPHABET.indexOf(third);
    const d = fourth === "=" ? 0 : BASE64_ALPHABET.indexOf(fourth);

    if (a < 0 || b < 0 || c < 0 || d < 0) {
      throw new Error("The music service returned invalid base64 audio.");
    }

    bytes.push((a << 2) | (b >> 4));
    if (third !== "=") bytes.push(((b & 15) << 4) | (c >> 2));
    if (fourth !== "=") bytes.push(((c & 3) << 6) | d);
    if (bytes.length >= maximumBytes) break;
  }

  return Uint8Array.from(bytes.slice(0, maximumBytes));
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function uint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

/** Reads the real PCM duration from the RIFF/WAV header returned by Music3. */
export function wavDurationSeconds(base64: string): number {
  const bytes = decodeBase64Prefix(base64, HEADER_BYTES);
  if (
    bytes.length < 44 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 4) !== "WAVE"
  ) {
    throw new Error("The music service returned an invalid WAV file.");
  }

  let byteRate = 0;
  let dataSize = 0;
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const chunkType = ascii(bytes, offset, 4);
    const chunkSize = uint32(bytes, offset + 4);
    const chunkStart = offset + 8;

    if (chunkType === "fmt " && chunkSize >= 16 && chunkStart + 12 <= bytes.length) {
      byteRate = uint32(bytes, chunkStart + 8);
    } else if (chunkType === "data") {
      dataSize = chunkSize;
      break;
    }

    const nextOffset = chunkStart + chunkSize + (chunkSize % 2);
    if (nextOffset <= offset || nextOffset > bytes.length) break;
    offset = nextOffset;
  }

  const duration = dataSize && byteRate ? dataSize / byteRate : 0;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("The music service returned a WAV with no measurable audio.");
  }
  return duration;
}
