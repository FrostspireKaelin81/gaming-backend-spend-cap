import test from "node:test";
import assert from "node:assert/strict";
import { monthlyCapUsd } from "./spend_cap_service.ts";

test("the cap decision includes all three game workload queues", () => {
  const input = { playerAssets: 300, liveEvents: 80, moderationQueue: 120 };
  assert.equal(monthlyCapUsd(input), 25);
  assert.equal(monthlyCapUsd({ ...input, moderationQueue: 500 }), 36);
});
