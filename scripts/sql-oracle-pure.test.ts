import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { Decimal } from "../src/db/decimal";
import type { MasterDataCatalog } from "../src/app/app-domain/cadastros/master-data-types";
import { literalContains, sqlOracleValue } from "./sql-oracle";
import { expectedCanonicalIssues, expectedMergeRanking } from "./sql-oracle-policies";
import { capturedProfileAccess, profileDiagnosticError } from "./sql-oracle-profile-diagnostic";
import { expectedMasterMetadata } from "./sql-oracle-master-metadata";
import { currentMasterMetadataReader } from "./sql-oracle-current-master-metadata";

test("physical SQL values retain UTC, exact Decimal/bigint, NULL and opaque JSON", () => {
  assert.equal((sqlOracleValue(1114, "2026-10-28 23:59:59.999") as Date).toISOString(), "2026-10-28T23:59:59.999Z");
  assert.equal((sqlOracleValue(1082, "2026-10-28") as Date).toISOString(), "2026-10-28T00:00:00.000Z");
  assert.equal((sqlOracleValue(1184, "2026-10-28 22:30:00-03") as Date).toISOString(), "2026-10-29T01:30:00.000Z");
  const numeric = sqlOracleValue(1700, "9007199254740993.01");
  assert.ok(numeric instanceof Decimal);
  assert.equal(numeric.toString(), "9007199254740993.01");
  assert.equal(sqlOracleValue(20, "9007199254740993"), 9007199254740993n);
  assert.equal(sqlOracleValue(1114, null), null);
  assert.equal(sqlOracleValue(1700, null), null);
  const json = { when: "2026-10-28T00:00:00.000Z", number: "9007199254740993.01", nested: [null] };
  assert.equal(sqlOracleValue(3802, json), json);
  assert.equal(sqlOracleValue(25, "2026-10-28"), "2026-10-28");
  assert.equal(sqlOracleValue(701, 12.5), 12.5);
});

test("literal patterns escape backslash/percent/underscore without SQL interpolation", () => {
  assert.equal(literalContains("100%_\\end' OR 1=1 --"), "%100\\%\\_\\\\end' OR 1=1 --%");
});

test("captured ranking has golden weights, reason order, exclusions and tie breaks", () => {
  const birthDate = new Date("2000-01-01T00:00:00.000Z");
  const source = { id: "source", fullName: "José da Silva", cpf: "52998224725", email: "A@EXAMPLE.COM", phonePrimary: "(11) 9999-0000", birthDate };
  assert.deepEqual(expectedMergeRanking(source, [source,
    { ...source, id: "archived", status: "Arquivado por mesclagem" },
    { ...source, id: "b", fullName: "JOSE-DA SILVA", email: "a@example.com", phonePrimary: "1199990000" },
    { ...source, id: "a", fullName: "jose da silva" },
    { id: "cpf", fullName: "Diferente", cpf: source.cpf },
    { id: "none", fullName: "Sem evidência", cpf: null },
  ]), [
    { personId: "a", score: 200, reasons: ["NOME_NORMALIZADO", "CPF_IGUAL", "DATA_NASCIMENTO", "EMAIL_NORMALIZADO", "TELEFONE_NORMALIZADO"] },
    { personId: "b", score: 200, reasons: ["NOME_NORMALIZADO", "CPF_IGUAL", "DATA_NASCIMENTO", "EMAIL_NORMALIZADO", "TELEFONE_NORMALIZADO"] },
    { personId: "cpf", score: 100, reasons: ["CPF_IGUAL"] },
  ]);
});

test("captured canonical integrity distinguishes document/role/link failures", () => {
  const issues = expectedCanonicalIssues({
    persons: [{ id: "p1", cpf: "529.982.247-25" }, { id: "p2", cpf: "52998224725" }, { id: "bad", cpf: "11111111111" }],
    companies: [{ id: "c1", cnpj: "04.252.011/0001-10" }],
    taxpayers: [{ id: "t1", taxpayerType: "PJ", personId: "p1", companyId: null }, { id: "t2", taxpayerType: "PF", personId: "p1", companyId: null }],
    suppliers: [{ id: "s1", personId: null, companyId: null }, { id: "s2", personId: "p1", companyId: "c1" }, { id: "s3", personId: "absent", companyId: null }],
    creditors: [{ id: "cr", personId: "p2", companyId: null, supplierId: "s3", document: "000" }],
  });
  assert.deepEqual(issues.map(row => [row.recordType, row.recordId, row.issueType]), [
    ["Creditor", "cr", "CREDITOR_DOCUMENT_MISMATCH"], ["Creditor", "cr", "CREDITOR_SUPPLIER_IDENTITY_MISMATCH"],
    ["Person", "bad", "CANONICAL_DOCUMENT_INVALID"], ["Person", "p1", "CANONICAL_DOCUMENT_DUPLICATE"], ["Person", "p2", "CANONICAL_DOCUMENT_DUPLICATE"],
    ["Supplier", "s1", "CANONICAL_IDENTITY_MISSING"], ["Supplier", "s2", "CANONICAL_IDENTITY_AMBIGUOUS"], ["Supplier", "s3", "CANONICAL_IDENTITY_NOT_FOUND"],
    ["Taxpayer", "t1", "CANONICAL_ROLE_DUPLICATE"], ["Taxpayer", "t1", "TAXPAYER_IDENTITY_TYPE_MISMATCH"], ["Taxpayer", "t2", "CANONICAL_ROLE_DUPLICATE"],
  ]);
  assert.ok(issues.every(row => row.severity === "ALTA" && row.description.length > 20));
});

test("standalone diagnostic captures granular deny-default and individual narrowing", () => {
  const permissions = JSON.stringify({ modules: { CONFIGURACOES: { create: true, update: false, delete: true } } });
  const user = { profileCode: "USER", permissions, modulePermissions: [] };
  assert.deepEqual(capturedProfileAccess(user, true), { canViewProfiles: true, canCreateProfiles: true, canUpdateProfiles: false, canDeleteProfiles: true });
  assert.deepEqual(capturedProfileAccess({ ...user, modulePermissions: [{ code: "CONFIGURACOES", canView: true, canEdit: false }] }, true), { canViewProfiles: true, canCreateProfiles: false, canUpdateProfiles: false, canDeleteProfiles: false });
  assert.deepEqual(capturedProfileAccess({ ...user, permissions: '{"modules":{}}' }, true), { canViewProfiles: false, canCreateProfiles: false, canUpdateProfiles: false, canDeleteProfiles: false });
  assert.deepEqual(capturedProfileAccess({ ...user, permissions: "invalid JSON", modulePermissions: [{ code: "CONFIGURACOES", canView: true, canEdit: true }] }, false), { canViewProfiles: false, canCreateProfiles: true, canUpdateProfiles: true, canDeleteProfiles: true });
  assert.deepEqual(capturedProfileAccess({ ...user, profileCode: "SYSTEM_ADMINISTRATOR" }, true), { canViewProfiles: true, canCreateProfiles: true, canUpdateProfiles: true, canDeleteProfiles: true });
});

test("diagnostic errors do not expose URL, credentials, account or raw message", () => {
  const error = Object.assign(new Error('postgresql://secret:password@host.invalid column "perfilId" does not exist; account@example.invalid'), { code: "42703" });
  const safe = profileDiagnosticError(error);
  assert.deepEqual(safe, { query: "FAILED", name: "Error", code: "42703", missingColumn: "perfilId", inconsistentRelation: undefined });
  assert.doesNotMatch(JSON.stringify(safe), /secret|password|host\.invalid|account@example/);
  assert.equal(profileDiagnosticError({ name: "postgresql://secret", code: "account@example.invalid" }).name, undefined);
  assert.equal(profileDiagnosticError(null).query, "FAILED");
});

test("standalone profile diagnostic sanitizes configuration failure before any pool is created", () => {
  const child = spawnSync(process.execPath, ["--import", "tsx", "scripts/diagnose-profile-page.ts", "private-account@example.invalid"], {
    env: { ...process.env, DATABASE_URL: "not-a-url-with-private-password" }, encoding: "utf8", timeout: 15_000,
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 1);
  assert.equal(child.stdout, "");
  const result = JSON.parse(child.stderr.trim());
  assert.deepEqual(result, { query: "FAILED", name: "TypeError", code: "ERR_INVALID_URL" });
  assert.doesNotMatch(child.stderr, /private-account|private-password|DATABASE_URL|node_modules/);
});

test("all 14 live metadata catalogs agree with frozen fields/columns/option keys", () => {
  const source = readFileSync("src/app/app-domain/cadastros/master-data-page.tsx", "utf8");
  const read = currentMasterMetadataReader(source);
  const catalogs: MasterDataCatalog[] = ["families", "entities", "costCenters", "cities", "neighborhoods", "streets", "banks", "branches", "taxes", "currencies", "products", "cbos", "signers", "legalTexts"];
  const options = Object.fromEntries(["people", "companies", "parents", "entities", "secretariats", "departments", "units", "states", "cities", "neighborhoods", "banks", "employees"].map(key => [key, [{ value: key, label: `${key} option` }]]));
  for (const catalog of catalogs) assert.deepEqual(read(catalog, options), expectedMasterMetadata(catalog, options), catalog);
  const altered = currentMasterMetadataReader(source.replace('label: "Código CBO"', 'label: "Alterado"'));
  assert.notDeepEqual(altered("cbos", options), expectedMasterMetadata("cbos", options));
  const unsupported = currentMasterMetadataReader(source.replace('label: "Código CBO"', 'label: process.env.DATABASE_URL'));
  assert.throws(() => unsupported("cbos", options), /Unknown metadata identifier/);
});
