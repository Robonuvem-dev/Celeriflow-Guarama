import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { expectedFoundationChecksum, reconstructFoundationBytes } from "../scripts/restore-hr-foundation-bytes.mjs";

test("restaura os bytes históricos mistos de LF/CRLF sem alterar o SQL", () => {
  const current = readFileSync("prisma/migrations-ibema/20261011030000_hr_workforce_foundation/migration.sql");
  const lf = current.toString("utf8").replaceAll("\r\n", "\n");
  const original = reconstructFoundationBytes(Buffer.from(lf));
  assert.equal(createHash("sha256").update(original).digest("hex"), expectedFoundationChecksum);
  assert.equal(original.toString("utf8").replaceAll("\r\n", "\n"), lf);
  assert.deepEqual(reconstructFoundationBytes(Buffer.from(lf.replaceAll("\n", "\r\n"))), original);
  assert.deepEqual(reconstructFoundationBytes(original), original);
  assert.equal(original.toString("utf8").match(/\r\n/g)?.length, 97);
});

test("não autoriza reconstrução sobre SQL alterado, truncado ou com BOM", () => {
  const current = readFileSync("prisma/migrations-ibema/20261011030000_hr_workforce_foundation/migration.sql");
  assert.throws(() => reconstructFoundationBytes(Buffer.concat([current, Buffer.from("-- SQL diferente\n")])));
  assert.throws(() => reconstructFoundationBytes(current.subarray(0, current.length - 1)));
  assert.throws(() => reconstructFoundationBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), current])));
});
