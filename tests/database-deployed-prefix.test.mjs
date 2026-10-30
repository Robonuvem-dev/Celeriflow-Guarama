import test from "node:test";
import assert from "node:assert/strict";
import { loadMigrationSet } from "../scripts/database-migrate-files.mjs";

test("POC migrations preserve the deployed SQL prefix through receipt 162", () => {
  const set = loadMigrationSet();
  assert.deepEqual(set.future.slice(0, 6).map(item => item.name), [
    "20261028193000_construction_document_rejection",
    "20261028193100_notification_recipient_dedupe",
    "20261029173000_digital_signature_module",
    "20261029190000_signature_central",
    "20261029190100_signature_central_a1",
    "20261030120000_signature_central_document_types",
  ]);
  assert.equal(set.migrations[161].name, "20261030120000_signature_central_document_types");
  assert.equal(set.migrations[162].name, "20261030120001_asset_catalog_records");
});
