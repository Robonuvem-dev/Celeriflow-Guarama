import assert from "node:assert/strict";
import test from "node:test";
import { count, eq } from "drizzle-orm";
import { createProcessesPortalsDatabase } from "./helpers/processes-portals-database";
import { withDatabaseTransaction } from "../src/db/transaction";
import { departments, secretariats, employees } from "../src/db/schema/administration";
import { accessProfiles, users } from "../src/db/schema/identity";
import { processTypes, processSubjects, processes, genericWorkflowDefinitions, genericWorkflowStages, genericWorkflowInstances } from "../src/db/schema/processes";
import { tickets, ombudsmans, supportChannels, ombudsmanAccessGrants } from "../src/db/schema/attendance-portals";
import { createGenericWorkflowDefinition, addGenericWorkflowStage, publishGenericWorkflowDefinition } from "../src/lib/protocols/generic-workflow-definition-service";
import { createValidatedProcess } from "../src/lib/protocols/service";
import { ticketScopeCondition, ombudsmanScopeCondition, type AttendanceScopeContext } from "../src/db/repositories/attendance-portals/scope";
import { readProcessConfiguration } from "../src/db/repositories/processes/configuration";
import { nextYearlyCodeDrizzle } from "../src/db/repositories/platform/sequences";
import { sequenceCounters } from "../src/db/schema/sequences";

test("Drizzle/Neon: configuração publicada, abertura atômica, sequência e recortes de Atendimento", async t => {
  const { connection, close } = await createProcessesPortalsDatabase();
  const db = connection.db;
  try {
    const [secretariat] = await db.insert(secretariats).values({ name: "Secretaria de teste" }).returning({ id: secretariats.id });
    const [department] = await db.insert(departments).values({ name: "Setor de teste", secretariatId: secretariat.id }).returning({ id: departments.id });
    const [employee] = await db.insert(employees).values({ name: "Servidor de teste", departmentId: department.id }).returning({ id: employees.id });
    const [profile] = await db.insert(accessProfiles).values({ codigo: "PROCESS_PORTAL_TEST", nome: "Teste", permissoes: "{}" }).returning({ id: accessProfiles.id });
    const [actor] = await db.insert(users).values({ nome: "Operador", email: "process-portals@example.test", perfilId: profile.id }).returning({ id: users.id });
    const [type] = await db.insert(processTypes).values({ name: "Novo tipo opt-in", genericWorkflowEnabled: true }).returning({ id: processTypes.id });
    const [subject] = await db.insert(processSubjects).values({ name: "Assunto de teste", processTypeId: type.id }).returning({ id: processSubjects.id });
    const definition = await withDatabaseTransaction(connection, tx => createGenericWorkflowDefinition(tx, type.id));
    await withDatabaseTransaction(connection, tx => addGenericWorkflowStage(tx, { definitionId: definition.id, position: 1, label: "Recepção", departmentId: department.id, slaCalendarDays: 2, requiresSignedDocument: false, requiredDocumentClassId: null }));

    await t.test("publicação entrega DTOs relacionais e impede mutação posterior", async () => {
      await withDatabaseTransaction(connection, tx => publishGenericWorkflowDefinition(tx, definition.id, actor.id));
      const configuration = await readProcessConfiguration(db);
      const stored = configuration.definitions.find(row => row.id === definition.id)!;
      assert.equal(stored.status, "PUBLISHED");
      assert.equal(stored.processType.name, "Novo tipo opt-in");
      assert.equal(stored.stages[0].department.name, "Setor de teste");
      assert.equal(stored.stages[0].requiredDocumentClass, null);
      assert.equal(configuration.types.find(row => row.id === type.id)?.subjects[0].id, subject.id);
      await assert.rejects(withDatabaseTransaction(connection, tx => addGenericWorkflowStage(tx, { definitionId: definition.id, position: 2, label: "Outra etapa", departmentId: department.id, slaCalendarDays: 1, requiresSignedDocument: false, requiredDocumentClassId: null })), /rascunho/);
      await assert.rejects(db.update(genericWorkflowStages).set({ label: "Alteração indevida" }).where(eq(genericWorkflowStages.definitionId, definition.id)));
      await assert.rejects(db.update(genericWorkflowDefinitions).set({ version: 2 }).where(eq(genericWorkflowDefinitions.id, definition.id)));
    });
    await t.test("falha após abertura reverte processo, workflow e número na mesma conexão", async () => {
      const [{ total: before }] = await db.select({ total: count() }).from(processes);
      await assert.rejects(withDatabaseTransaction(connection, async tx => {
        await createValidatedProcess(tx, employee, actor.id, { processTypeId: type.id, subjectId: subject.id });
        throw new Error("Falha controlada após os writers");
      }), /Falha controlada/);
      const [{ total: after }] = await db.select({ total: count() }).from(processes);
      assert.equal(after, before);
      assert.equal((await db.select().from(genericWorkflowInstances)).length, 0);
      const process = await withDatabaseTransaction(connection, tx => createValidatedProcess(tx, employee, actor.id, { processTypeId: type.id, subjectId: subject.id }));
      assert.match(process.protocolNumber, /000001$/);
      const [instance] = await db.select().from(genericWorkflowInstances).where(eq(genericWorkflowInstances.processId, process.id));
      assert.equal(instance.definitionVersion, definition.version);
      assert.equal(instance.openedByUsuarioId, actor.id);
      assert.equal(instance.instanceTimeZone, "America/Sao_Paulo");
      assert.equal(instance.dueAt?.getTime(), process.expectedCompletionAt?.getTime());
    });
    await t.test("sequência anual de Atendimento participa do rollback da entidade", async () => {
      const year = new Date().getFullYear();
      const options = { key: "ATD_TEST", prefix: "ATD", padding: 6, existingCodes: [{ code: `ATD-${year}-000041` }] };
      await assert.rejects(withDatabaseTransaction(connection, async tx => {
        assert.equal(await nextYearlyCodeDrizzle({ ...options, db: tx }), `ATD-${year}-000042`);
        throw new Error("Reverter sequência");
      }), /Reverter/);
      assert.equal((await db.select().from(sequenceCounters).where(eq(sequenceCounters.key, `ATD_TEST:${year}`))).length, 0);
      assert.equal(await withDatabaseTransaction(connection, tx => nextYearlyCodeDrizzle({ ...options, db: tx })), `ATD-${year}-000042`);
    });
    await t.test("setor restringe tickets; sigilo exige papel ou concessão explícita", async () => {
      const [channel] = await db.insert(supportChannels).values({ name: "Canal de teste" }).returning({ id: supportChannels.id });
      await db.insert(tickets).values([{ id: "ticket-local", ticketNumber: "TST-1", subject: "Local", description: "Local", channelId: channel.id, departmentId: department.id }, { id: "ticket-other", ticketNumber: "TST-2", subject: "Outro", description: "Outro", channelId: channel.id }]);
      await db.insert(ombudsmans).values([{ id: "ordinary", protocolNumber: "OUV-TST-1", type: "Elogio", subject: "Local", description: "Local", channelId: channel.id, departmentId: department.id }, { id: "confidential-local", protocolNumber: "OUV-TST-2", type: "Denúncia", subject: "Sigilosa", description: "Restrita", channelId: channel.id, departmentId: department.id, isConfidential: true }, { id: "confidential-granted", protocolNumber: "OUV-TST-3", type: "Denúncia", subject: "Concessão", description: "Restrita", channelId: channel.id, isConfidential: true }]);
      await db.insert(ombudsmanAccessGrants).values({ ombudsmanId: "confidential-granted", userId: actor.id, grantedById: actor.id, canViewIdentity: false });
      const context: AttendanceScopeContext = { user: { id: actor.id, departmentId: department.id }, attendanceAccess: { isAdmin: false, isManager: false, isOmbudsman: false } };
      const ticketRows = await db.select({ id: tickets.id }).from(tickets).where(ticketScopeCondition(context));
      assert.deepEqual(ticketRows.map(row => row.id), ["ticket-local"]);
      const manifestacoes = await db.select({ id: ombudsmans.id }).from(ombudsmans).where(ombudsmanScopeCondition(context));
      assert.deepEqual(manifestacoes.map(row => row.id).sort(), ["confidential-granted", "ordinary"]);
      const noDepartment = { ...context, user: { ...context.user, departmentId: null } };
      assert.equal((await db.select({ id: tickets.id }).from(tickets).where(ticketScopeCondition(noDepartment))).length, 0);
      assert.deepEqual((await db.select({ id: ombudsmans.id }).from(ombudsmans).where(ombudsmanScopeCondition(noDepartment))).map(row => row.id), ["confidential-granted"]);
    });
  } finally { await close(); }
});
