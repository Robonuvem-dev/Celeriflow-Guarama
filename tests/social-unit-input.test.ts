import assert from "node:assert/strict";
import test from "node:test";
import { parseSocialUnitInput } from "../src/lib/social/unit-input";

test("coordenadas exigem par válido e limites geográficos", () => {
  const base = { name: "CRAS Centro", type: "CRAS" };
  assert.throws(() => parseSocialUnitInput({ ...base, latitude: "-25" }));
  assert.throws(() => parseSocialUnitInput({ ...base, latitude: "91", longitude: "0" }));
  assert.throws(() => parseSocialUnitInput({ ...base, latitude: "0", longitude: "181" }));
  assert.equal(parseSocialUnitInput({ ...base, latitude: "-25.4", longitude: "-53.1" }).latitude, -25.4);
});

test("implantação rejeita datas inexistentes e preserva campos omitidos", () => {
  const base = { name: "CRAS Centro", type: "CRAS" };
  assert.throws(() => parseSocialUnitInput({ ...base, implementationDate: "2026-02-30" }));
  assert.equal(parseSocialUnitInput(base).identificationCode, undefined);
  assert.equal(parseSocialUnitInput({ ...base, identificationCode: " " }).identificationCode, null);
});
