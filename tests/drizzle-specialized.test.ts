import assert from "node:assert/strict";
import test from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createSpecializedDrizzleFixture } from "./helpers/specialized-drizzle-fixture";
import { withDatabaseTransaction } from "../src/db/transaction";
import { createId } from "../src/db/ids";
import { Decimal } from "../src/db/decimal";
import { createCultureSpaceReservation } from "../src/db/repositories/culture/reservations";
import { getCulturalManagement, listCulturalDocuments, listCulturalEvents, listCulturalReservations } from "../src/db/repositories/culture/queries";
import { saveSecurityItem } from "../src/db/repositories/security-mobility/commands";
import { listSecurityGuards } from "../src/db/repositories/security-mobility/queries";
import { appendControlEvent, firstControlEvent, getControlPlan, listControlPlans, lockControlPlan } from "../src/db/repositories/internal-control/records";
import { culturalEvents, culturalIncentiveProjects, culturalReservations, culturalSpaces } from "../src/db/schema/culture";
import { securityGuards, trafficTickets } from "../src/db/schema/security-mobility";
import { controlEvents, controlPlans } from "../src/db/schema/internal-control";
import { people } from "../src/db/schema/people";
import { accessProfiles, users } from "../src/db/schema/identity";
import { auditEvents } from "../src/db/schema/audit";
import { sequenceCounters } from "../src/db/schema/sequences";
import { insertAuditEvent } from "../src/db/repositories/platform/audit";
import { auditEventTypes } from "../src/lib/contracts/audit";

function postgresConstraintError(code: string, constraint: string) {
  return (error: unknown): boolean => {
    while (error instanceof Error) {
      if ("code" in error && error.code === code && "constraint" in error && error.constraint === constraint) return true;
      error = error.cause;
    }
    return false;
  };
}

// Sequential, standalone local database with historical SQL and the production
// Neon/Drizzle driver. Every domain write and counter allocation rolls back.
test("especializados PostgreSQL local: reservas, sequências, dinheiro, JSON, relações e rollback", {
  timeout: 180_000,
}, async t => {
  const fixture = await createSpecializedDrizzleFixture();
  const { connection } = fixture;
  const personId = createId(), spaceId = createId(), eventId = createId(), planId = createId(), projectId = createId(), ticketId = createId();
  const profileId = createId(), userId = createId();
  const guardTitle = `Fixture guarda ${personId}`;
  const counterKey = `seguranca-guarda:${new Date().getFullYear()}`;
  const rollback = new Error("specialized fixture rollback");
  try {
    const counterBefore = await connection.db.select().from(sequenceCounters).where(eq(sequenceCounters.key, counterKey));
    await assert.rejects(withDatabaseTransaction(connection, async tx => {
      await tx.insert(accessProfiles).values({ id: profileId, codigo: `FIXTURE_${profileId}`, nome: "Fixture controle", permissoes: "{}" });
      await tx.insert(users).values({ id: userId, nome: "Fixture controlador", email: `${userId}@example.test`, perfilId: profileId });
      await tx.insert(people).values({ id: personId, fullName: "Fixture cultura", status: "Ativo" });
      await tx.insert(culturalSpaces).values({ id: spaceId, nome: "Fixture espaço", tipo: "Teatro", status: "Disponível" });
      await tx.insert(culturalEvents).values({ id: eventId, nome: "Fixture evento", tipo: "Oficina", data: new Date("2099-10-20T12:00:00Z"), spaceId });
      await t.test("reserva preserva fronteira de período, vínculos, datas e mensagem de colisão", async () => {
        const input = { spaceId, personId, eventId, purpose: "Ensaio", startsAt: new Date("2099-10-20T12:00:00Z"), endsAt: new Date("2099-10-20T13:00:00Z"), protocolNumber: "FIXTURE-1" };
        const first = await createCultureSpaceReservation(tx, input);
        assert.equal(first.personId, personId);
        assert.equal(first.notes, "Origem: Autoatendimento / FIXTURE-1");
        assert.equal(first.startsAt.toISOString(), input.startsAt.toISOString());
        await assert.rejects(createCultureSpaceReservation(tx, { ...input, startsAt: new Date("2099-10-20T12:30:00Z") }), /Já existe uma reserva/);
        await createCultureSpaceReservation(tx, { ...input, startsAt: input.endsAt, endsAt: new Date("2099-10-20T14:00:00Z") });
        await assert.rejects(createCultureSpaceReservation(tx, { ...input, personId: undefined }), /pessoa ou empresa/);
        const reservations = (await listCulturalReservations(tx)).filter(row => row.spaceId === spaceId);
        assert.equal(reservations.length, 2);
        assert.equal(reservations[0].person?.fullName, "Fixture cultura");
        const event = (await listCulturalEvents(tx)).find(row => row.id === eventId);
        assert.equal(event?.reservas.length, 2);
        assert.ok(event?.reservas[0].startsAt instanceof Date);
        const [, spaces] = await getCulturalManagement(tx);
        assert.equal(spaces.find(row => row.id === spaceId)?.asset, null);
      });
      await t.test("sequência e registro participam da mesma transação e preservam formato CUID/código", async () => {
        await saveSecurityItem(tx, "guarda", { code: "", title: guardTitle, type: "Guarda Municipal", status: "Ativo", isActive: true });
        const row = (await listSecurityGuards(tx)).find(row => row.nome === guardTitle);
        assert.ok(row);
        assert.match(row.id, /^c[a-z0-9]{24}$/);
        assert.match(row.matricula, new RegExp(`^GCM-${new Date().getFullYear()}-[0-9]{4,}$`));
        await assert.rejects(tx.transaction(async nested => {
          await saveSecurityItem(nested, "guarda", { code: row.matricula, title: `${guardTitle}-duplicado`, type: "Guarda Municipal", status: "Ativo", isActive: true });
        }), postgresConstraintError("23505", "SegurancaGuarda_matricula_key"));
        assert.equal((await tx.select().from(securityGuards).where(eq(securityGuards.nome, `${guardTitle}-duplicado`))).length, 0);
      });
      await t.test("documento cultural serializa timestamp sem zona como UTC preservando metadados e dono", async () => {
        const documentId = createId(), linkId = createId();
        await tx.execute(sql`INSERT INTO "Document" (id, title, "documentType", "fileUrl", status, "updatedAt") VALUES (${documentId}, 'Comprovante cultural', 'Ata', '/fixture/culture.pdf', 'Válido', TIMESTAMP '2026-10-19 12:34:56.789')`);
        await tx.execute(sql`INSERT INTO "CulturaEventoDocumento" (id, "eventId", "documentId", purpose, "createdAt") VALUES (${linkId}, ${eventId}, ${documentId}, 'Comprovante', TIMESTAMP '2026-10-19 12:34:56.789')`);
        const document = (await listCulturalDocuments(tx)).find(row => row.id === linkId);
        assert.deepEqual(document, { id: linkId, purpose: "Comprovante", ownerType: "Evento", ownerName: "Fixture evento", createdAt: "2026-10-19T12:34:56.789Z", document: { title: "Comprovante cultural", documentType: "Ata", status: "Válido", folder: null } });
      });
      await t.test("numéricos 18,2 mantêm precisão acima do inteiro seguro", async () => {
        const amount = new Decimal("9007199254740991.23");
        await tx.insert(culturalIncentiveProjects).values({ id: projectId, codigoEdital: "TEST", nomeEdital: "Fixture", tituloProjeto: "Fixture", proponenteNome: "Fixture", proponenteCpfCnpj: personId, categoriaCultural: "Música", valorSolicitado: amount, valorAprovado: amount });
        await tx.insert(trafficTickets).values({ id: ticketId, numeroAit: ticketId, placaVeiculo: "ABC1D23", codigoCtb: "TEST", descricaoInfracao: "Fixture", valorMulta: amount, geolocalizacao: "0,0", agenteMatricula: "TEST" });
        const [project] = await tx.select().from(culturalIncentiveProjects).where(eq(culturalIncentiveProjects.id, projectId));
        const [ticket] = await tx.select().from(trafficTickets).where(eq(trafficTickets.id, ticketId));
        assert.equal(project.valorSolicitado.toFixed(2), "9007199254740991.23");
        assert.equal(ticket.valorMulta.toFixed(2), "9007199254740991.23");
      });
      await t.test("controle aplica escopo vazio, memória JSON e rollback do evento sem alterar plano", async () => {
        await tx.insert(controlPlans).values({ id: planId, title: "Fixture controle", reference: "Teste", ownerId: userId });
        await lockControlPlan(tx, planId);
        const snapshot = { idempotencyKey: personId, nullable: null, dates: ["2026-10-28"] };
        const event = await appendControlEvent(tx, { planId, eventType: "FIXTURE", actorId: userId, reason: "Memória", snapshot });
        assert.equal(event.actorId, userId);
        assert.deepEqual(event.snapshot, snapshot);
        assert.ok(event.createdAt instanceof Date);
        await insertAuditEvent(tx, { actorUsuarioId: userId, eventType: auditEventTypes.administrativeMutation, targetType: "INTERNAL_CONTROL_EVENT", targetId: event.id });
        // A cultural person is not an audit user. Require the real FK failure,
        // rather than accepting an unrelated driver/trigger/fixture rejection.
        await assert.rejects(tx.transaction(async nested => {
          await insertAuditEvent(nested, { actorUsuarioId: personId, eventType: auditEventTypes.administrativeMutation, targetType: "INTERNAL_CONTROL_EVENT", targetId: event.id });
        }), postgresConstraintError("23503", "AuditEvent_actorUsuarioId_fkey"));
        assert.equal((await firstControlEvent(tx, { planId, snapshotKey: "idempotencyKey", snapshotValue: personId }))?.id, event.id);
        assert.deepEqual(await listControlPlans(tx, { allowedBudgetUnitIds: [] }), []);
        assert.equal((await listControlPlans(tx, { planId }))[0].budgetUnit, null);
        await assert.rejects(tx.transaction(async nested => {
          await nested.update(controlPlans).set({ status: "CONCLUIDO" }).where(eq(controlPlans.id, planId));
          const nestedEvent = await appendControlEvent(nested, { planId, eventType: "MUST_ROLL_BACK", actorId: userId, reason: "Rollback", snapshot: {} });
          await insertAuditEvent(nested, { actorUsuarioId: userId, eventType: auditEventTypes.administrativeMutation, targetType: "INTERNAL_CONTROL_EVENT", targetId: nestedEvent.id });
          throw rollback;
        }), error => error === rollback);
        assert.equal((await getControlPlan(tx, planId))?.status, "ABERTO");
        assert.deepEqual(await tx.select().from(controlEvents).where(and(eq(controlEvents.planId, planId), eq(controlEvents.eventType, "MUST_ROLL_BACK"))), []);
        const audit = await tx.select().from(auditEvents).where(eq(auditEvents.actorUsuarioId, userId));
        assert.equal(audit.length, 1);
        assert.equal(audit[0].targetId, event.id);
      });
      throw rollback;
    }, { timeoutMs: 100_000 }), error => error === rollback);
    assert.deepEqual(await connection.db.select().from(culturalReservations).where(eq(culturalReservations.spaceId, spaceId)), []);
    assert.deepEqual(await connection.db.select().from(controlPlans).where(eq(controlPlans.id, planId)), []);
    assert.deepEqual(await connection.db.select().from(culturalIncentiveProjects).where(inArray(culturalIncentiveProjects.id, [projectId])), []);
    assert.deepEqual(await connection.db.select().from(trafficTickets).where(eq(trafficTickets.id, ticketId)), []);
    assert.deepEqual(await connection.db.select().from(securityGuards).where(eq(securityGuards.nome, guardTitle)), []);
    assert.deepEqual(await connection.db.select().from(sequenceCounters).where(eq(sequenceCounters.key, counterKey)), counterBefore);
    assert.deepEqual(await connection.db.select().from(controlEvents).where(eq(controlEvents.planId, planId)), []);
    assert.deepEqual(await connection.db.select().from(auditEvents).where(eq(auditEvents.actorUsuarioId, userId)), []);
    assert.deepEqual(await connection.db.select().from(users).where(eq(users.id, userId)), []);
    assert.deepEqual(await connection.db.select().from(accessProfiles).where(eq(accessProfiles.id, profileId)), []);
    assert.deepEqual(await connection.db.select().from(people).where(eq(people.id, personId)), []);
    assert.deepEqual(await connection.db.select().from(culturalSpaces).where(eq(culturalSpaces.id, spaceId)), []);
    assert.deepEqual(await connection.db.select().from(culturalEvents).where(eq(culturalEvents.id, eventId)), []);
    const locks = await connection.db.execute(sql`SELECT 1 AS ready`);
    assert.equal(locks.rows.length, 1);
  } finally { await fixture.close(); }
});
