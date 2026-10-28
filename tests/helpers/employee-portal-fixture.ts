import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { PermissionUser } from "../../src/lib/contracts/identity";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

const fixtureTables = {
  login: ["Employee", "ConfiguracaoModulo"],
  attendance: ["Employee", "AttendanceRecord"],
  career: ["Employee", "ConfiguracaoPerfil", "Usuario", "AuditEvent", "HrPayrollRuleSet", "HrPayrollRule"],
  manifest: ["Payment"],
};

function historicalStatement(source: string, marker: string, terminator = ";") {
  const start = source.indexOf(marker), end = source.indexOf(terminator, start);
  assert.ok(start >= 0 && end >= start, `SQL histórico ausente: ${marker}`);
  return source.slice(start, end + terminator.length);
}

/** Only named, authoritative historical definitions are replayed locally. No
 * generated model metadata, client facades or alterations of physical types. */
export async function createEmployeePortalFixture(kind: keyof typeof fixtureTables) {
  const fixture = await createLocalDrizzleDatabase();
  try {
    const baseline = await readFile(new URL("../../prisma/migrations-ibema/20261009232000_baseline/migration.sql", import.meta.url), "utf8");
    const tables = new Set(fixtureTables[kind]);
    for (const name of tables) await fixture.database.exec(historicalStatement(baseline, `CREATE TABLE "${name}" (`, "\n);"));
    for (const match of baseline.matchAll(/CREATE (?:UNIQUE )?INDEX "[^"]+" ON "([A-Za-z0-9_]+)"[^;]+;/g)) {
      if (tables.has(match[1])) await fixture.database.exec(match[0]);
    }
    for (const match of baseline.matchAll(/ALTER TABLE "([A-Za-z0-9_]+)" ADD CONSTRAINT [^;]+ REFERENCES "([A-Za-z0-9_]+)"[^;]+;/g)) {
      if (tables.has(match[1]) && tables.has(match[2])) await fixture.database.exec(match[0]);
    }
    if (kind === "attendance" || kind === "career") {
      const workforce = await readFile(new URL("../../prisma/migrations-ibema/20261011030000_hr_workforce_foundation/migration.sql", import.meta.url), "utf8");
      const names = kind === "attendance" ? ["HrEmploymentContract", "HrMovement", "HrRightEntry", "HrIntegrationEvent"] : ["HrPortalRequest"];
      for (const name of names) await fixture.database.exec(historicalStatement(workforce, `CREATE TABLE "${name}" (`, "\n);"));
      if (kind === "attendance") {
        for (const name of ["hr_immutable_entry", "hr_protect_event"]) await fixture.database.exec(historicalStatement(workforce, `CREATE FUNCTION ${name}()`, "$$;"));
        for (const name of ["hr_movement_immutable", "hr_right_immutable", "hr_event_immutable"]) await fixture.database.exec(historicalStatement(workforce, `CREATE TRIGGER ${name} `));
      }
    }
    if (kind === "career") {
      const audit = await readFile(new URL("../../prisma/migrations/20260802130000_add_audit_evidence_events/migration.sql", import.meta.url), "utf8");
      await fixture.database.exec(historicalStatement(audit, "CREATE OR REPLACE FUNCTION prevent_audit_event_mutation()", "$$;"));
      await fixture.database.exec(historicalStatement(audit, 'CREATE TRIGGER "AuditEvent_append_only"'));
    }
    return fixture;
  } catch (error) { await fixture.close(); throw error; }
}

export function employeePortalUser(employeeId = "own-employee"): PermissionUser {
  return { id: `user-${employeeId}`, firebaseUid: `verified-${employeeId}`, email: `${employeeId}@example.test`, name: "Servidor", role: "Servidor", profileCode: "SERVIDOR", permissions: JSON.stringify({ modules: { PORTAL_SERVIDOR: { blocked: false } } }), modulePermissions: [], allowedBudgetUnitIds: [], employeeId, departmentId: null, secretariatId: null };
}
