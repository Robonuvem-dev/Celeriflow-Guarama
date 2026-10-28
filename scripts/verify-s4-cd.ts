import { config } from "dotenv";
import { and, count, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { users } from "../src/db/schema/identity";
import { patients } from "../src/db/schema/health-registration";
import { healthUnits, healthTeams, healthProfessionals } from "../src/db/schema/health-workforce";
import { medicalRecords, healthPerformedProcedures } from "../src/db/schema/health-care";
import { healthProductionFacts, healthProductionCompetences, healthProductionCriticisms } from "../src/db/schema/health-production";
import { healthEsusForms, healthHomeVisitParticipants, healthHomeVisits, healthFamilyMembers, healthFamilies, healthHouseholds, healthMicroareas, healthTerritoryAreas } from "../src/db/schema/health-territory";
import { diagnosticEsusBatches as healthEsusBatches, diagnosticEsusBatchItems as healthEsusBatchItems } from "../src/db/schema/health-diagnostics";
import type { AppContext } from "../src/lib/platform/tenant-context";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const { db, databaseConnection } = await import("../src/db/client");
  const { ensureCompetence, captureFacts, processCompetence, closeCompetence, generateSusFile, processSusFile } = await import("../src/lib/saude/production-service");
  const { saveArea, saveMicroarea, saveHousehold, saveFamily, addFamilyMember, createVisit, addVisitParticipant, saveForm, finalizeForm } = await import("../src/lib/saude/territory-service");
  const { createBatch, processBatch } = await import("../src/lib/saude/sisab-service");
  try {
    const [usuario] = await db.select().from(users).where(isNotNull(users.employeeId)).limit(1);
    if (!usuario?.employeeId) throw new Error("Usuario com employee não encontrado");
    const ctx: AppContext = { database: db, user: { id: usuario.id, firebaseUid: usuario.firebaseUid || "", email: usuario.email, name: usuario.nome, role: "admin", profileCode: "ADMIN", modulePermissions: [], allowedBudgetUnitIds: [], allowedHealthUnitIds: [], hasHealthAccessScope: false, employeeId: usuario.employeeId, departmentId: null, secretariatId: null } };

    const period = "2026-09";
    console.log("== PRODUCAO ==");
    const cap1 = await captureFacts(ctx, period);
    console.log("capture1", cap1);
    const cap2 = await captureFacts(ctx, period);
    console.log("capture2 (idempotente)", cap2);
    if (cap2.created !== 0) throw new Error("Captura duplicou fatos");
    const [{value:performed}] = await db.select({value:count()}).from(healthPerformedProcedures).innerJoin(medicalRecords,eq(medicalRecords.id,healthPerformedProcedures.medicalRecordId)).where(isNotNull(medicalRecords.completedAt));
    console.log("performed com atendimento concluído:", performed);

    const comp = await ensureCompetence(ctx, period);
    const { reopenCompetence } = await import("../src/lib/saude/production-service");
    const [compState] = await db.select({status:healthProductionCompetences.status}).from(healthProductionCompetences).where(eq(healthProductionCompetences.id,comp.id));
    if (compState?.status === "FECHADA") await reopenCompetence(ctx, comp.id);
    const proc = await processCompetence(ctx, comp.id);
    console.log("competence processada", proc);
    const [{value:facts}] = await db.select({value:count()}).from(healthProductionFacts).where(eq(healthProductionFacts.competenceId,comp.id));
    const openCritics = await db.select({code:healthProductionCriticisms.code}).from(healthProductionCriticisms).innerJoin(healthProductionFacts,eq(healthProductionFacts.id,healthProductionCriticisms.factId)).where(and(eq(healthProductionCriticisms.status,"ABERTA"),eq(healthProductionFacts.competenceId,comp.id)));
    const critics = openCritics.length;
    console.log("facts vinculados:", facts, "criticas abertas:", critics);
    for (const c of openCritics) console.log("critica:", c.code);

    // Arquivo a partir de fatos válidos com procedimento (pode ser 0 se nenhum fato tem procedimento)
    const [{value:validProc}] = await db.select({value:count()}).from(healthProductionFacts).where(and(eq(healthProductionFacts.competenceId,comp.id),eq(healthProductionFacts.status,"VALIDO"),isNotNull(healthProductionFacts.procedureId)));
    console.log("fatos válidos com procedimento:", validProc);
    if (validProc > 0) {
      const file = await generateSusFile(ctx, { competenceId: comp.id, fileType: "BPA" });
      console.log("arquivo", file.id, file.hash.slice(0, 12), file.quantity);
      const res1 = await processSusFile(ctx, file.id);
      console.log("processado", res1);
      const res2 = await processSusFile(ctx, file.id);
      console.log("reprocessado (sem duplicar)", res2);
      if (res1.status !== res2.status) throw new Error("Reprocessamento divergiu");
    } else {
      console.log("sem fatos com procedimento: arquivo não gerado (esperado sem SIGTAP vinculado)");
    }
    if (critics === 0) {
      await closeCompetence(ctx, comp.id);
      console.log("competencia fechada");
    } else {
      console.log("competencia com criticas: fechamento bloqueado como esperado");
      try { await closeCompetence(ctx, comp.id); throw new Error("Fechamento deveria falhar"); }
      catch (e: unknown) { if (!String(e instanceof Error ? e.message : e).includes("crítica")) throw e; console.log("bloqueio de fechamento ok"); }
    }

    console.log("== TERRITORIO/SISAB ==");
    const [unit] = await db.select().from(healthUnits).where(eq(healthUnits.isActive,true)).limit(1);
    const [team] = await db.select().from(healthTeams).where(eq(healthTeams.isActive,true)).limit(1);
    const [professional] = await db.select().from(healthProfessionals).where(eq(healthProfessionals.isActive,true)).limit(1);
    const [patient] = await db.select().from(patients).where(eq(patients.status,"Ativo")).limit(1);
    const [patient2] = await db.select().from(patients).where(and(eq(patients.status,"Ativo"),ne(patients.id,patient!.id))).limit(1);
    const stamp = Date.now().toString().slice(-6);
    const area = await saveArea(ctx, { code: `A${stamp}`, name: "Área Norte", unitId: unit!.id, teamId: team?.id || null });
    const micro = await saveMicroarea(ctx, { code: "01", areaId: area.id, agentProfessionalId: professional?.id || null });
    const household = await saveHousehold(ctx, { householdCode: `DOM${stamp}`, microareaId: micro.id });
    const family = await saveFamily(ctx, { familyCode: `FAM${stamp}`, householdId: household.id, responsiblePersonId: patient!.personId });
    await addFamilyMember(ctx, { familyId: family.id, personId: patient!.personId, kinship: "Responsável" });
    if (patient2) await addFamilyMember(ctx, { familyId: family.id, personId: patient2.personId, kinship: "Cônjuge" });
    console.log("territorio ok", area.id, micro.id, household.id, family.id);

    const visit = await createVisit(ctx, { householdId: household.id, familyId: family.id, teamId: team?.id || null, professionalId: professional!.id, microareaId: micro.id, visitedAt: new Date(), actions: "Visita de rotina e orientação", observations: null });
    await addVisitParticipant(ctx, { visitId: visit.id, personId: patient!.personId });
    if (patient2) await addVisitParticipant(ctx, { visitId: visit.id, personId: patient2.personId });
    const [{value:parts}] = await db.select({value:count()}).from(healthHomeVisitParticipants).where(eq(healthHomeVisitParticipants.visitId,visit.id));
    console.log("visita com participantes:", parts);
    if (parts < 1) throw new Error("Participantes não registrados");

    const form = await saveForm(ctx, { kind: "VISITA", householdId: household.id, familyId: family.id, personId: patient!.personId, patientId: patient!.id, professionalId: professional!.id, teamId: team?.id || null, unitId: unit!.id, period, details: "Visita domiciliar registrada", originMedicalRecordId: null });
    await finalizeForm(ctx, form.id);
    const [{value:factsBefore}] = await db.select({value:count()}).from(healthProductionFacts).where(eq(healthProductionFacts.idempotencyKey,`ESUS_FORM:${form.id}`));
    await finalizeForm(ctx, form.id);
    const [{value:factsAfter}] = await db.select({value:count()}).from(healthProductionFacts).where(eq(healthProductionFacts.idempotencyKey,`ESUS_FORM:${form.id}`));
    console.log("producao da ficha:", factsBefore, "->", factsAfter);
    if (factsBefore !== 1 || factsAfter !== 1) throw new Error("Produção da ficha duplicou ou ausente");

    const batch = await createBatch(ctx, period);
    console.log("lote", batch.id);
    const batchRes = await processBatch(ctx, batch.id);
    console.log("lote processado", batchRes);

    // Caso rejeitado: ficha finalizada sem profissional, depois corrige e reenvia
    const [bad] = await db.insert(healthEsusForms).values({kind:"INDIVIDUAL",period,status:"FINALIZADA",finalizedAt:new Date(),idempotencyKey:`BAD-${stamp}`,createdByUsuarioId:usuario.id}).returning();
    const batch2 = await createBatch(ctx, period);
    const res2 = await processBatch(ctx, batch2.id);
    console.log("lote com rejeição", res2);
    if (res2.rejected < 1) throw new Error("Rejeição esperada não ocorreu");
    await db.update(healthEsusForms).set({professionalId:professional!.id,unitId:unit!.id,personId:patient!.personId}).where(eq(healthEsusForms.id,bad.id));
    const res3 = await processBatch(ctx, batch2.id);
    console.log("lote após correção (reenvio)", res3);
    if (res3.rejected !== 0) throw new Error("Correção não foi aceita no reenvio");

    // Limpeza dos dados de teste (mantém fatos de produção reais capturados)
    await db.delete(healthEsusBatchItems).where(inArray(healthEsusBatchItems.batchId,[batch.id,batch2.id]));
    await db.delete(healthEsusBatches).where(inArray(healthEsusBatches.id,[batch.id,batch2.id]));
    await db.delete(healthProductionFacts).where(eq(healthProductionFacts.idempotencyKey,`ESUS_FORM:${form.id}`));
    await db.delete(healthEsusForms).where(inArray(healthEsusForms.id,[form.id,bad.id]));
    await db.delete(healthHomeVisitParticipants).where(eq(healthHomeVisitParticipants.visitId,visit.id));
    await db.delete(healthHomeVisits).where(eq(healthHomeVisits.id,visit.id));
    await db.delete(healthFamilyMembers).where(eq(healthFamilyMembers.familyId,family.id));
    await db.delete(healthFamilies).where(eq(healthFamilies.id,family.id));
    await db.delete(healthHouseholds).where(eq(healthHouseholds.id,household.id));
    await db.delete(healthMicroareas).where(eq(healthMicroareas.id,micro.id));
    await db.delete(healthTerritoryAreas).where(eq(healthTerritoryAreas.id,area.id));

    console.log(JSON.stringify({ status: "S4-CD READY" }, null, 2));
  } finally {
    await databaseConnection.pool.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
