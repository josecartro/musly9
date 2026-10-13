import assert from "node:assert/strict";
import test from "node:test";

import { wavDurationSeconds } from "./wav";

function pcmWavBase64(seconds: number): string {
  const sampleRate = 44_100;
  const channels = 2;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const dataSize = Math.round(seconds * byteRate);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return header.toString("base64");
}

test("reads actual stereo PCM duration from a WAV header", () => {
  assert.ok(Math.abs(wavDurationSeconds(pcmWavBase64(15.244)) - 15.244) < 0.001);
});

test("rejects a non-WAV payload", () => {
  assert.throws(
    () => wavDurationSeconds(Buffer.from("not a wav file").toString("base64")),
    /invalid WAV/,
  );
});
