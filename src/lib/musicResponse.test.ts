import assert from "node:assert/strict";
import test from "node:test";

import { apiErrorMessage, parseMusicResponse } from "./musicResponse";

test("parses the AxForge WAV response", () => {
  const parsed = parseMusicResponse({
    created: 123,
    data: [{ b64_json: "a".repeat(64), format: "wav" }],
  });
  assert.equal(parsed.createdAt, 123);
  assert.equal(parsed.format, "wav");
  assert.equal(parsed.base64.length, 64);
});

test("rejects missing and unsupported audio payloads", () => {
  assert.throws(() => parseMusicResponse({ data: [] }), /no audio/i);
  assert.throws(
    () =>
      parseMusicResponse({
        data: [{ b64_json: "a".repeat(64), format: "mp3" }],
      }),
    /unsupported/i,
  );
});

test("uses useful API errors without inventing details", () => {
  assert.equal(
    apiErrorMessage(503, {}),
    "MiniMax-Music3 is loading or temporarily unavailable.",
  );
  assert.equal(
    apiErrorMessage(400, { detail: "prompt is required" }),
    "prompt is required",
  );
});
