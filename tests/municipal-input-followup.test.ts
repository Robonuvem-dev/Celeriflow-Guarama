import test from "node:test";
import assert from "node:assert/strict";
import { regionalActionSchema } from "../src/lib/planejamento/regional-action-input";
test("regionalização distingue ação e subação e normaliza região/código", () => {
  const row = regionalActionSchema.parse({ actionId: "a1", region: " centro ", subactionCode: "s-01", name: "Subação regional", active: true });
  assert.equal(row.region, "CENTRO");
  assert.equal(row.subactionCode, "S-01");
  assert.equal(regionalActionSchema.parse({ ...row, subactionCode: "" }).subactionCode, "");
  assert.equal(regionalActionSchema.safeParse({ ...row, region: " " }).success, false);
  assert.equal(regionalActionSchema.safeParse({ ...row, subactionCode: "../x" }).success, false);
});
