import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

// Offline, one-way export of reviewed schema metadata. This never connects to a
// database and never rewrites the private capture or SQL migration authority.
const source = new URL('../.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json', import.meta.url);
const destination = new URL('../tests/fixtures/installed-physical-catalog.json', import.meta.url);
const expectedSha256 = 'bc2cd102e4627e250d00af1420cef46d95dbd954477202044024fdccceca729d';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const bytes = readFileSync(source);
assert.equal(sha256(bytes), expectedSha256, 'Refuse an unreviewed physical catalog capture');
const original = JSON.parse(bytes.toString('utf8')).catalog;
const fields = {
  columns: { schema: 'string', table_name: 'string', name: 'string', type: 'string', not_null: 'boolean', default_expression: 'nullable-string' },
  constraints: { schema: 'string', table_name: 'string', name: 'string', type: 'string', definition: 'string' },
  indexes: { schema: 'string', table_name: 'string', name: 'string', definition: 'string' },
  enums: { schema: 'string', name: 'string', label: 'string', position: 'number' },
};
const catalog = Object.fromEntries(Object.entries(fields).map(([section, whitelist]) => {
  assert.ok(Array.isArray(original[section]), `${section} metadata required`);
  const rows = original[section].filter(row => row.schema === 'public').map(row => Object.fromEntries(Object.entries(whitelist).map(([key, type]) => {
    const value = row[key];
    assert.ok(type === 'nullable-string' ? value === null || typeof value === 'string' : typeof value === type, `${section}.${key} metadata type`);
    return [key, value];
  })));
  return [section, rows];
}));
const exported = {
  formatVersion: 1,
  sourceSha256: expectedSha256,
  catalogSha256: sha256(JSON.stringify(catalog)),
  catalog,
};
const output = `${JSON.stringify(exported)}\n`;
writeFileSync(destination, output);
console.log(JSON.stringify({ fixture: 'tests/fixtures/installed-physical-catalog.json', sourceSha256: expectedSha256, sha256: sha256(output), bytes: Buffer.byteLength(output), counts: Object.fromEntries(Object.entries(catalog).map(([key, rows]) => [key, rows.length])) }));
