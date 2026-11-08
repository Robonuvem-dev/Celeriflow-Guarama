import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { databaseConnection } from "../../src/db/client";
import { findIdentityByFirebaseUid } from "../../src/db/repositories/platform/identity";
import type { AppContext } from "../../src/lib/platform/tenant-context";

/** Reuses an existing verified application identity; never creates credentials. */
export async function populationContext(): Promise<AppContext> {
  const [actor] = (await databaseConnection.db.execute<{ firebaseUid: string }>(sql`SELECT u."firebaseUid" FROM "Usuario" u JOIN "ConfiguracaoPerfil" p ON p.id=u."perfilId" WHERE u.ativo AND p.ativo AND p.codigo='SYSTEM_ADMINISTRATOR' AND u."firebaseUid" IS NOT NULL ORDER BY u.id LIMIT 1`)).rows;
  assert.ok(actor?.firebaseUid, "Administrador ativo vinculado ao Firebase não encontrado.");
  const identity = await findIdentityByFirebaseUid(databaseConnection.db, actor.firebaseUid);
  assert.ok(identity?.ativo && identity.perfil.codigo === "SYSTEM_ADMINISTRATOR");
  return { database: databaseConnection.db, user: { id: identity.id, firebaseUid: actor.firebaseUid, email: identity.email, name: identity.nome, role: identity.perfil.nome, profileCode: identity.perfil.codigo, permissions: identity.perfil.permissoes, modulePermissions: identity.modulePermissions, allowedBudgetUnitIds: identity.allowedBudgetUnitIds, employeeId: identity.employee?.id ?? null, departmentId: identity.employee?.departmentId ?? null, secretariatId: identity.employee?.secretariatId ?? null } };
}
