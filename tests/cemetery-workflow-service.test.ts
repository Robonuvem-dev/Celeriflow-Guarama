import assert from "node:assert/strict";
import test from "node:test";
import { and, count, eq } from "drizzle-orm";
import { createCemeteryDatabase } from "./helpers/cemetery-database";
import { people } from "../src/db/schema/people";
import { taxpayers } from "../src/db/schema/registry";
import { cemeteries, cemeteryLots, cemeteryGraves, cemeteryDeceased, cemeteryFuneralHomes, cemeteryDeathCauses, cemeteryChapels, cemeteryOssuaries, cemeteryProcesses } from "../src/db/schema/cemeteries";
import { taxes, taxAssessments, taxGuides } from "../src/db/schema/taxation-core";
import { taxActiveDebts, taxPayments } from "../src/db/schema/tax-accounting";
import { advanceCemeteryProcess, createCemeteryProcess, declarantDebtSnapshot, registerDeceased, registerMovement } from "../src/lib/tributacao/s9-service";

test("cemetery workflow: transactional finalization, current location, destination validation, replay and debt totals", { timeout: 180000 }, async t => {
  const fixture = await createCemeteryDatabase("actor");
  const connection = fixture.connection, db = connection.db;
  const grave = async (id: string) => (await db.select().from(cemeteryGraves).where(eq(cemeteryGraves.id, id)))[0];
  const person = async (id: string) => (await db.select().from(people).where(eq(people.id, id)))[0];
  const deceasedRow = async (id: string) => (await db.select().from(cemeteryDeceased).where(eq(cemeteryDeceased.id, id)))[0];
  const processFor = async (deceasedId: string, type?: string) => (await db.select().from(cemeteryProcesses).where(and(eq(cemeteryProcesses.deceasedId, deceasedId), type ? eq(cemeteryProcesses.processType, type) : undefined)).limit(1))[0];
  try {
    await db.insert(cemeteries).values([{ id: "cem", code: "C", name: "Municipal" }, { id: "other", code: "O", name: "Outro" }]);
    await db.insert(people).values([1, 2, 3, 4, 5].map(i => ({ id: `p${i}`, fullName: `Pessoa ${i}`, cpf: String(i).repeat(3), status: "Ativo" })));
    await db.insert(taxpayers).values([...Array.from({ length: 5 }, (_, i) => ({ id: `t${i + 1}`, personId: `p${i + 1}`, taxpayerType: "PF", status: "Ativo" })), { id: "decl", personId: null, taxpayerType: "PF", status: "Ativo" }]);
    await db.insert(cemeteryLots).values([1, 2, 3].map(i => ({ id: `l${i}`, cemeteryId: "cem", identifier: `L${i}`, ownerTaxpayerId: "decl", active: true, graveLimit: 10 })));
    await db.insert(cemeteryGraves).values([...Array.from({ length: 3 }, (_, i) => ({ id: `g${i + 1}`, cemeteryId: "cem", lotId: `l${i + 1}`, code: `G${i + 1}`, graveType: "COVA", active: true, capacity: 5, status: "LIVRE" })), { id: "g4", cemeteryId: "other", lotId: null, code: "G4", graveType: "COVA", active: true, capacity: 5, status: "LIVRE" }]);
    await db.insert(cemeteryFuneralHomes).values({ id: "home", name: "Funerária", active: true });
    await db.insert(cemeteryDeathCauses).values({ id: "cause", code: "NAT", description: "Natural" });
    await db.insert(cemeteryChapels).values([{ id: "chapel", cemeteryId: "cem", name: "Capela", responsibleTaxpayerId: "decl", active: true }, { id: "wrong", cemeteryId: "other", name: "Capela outro", responsibleTaxpayerId: "decl", active: true }]);
    await db.insert(cemeteryOssuaries).values({ id: "oss", cemeteryId: "cem", code: "OSS", address: "Local de teste", active: true, capacity: 1 });
    await db.insert(taxes).values({ id: "tax", name: "Taxa de teste", taxType: "Taxa" });
    const actor = { usuarioId: "actor" };
    const base = { fullName: "Pessoa", deathDate: new Date("2026-10-01"), cemeteryId: "cem", graveId: "g1", funeralHomeId: "home", causeId: "cause", chapelId: "chapel", doctorName: "Médico", doctorCrm: "CRM1", declarantTaxpayerId: "decl", deceasedTaxpayerId: "t1", finalizeNow: false, scheduledAt: new Date("2026-10-02T12:00:00Z") };
    await t.test("identified PF and mandatory references; exception does not create fake person", async () => {
      await assert.rejects(registerDeceased(connection, actor, { ...base, deceasedTaxpayerId: undefined }), /pessoa física/);
      await assert.rejects(registerDeceased(connection, actor, { ...base, funeralHomeId: undefined }), /obrigatórias/);
      await assert.rejects(registerDeceased(connection, actor, { ...base, chapelId: "wrong" }), /Capela/);
      await assert.rejects(registerDeceased(connection, actor, { ...base, unidentified: true, burialType: "NAO_RECLAMADO", exceptionReason: "Não identificado" }), /fictício/);
      const unknown = await registerDeceased(connection, actor, { ...base, fullName: "Registro administrativo 001", unidentified: true, burialType: "NAO_RECLAMADO", deceasedTaxpayerId: undefined, funeralHomeId: undefined, causeId: undefined, chapelId: undefined, exceptionReason: "Corpo não identificado, autorização registrada", finalizeNow: true });
      assert.equal(unknown.deceasedTaxpayerId, null); assert.equal((await db.select({ total: count() }).from(people))[0].total, 5);
    });
    const normal = await registerDeceased(connection, actor, { ...base, requestKey: "burial-1" });
    await t.test("wake and cremation open independently of burial; later burial reuses the same registry", async () => {
      const input = { processType: "VELORIO" as const, deceasedId: "", deceasedTaxpayerId: "t4", deathDate: base.deathDate, causeId: "cause", cemeteryId: "cem", funeralHomeId: "home", chapelId: "chapel", doctorName: "Médico", doctorCrm: "CRM1", declarantTaxpayerId: "decl", scheduledAt: base.scheduledAt, requestKey: "independent-wake" };
      const wake = await createCemeteryProcess(connection, actor, input);
      assert.equal((await createCemeteryProcess(connection, actor, input)).id, wake.id);
      const record = await deceasedRow(wake.deceasedId);
      assert.equal(record.graveId, null); assert.equal(record.status, "REGISTRADO");
      const later = await registerDeceased(connection, actor, { ...base, deceasedTaxpayerId: "t4", requestKey: "after-wake" });
      assert.equal(later.id, wake.deceasedId);
      const cremation = await createCemeteryProcess(connection, actor, { ...input, processType: "CREMACAO", deceasedTaxpayerId: "t5", chapelId: undefined, requestKey: "independent-cremation" });
      const occupied = (await grave("g1")).occupantCount;
      await advanceCemeteryProcess(connection, actor, { processId: cremation.id, status: "CREMADO" });
      assert.equal((await grave("g1")).occupantCount, occupied);
    });
    await t.test("schedule replay, finalization, PF estate and capacity", async () => {
      assert.equal((await registerDeceased(connection, actor, { ...base, requestKey: "burial-1" })).id, normal.id);
      await assert.rejects(registerDeceased(connection, actor, base), /Já existe registro/);
      await assert.rejects(registerDeceased(connection, actor, { ...base, fullName: "Outro nome", requestKey: "burial-1" }), /outros dados/);
      assert.equal((await person("p1")).deathDate, null);
      const process = await processFor(normal.id);
      await advanceCemeteryProcess(connection, actor, { processId: process.id, status: "SEPULTADO", requestKey: "finish-1" });
      await advanceCemeteryProcess(connection, actor, { processId: process.id, status: "SEPULTADO", requestKey: "finish-1" });
      const updated = await person("p1");
      assert.match(updated.fullName, /ESPÓLIO/); assert.equal(updated.estateApplied, true); assert.equal(updated.deathDate?.toISOString(), base.deathDate.toISOString());
      assert.equal((await grave("g1")).occupantCount, 2);
    });
    await t.test("member owner remains living and wake ends without burial", async () => {
      const member = await registerDeceased(connection, actor, { ...base, deceasedTaxpayerId: "t2", burialType: "MEMBRO", finalizeNow: true });
      const owner = await person("p2"); assert.equal(owner.deathDate, null); assert.equal(owner.estateApplied, false);
      await assert.rejects(createCemeteryProcess(connection, actor, { processType: "VELORIO", deceasedId: member.id, chapelId: "chapel", declarantTaxpayerId: "decl", scheduledAt: base.scheduledAt }), /não de membro/);
      const wake = await createCemeteryProcess(connection, actor, { processType: "VELORIO", deceasedId: normal.id, chapelId: "chapel", declarantTaxpayerId: "decl", scheduledAt: base.scheduledAt });
      await assert.rejects(advanceCemeteryProcess(connection, actor, { processId: wake.id, status: "SEPULTADO" }), /sepultamento/);
      const occupied = (await grave("g1")).occupantCount;
      assert.equal((await advanceCemeteryProcess(connection, actor, { processId: wake.id, status: "ENCERRADO" })).status, "ENCERRADO");
      assert.equal((await grave("g1")).occupantCount, occupied);
    });
    await t.test("internal transfer can be transferred again; replay does not move twice", async () => {
      const input = { deceasedId: normal.id, graveId: "g1", toGraveId: "g2", movementType: "OUTRO_LOTE" as const, requestKey: "move-1" };
      const first = await registerMovement(connection, actor, input);
      assert.equal((await registerMovement(connection, actor, input)).id, first.id);
      await registerMovement(connection, actor, { deceasedId: normal.id, graveId: "g2", toGraveId: "g3", movementType: "OUTRO_LOTE" });
      const current = await deceasedRow(normal.id); assert.equal(current.status, "SEPULTADO"); assert.equal(current.graveId, "g3");
      assert.equal((await grave("g2")).occupantCount, 0);
      await assert.rejects(registerMovement(connection, actor, { deceasedId: normal.id, graveId: "g3", toGraveId: "g3", movementType: "OUTRO_LOTE" }), /lote distinto/);
      await assert.rejects(registerMovement(connection, actor, { deceasedId: normal.id, graveId: "g3", toGraveId: "g4", movementType: "CREMACAO" }), /sem sepultura/);
      await registerMovement(connection, actor, { deceasedId: normal.id, graveId: "g3", toGraveId: "g4", movementType: "MUDANCA_CEMITERIO" });
      await registerMovement(connection, actor, { deceasedId: normal.id, graveId: "g4", movementType: "EXUMACAO", destinationDescription: "Restos entregues ao responsável" });
      await assert.rejects(registerMovement(connection, actor, { deceasedId: normal.id, graveId: "g4", movementType: "OUTRO", destinationDescription: "Destino" }), /atualmente sepultado/);
    });
    await t.test("cremation of pending burial never frees another occupant", async () => {
      const pending = await registerDeceased(connection, actor, { ...base, deceasedTaxpayerId: "t3" });
      await assert.rejects(registerMovement(connection, actor, { deceasedId: pending.id, graveId: "g1", movementType: "CREMACAO", destinationDescription: "Crematório" }), /atualmente sepultado/);
      const occupied = (await grave("g1")).occupantCount;
      const cremation = await createCemeteryProcess(connection, actor, { processType: "CREMACAO", deceasedId: pending.id, declarantTaxpayerId: "decl", scheduledAt: base.scheduledAt });
      await advanceCemeteryProcess(connection, actor, { processId: cremation.id, status: "CREMADO" });
      assert.equal((await grave("g1")).occupantCount, occupied);
      assert.equal((await processFor(pending.id, "SEPULTAMENTO")).status, "CANCELADO");
    });
    await t.test("all external destination pairs and ossuary capacity are enforced", async () => {
      const unknown = { ...base, graveId: "g2", deceasedTaxpayerId: undefined, unidentified: true, burialType: "NAO_RECLAMADO" as const, exceptionReason: "Autorização para registro não identificado", finalizeNow: true };
      for (const movementType of ["MUDANCA_CIDADE", "DESAPROPRIACAO", "CREMACAO", "OUTRO"] as const) {
        const deceased = await registerDeceased(connection, actor, unknown);
        await assert.rejects(registerMovement(connection, actor, { deceasedId: deceased.id, graveId: "g2", movementType }), /destino\/justificativa/);
        await registerMovement(connection, actor, { deceasedId: deceased.id, graveId: "g2", movementType, destinationDescription: "Destino administrativo autorizado" });
        assert.equal((await deceasedRow(deceased.id)).graveId, null);
      }
      const deceased = await registerDeceased(connection, actor, unknown);
      await registerMovement(connection, actor, { deceasedId: deceased.id, graveId: "g2", movementType: "OSSUARIO", ossuaryId: "oss" });
      assert.equal((await db.select().from(cemeteryOssuaries).where(eq(cemeteryOssuaries.id, "oss")))[0].occupantCount, 1);
      const blocked = await registerDeceased(connection, actor, unknown);
      const occupied = (await grave("g2")).occupantCount;
      await assert.rejects(registerMovement(connection, actor, { deceasedId: blocked.id, graveId: "g2", movementType: "OSSUARIO", ossuaryId: "oss" }), /ossuário ativo com vaga/);
      assert.equal((await grave("g2")).occupantCount, occupied);
    });
    await t.test("competing finalizations cannot overfill a grave", async () => {
      await db.update(cemeteryGraves).set({ capacity: 1 }).where(eq(cemeteryGraves.id, "g3"));
      const ids: string[] = [];
      for (let index = 0; index < 2; index++) {
        const deceased = await registerDeceased(connection, actor, { ...base, graveId: "g3", deceasedTaxpayerId: undefined, unidentified: true, burialType: "NAO_RECLAMADO", exceptionReason: "Autorização administrativa", finalizeNow: false });
        ids.push((await processFor(deceased.id)).id);
      }
      const outcomes = await Promise.allSettled(ids.map(processId => advanceCemeteryProcess(connection, actor, { processId, status: "SEPULTADO" })));
      assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(outcomes.filter(result => result.status === "rejected").length, 1);
      assert.equal((await grave("g3")).occupantCount, 1);
    });
    await t.test("debt totals are uncapped, exclude closed debts, paid assessments and duplicate active-debt origins", async () => {
      await db.insert(taxAssessments).values(Array.from({ length: 125 }, (_, index) => ({ id: `assessment-${index}`, year: 2026, originalValue: 10, taxId: "tax", taxpayerId: "decl", status: "Lançado" })));
      await db.insert(taxActiveDebts).values([{ id: "debt", taxpayerId: "decl", assessmentId: "assessment-0", originDebtType: "tax", year: 2026, originalValue: 10, updatedValue: 15, status: "INSCRITA" }, { id: "closed", taxpayerId: "decl", originDebtType: "tax", year: 2026, originalValue: 999, updatedValue: 999, status: "CANCELADA" }]);
      await db.insert(taxGuides).values({ id: "guide", assessmentId: "assessment-1", totalValue: 10, dueDate: base.deathDate, status: "Paga" });
      await db.insert(taxPayments).values({ id: "paid", guideId: "guide", amountPaid: 10, paymentDate: base.deathDate, paymentMethod: "PIX", status: "Confirmado" });
      const debt = await declarantDebtSnapshot(db, "decl"); assert.equal(debt.assessmentCount, 123); assert.equal(debt.activeDebtCount, 1); assert.equal(debt.total, "1245.00");
    });
  } finally { await fixture.close(); }
});
