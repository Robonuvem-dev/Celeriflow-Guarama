import assert from "node:assert/strict";
import test from "node:test";
import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { createId } from "../src/db/ids";
import { getPostgresError, PersistenceError, translateDatabaseError } from "../src/db/errors";
import { accessProfiles, modules, userModulePermissions, users } from "../src/db/schema/identity";
import { departments, employees, secretariats } from "../src/db/schema/administration";
import { auditEvents } from "../src/db/schema/audit";
import { instanceParameters, systemInstances } from "../src/db/schema/instance-configuration";
import { countProfileUsers, countSystemAdministrators, deleteAccessProfile, deleteManagedUser, findAccessProfile, findActiveUserEmployee, findDuplicateProfileName, findManagedUser, findManagedUserLink, listProfilesWithLegacyUsers, loadUserAdministration, saveAccessProfile, saveManagedUser, setAccessProfileStatus, setManagedUserStatus } from "../src/db/repositories/platform/system-administration";
import { saveInstanceParameterChanges } from "../src/db/repositories/platform/instance-configuration";
import { findReportTemplate, saveReportTemplateVersion } from "../src/db/repositories/platform/report-template";
import { createReportTemplateFingerprint, createReportTemplatePresentation } from "../src/lib/reports/report-template";

config({ path: ".env.local", quiet: true }); config({ quiet: true });

test("Administração de acesso no Neon: vínculos, permissões legadas, JSON e auditoria atômica", { skip: process.env.DRIZZLE_VERIFY_DATABASE !== "1", timeout: 120_000 }, async t => {
  assert.ok(process.env.DATABASE_URL);
  const connection = createDatabaseConnection(process.env.DATABASE_URL);
  const profileId = createId(), actorId = createId(), employeeId = createId(), moduleId = createId(), instanceId = createId(), templateScope = createId();
  const abort = new Error("expected system-administration fixture rollback");
  let targetId = "", createdProfileId = "";
  try {
    await assert.rejects(withDatabaseTransaction(connection, async tx => {
      await tx.insert(accessProfiles).values({ id: profileId, codigo: profileId, nome: `Acesso ${profileId}`, permissoes: "{}" });
      await tx.insert(users).values({ id: actorId, nome: "Ator da verificação", email: `${actorId}@example.invalid`, perfilId: profileId });
      const [secretariat] = await tx.insert(secretariats).values({ name: "Secretaria da verificação" }).returning();
      const [department] = await tx.insert(departments).values({ name: "Setor da verificação", secretariatId: secretariat.id }).returning();
      await tx.insert(employees).values({ id: employeeId, name: "Servidor da verificação", departmentId: department.id, secretariatId: secretariat.id });
      await tx.insert(modules).values({ id: moduleId, codigo: moduleId, nome: "Módulo da verificação" });
      await tx.insert(systemInstances).values({ id: instanceId, nomePrefeitura: "Instância de verificação", municipio: "Verificação", uf: "PR" });

      await t.test("usuário mantém ID, identidade Firebase e lotação; edição remove ACL individual na mesma transação", async () => {
        const input = { nome: "Usuário da verificação", email: `${createId()}@example.invalid`, firebaseUid: createId(), perfilId: profileId, employeeId, ativo: true };
        targetId = await saveManagedUser(tx, input, actorId);
        await tx.insert(userModulePermissions).values({ usuarioId: targetId, moduloId: moduleId, canView: false, canEdit: true });
        const before = await findManagedUser(tx, targetId);
        assert.ok(before); assert.equal(before.employeeId, employeeId);
        assert.equal(before.perfil.codigo, profileId);
        assert.deepEqual(await findManagedUserLink(tx, "email", input.email), { id: targetId });
        assert.deepEqual(await findManagedUserLink(tx, "employeeId", employeeId), { id: targetId });
        assert.deepEqual(await findActiveUserEmployee(tx, employeeId), { id: employeeId, secretariatId: secretariat.id });
        const listing = await loadUserAdministration(tx, `${actorId}@example.invalid`, "SYSTEM_ADMINISTRATOR");
        const listed = listing.usuarios.find(row => row.id === targetId);
        assert.equal(listed?.employee?.department?.id, department.id);
        assert.equal(listed?.employee?.secretariat?.id, secretariat.id);
        const legacy = (await listProfilesWithLegacyUsers(tx, "SYSTEM_ADMINISTRATOR")).find(row => row.id === profileId);
        assert.ok(legacy?.usuarios.some(user => user.permissoesModulo.some(grant => grant.modulo.codigo === moduleId && grant.canEdit && !grant.canView)));
        assert.equal(await saveManagedUser(tx, { ...input, nome: "Usuário editado" }, actorId, targetId), targetId);
        const after = await findManagedUser(tx, targetId);
        assert.ok(after); assert.equal(after.nome, "Usuário editado");
        assert.equal(after.firebaseUid, before.firebaseUid); assert.equal(after.createdAt.getTime(), before.createdAt.getTime());
        assert.ok(after.updatedAt >= before.updatedAt);
        assert.deepEqual(await tx.select().from(userModulePermissions).where(eq(userModulePermissions.usuarioId, targetId)), []);
        await setManagedUserStatus(tx, targetId, false, input.firebaseUid, actorId);
        assert.equal((await findManagedUser(tx, targetId))?.ativo, false);
        assert.equal(await countProfileUsers(tx, profileId), 2);
        assert.equal(await countSystemAdministrators(tx, profileId), 1);
      });

      await t.test("falha de auditoria reverte atualização do usuário e exclusão de permissões", async () => {
        await tx.insert(userModulePermissions).values({ usuarioId: targetId, moduloId: moduleId, canView: true });
        const before = await findManagedUser(tx, targetId);
        assert.ok(before);
        await assert.rejects(tx.transaction(nested => saveManagedUser(nested, { ...before, nome: "Não deve persistir", firebaseUid: before.firebaseUid! }, "missing-audit-actor", targetId)), error => getPostgresError(error)?.code === "23503");
        assert.deepEqual(await findManagedUser(tx, targetId), before);
        assert.equal((await tx.select().from(userModulePermissions).where(eq(userModulePermissions.usuarioId, targetId))).length, 1);
        const foreignKeyError = (error: unknown) => {
          const translated = translateDatabaseError(error);
          assert.ok(translated instanceof PersistenceError, JSON.stringify(getPostgresError(error)));
          assert.equal(translated.kind, "foreign-key");
          return true;
        };
        await assert.rejects(tx.transaction(nested => deleteManagedUser(nested, actorId, actorId)), foreignKeyError);
        await assert.rejects(tx.transaction(nested => deleteAccessProfile(nested, profileId, actorId)), foreignKeyError);
      });

      await t.test("perfil mantém código, versão e nulabilidade; status e exclusão são auditados", async () => {
        const codigo = createId();
        createdProfileId = await saveAccessProfile(tx, { codigo, nome: `Perfil ${codigo}`, descricao: null, permissoes: "{}", ativo: true }, actorId);
        const before = await findAccessProfile(tx, createdProfileId);
        assert.ok(before);
        assert.deepEqual(await findDuplicateProfileName(tx, before.nome.toUpperCase()), { id: createdProfileId });
        assert.equal(await findDuplicateProfileName(tx, before.nome, createdProfileId), null);
        await saveAccessProfile(tx, { codigo: "IGNORED_ON_UPDATE", nome: before.nome, descricao: "Descrição", permissoes: '{"modules":{}}', ativo: true }, actorId, createdProfileId);
        assert.equal((await findAccessProfile(tx, createdProfileId))?.codigo, codigo);
        await setAccessProfileStatus(tx, createdProfileId, false, actorId);
        assert.equal(await findAccessProfile(tx, createdProfileId, true), null);
        await assert.rejects(tx.transaction(nested => deleteAccessProfile(nested, createdProfileId, "missing-audit-actor")), error => getPostgresError(error)?.code === "23503");
        assert.ok(await findAccessProfile(tx, createdProfileId));
        await deleteAccessProfile(tx, createdProfileId, actorId);
        assert.equal(await findAccessProfile(tx, createdProfileId), null);
        await assert.rejects(tx.transaction(nested => setAccessProfileStatus(nested, createdProfileId, true, actorId)), error => error instanceof PersistenceError && error.kind === "not-found");
      });

      await t.test("parâmetros mantêm tipos JSON e ID no upsert; falha tardia reverte lote e auditoria", async () => {
        await saveInstanceParameterChanges(tx, instanceId, [["WORKFLOW_DEFAULT_SLA_DAYS", 15], ["REPORT_INCLUDE_EMISSION_METADATA", false], ["NOTIFICATION_DEFAULT_PRIORITY", "ALTA"]], actorId);
        const before = await tx.select().from(instanceParameters).where(eq(instanceParameters.configuracaoInstanciaId, instanceId));
        assert.equal(before.find(row => row.chave === "WORKFLOW_DEFAULT_SLA_DAYS")?.valor, 15);
        assert.equal(before.find(row => row.chave === "REPORT_INCLUDE_EMISSION_METADATA")?.valor, false);
        assert.equal(before.find(row => row.chave === "NOTIFICATION_DEFAULT_PRIORITY")?.valor, "ALTA");
        await saveInstanceParameterChanges(tx, instanceId, [["WORKFLOW_DEFAULT_SLA_DAYS", 20]], actorId);
        const [updated] = await tx.select().from(instanceParameters).where(eq(instanceParameters.id, before.find(row => row.chave === "WORKFLOW_DEFAULT_SLA_DAYS")!.id));
        assert.equal(updated.valor, 20); assert.equal(updated.createdAt.getTime(), before.find(row => row.id === updated.id)!.createdAt.getTime());
        const eventsBefore = (await tx.select().from(auditEvents).where(eq(auditEvents.actorUsuarioId, actorId))).length;
        await assert.rejects(tx.transaction(async nested => {
          await saveInstanceParameterChanges(nested, instanceId, [["WORKFLOW_DEFAULT_SLA_DAYS", 30]], actorId);
          await saveInstanceParameterChanges(nested, instanceId, [["REPORT_INCLUDE_EMISSION_METADATA", true]], "missing-audit-actor");
        }), error => getPostgresError(error)?.code === "23503");
        const after = await tx.select().from(instanceParameters).where(eq(instanceParameters.configuracaoInstanciaId, instanceId));
        assert.equal(after.find(row => row.chave === "WORKFLOW_DEFAULT_SLA_DAYS")?.valor, 20);
        assert.equal(after.find(row => row.chave === "REPORT_INCLUDE_EMISSION_METADATA")?.valor, false);
        assert.equal((await tx.select().from(auditEvents).where(eq(auditEvents.actorUsuarioId, actorId))).length, eventsBefore);
        const types = await tx.execute<{ chave: string; type: string }>(sql`SELECT chave,jsonb_typeof(valor) AS type FROM "ConfiguracaoParametroInstancia" WHERE "configuracaoInstanciaId"=${instanceId}`);
        assert.deepEqual(Object.fromEntries(types.rows.map(row => [row.chave, row.type])), { WORKFLOW_DEFAULT_SLA_DAYS: "number", REPORT_INCLUDE_EMISSION_METADATA: "boolean", NOTIFICATION_DEFAULT_PRIORITY: "string" });
      });

      await t.test("modelo de relatório mantém ID, versão/fingerprint e reverte por falha de auditoria", async () => {
        const values = { version: 1, header: `Verificação ${templateScope}`, footer: "Rodapé", orientation: "PORTRAIT" as const, includeEmissionMetadata: false };
        const firstVersion = { ...values, fingerprint: createReportTemplateFingerprint(values) };
        assert.equal(await findReportTemplate(tx, templateScope), null);
        await saveReportTemplateVersion(tx, templateScope, firstVersion, actorId);
        const before = await findReportTemplate(tx, templateScope);
        assert.ok(before);
        assert.deepEqual(createReportTemplatePresentation(before), firstVersion);
        const secondValues = { ...values, version: 2, orientation: "LANDSCAPE" as const, includeEmissionMetadata: true };
        const secondVersion = { ...secondValues, fingerprint: createReportTemplateFingerprint(secondValues) };
        await saveReportTemplateVersion(tx, templateScope, secondVersion, actorId);
        const after = await findReportTemplate(tx, templateScope);
        assert.ok(after); assert.equal(after.id, before.id); assert.equal(after.createdAt.getTime(), before.createdAt.getTime());
        assert.deepEqual(createReportTemplatePresentation(after), secondVersion);
        await assert.rejects(tx.transaction(nested => saveReportTemplateVersion(nested, templateScope, firstVersion, "missing-audit-actor")), error => getPostgresError(error)?.code === "23503");
        assert.deepEqual(await findReportTemplate(tx, templateScope), after);
      });

      await t.test("exclusão permitida elimina ACL por cascade e mantém evidência do alvo", async () => {
        await deleteManagedUser(tx, targetId, actorId);
        assert.equal(await findManagedUser(tx, targetId), null);
        assert.deepEqual(await tx.select().from(userModulePermissions).where(eq(userModulePermissions.usuarioId, targetId)), []);
        assert.ok((await tx.select().from(auditEvents).where(eq(auditEvents.targetId, targetId))).length >= 3);
      });
      throw abort;
    }, { timeoutMs: 90_000 }), error => error === abort);
    for (const id of [actorId, targetId]) assert.equal(await findManagedUser(connection.db, id), null);
    assert.equal(await findAccessProfile(connection.db, profileId), null);
    assert.deepEqual(await connection.db.select().from(systemInstances).where(eq(systemInstances.id, instanceId)), []);
    assert.deepEqual(await connection.db.select().from(auditEvents).where(eq(auditEvents.actorUsuarioId, actorId)), []);
    assert.equal(await findReportTemplate(connection.db, templateScope), null);
  } finally { await connection.pool.end(); }
});
