import assert from "node:assert/strict";
import test from "node:test";

import { soundtrackPosition } from "./timeline";

test("keeps music paused before its offset", () => {
  assert.deepEqual(soundtrackPosition(3, 5, 42), {
    active: false,
    musicTime: 0,
  });
});

test("maps video time to music time after its offset", () => {
  assert.deepEqual(soundtrackPosition(12.5, 5, 42), {
    active: true,
    musicTime: 7.5,
  });
});

test("stops music after the generated track ends", () => {
  assert.deepEqual(soundtrackPosition(50, 5, 42), {
    active: false,
    musicTime: 42,
  });
});
