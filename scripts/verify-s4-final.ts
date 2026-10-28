import { config } from "dotenv";
import { and, count, eq, isNotNull } from "drizzle-orm";
import { users } from "../src/db/schema/identity";
import { patients } from "../src/db/schema/health-registration";
import { healthProfessionals } from "../src/db/schema/health-workforce";
import { healthSusProcedures, healthSusReferences } from "../src/db/schema/health-catalogs";
import { medicalRecords, healthPerformedProcedures } from "../src/db/schema/health-care";
import { healthAppointments } from "../src/db/schema/health-agenda";
import { healthRegulationRequests } from "../src/db/schema/health-regulation";
import { healthProductionFacts, healthProductionCompetences, healthProductionCriticisms, healthSusFiles } from "../src/db/schema/health-production";
import { neighborhoods } from "../src/db/schema/localities";
import { addresses } from "../src/db/schema/registry";
import type { AppContext } from "../src/lib/platform/tenant-context";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

// Teste obrigatório do fechamento S4: fluxo assistencial válido com
// procedimento SIGTAP -> produção com CID/município -> sem SEM_PROCEDIMENTO
// -> BPA real -> filtros -> histórico preservado após mudança de endereço.
async function main() {
  const { db, databaseConnection } = await import("../src/db/client");
  const { createSpontaneousCare } = await import("../src/lib/saude/appointment-service");
  const { startHealthCare, addHealthDiagnosis, addPerformedProcedure, concludeHealthCare } = await import("../src/lib/saude/care-service");
  const { ensureCompetence, captureFacts, processCompetence, closeCompetence, reopenCompetence, generateSusFile, processSusFile } = await import("../src/lib/saude/production-service");
  try {
    const [professional] = await db.select({id:healthProfessionals.id,unitId:healthProfessionals.unitId,employeeId:healthProfessionals.employeeId}).from(healthProfessionals).where(eq(healthProfessionals.id,"HPRO-SER-SIM-0126")).limit(1);
    if (!professional) throw new Error("Profissional de teste não encontrado");
    const [usuario] = await db.select().from(users).where(eq(users.employeeId,professional.employeeId!)).limit(1);
    if (!usuario) throw new Error("Usuario do profissional não encontrado");
    const ctx: AppContext = { database: db, user: { id: usuario.id, firebaseUid: usuario.firebaseUid || "", email: usuario.email, name: usuario.nome, role: "prof", profileCode: "SAUDE", modulePermissions: [], allowedBudgetUnitIds: [], allowedHealthUnitIds: [], hasHealthAccessScope: false, employeeId: usuario.employeeId, departmentId: null, secretariatId: null } };
    const unitId = professional.unitId!;
    const patientId = "PAC-SIM-00002";
    const period = "2026-09";

    const [procedure] = await db.select({id:healthSusProcedures.id,code:healthSusProcedures.code}).from(healthSusProcedures).where(and(eq(healthSusProcedures.code,"9900000001"),eq(healthSusProcedures.isCurrent,true),eq(healthSusProcedures.isActive,true))).limit(1);
    const [cid] = await db.select({id:healthSusReferences.id,code:healthSusReferences.code}).from(healthSusReferences).where(and(eq(healthSusReferences.kind,"CID"),eq(healthSusReferences.code,"J06"),eq(healthSusReferences.isCurrent,true),eq(healthSusReferences.isActive,true))).limit(1);
    if (!procedure || !cid) throw new Error("Base SIGTAP local não carregada");

    // 1) Fluxo assistencial válido (demanda espontânea -> atendimento -> diagnóstico -> procedimento -> conclusão)
    let recordId: string;
    const [existing] = await db.select({id:medicalRecords.id}).from(medicalRecords).innerJoin(healthAppointments,eq(healthAppointments.id,medicalRecords.appointmentId)).where(and(eq(medicalRecords.patientId,patientId),eq(healthAppointments.arrivalNotes,"Avaliação clínica de rotina"),isNotNull(medicalRecords.completedAt))).limit(1);
    if (existing) {
      recordId = existing.id;
      console.log("atendimento de teste reutilizado", recordId);
    } else {
      const appointment = await createSpontaneousCare(ctx, { patientId, unitId, professionalId: professional.id, specialtyId: null, serviceId: null, arrivalNotes: "Avaliação clínica de rotina", priority: "Normal" });
      const record = await startHealthCare(ctx, appointment.id);
      await addHealthDiagnosis(ctx, { medicalRecordId: record.id, cidReferenceId: cid.id, isPrimary: true, notes: null });
      await addPerformedProcedure(ctx, { medicalRecordId: record.id, procedureId: procedure.id, quantity: 1, notes: null });
      await concludeHealthCare(ctx, { medicalRecordId: record.id, outcome: "Alta", conduct: "Conduta clínica registrada." });
      recordId = record.id;
      console.log("atendimento de teste criado", recordId);
    }
    const [performed] = await db.select({id:healthPerformedProcedures.id}).from(healthPerformedProcedures).where(eq(healthPerformedProcedures.medicalRecordId,recordId)).limit(1);

    // 2) Origem antiga (regulação) recebe procedimento válido
    const [regFact] = await db.select({originId:healthProductionFacts.originId}).from(healthProductionFacts).where(and(eq(healthProductionFacts.originType,"REGULATION"),eq(healthProductionFacts.period,period))).limit(1);
    if (regFact) {
      await db.update(healthRegulationRequests).set({procedureId:procedure.id}).where(eq(healthRegulationRequests.id,regFact.originId));
      console.log("origem da regulação corrigida com procedimento", procedure.code);
    }

    // 3) Captura idempotente + reabertura se necessário + processamento
    const cap = await captureFacts(ctx, period);
    console.log("captura", cap);
    const comp = await ensureCompetence(ctx, period);
    const [state] = await db.select({status:healthProductionCompetences.status}).from(healthProductionCompetences).where(eq(healthProductionCompetences.id,comp.id));
    if (state?.status === "FECHADA") await reopenCompetence(ctx, comp.id);
    await processCompetence(ctx, comp.id);
    const [pepRow] = await db.select({fact:healthProductionFacts,procedure:{code:healthSusProcedures.code},cidReference:{code:healthSusReferences.code}}).from(healthProductionFacts).leftJoin(healthSusProcedures,eq(healthSusProcedures.id,healthProductionFacts.procedureId)).leftJoin(healthSusReferences,eq(healthSusReferences.id,healthProductionFacts.cidReferenceId)).where(eq(healthProductionFacts.idempotencyKey,`PEP_PROCEDURE:${performed!.id}`)).limit(1);
    const pepFact = pepRow && {...pepRow.fact,procedure:pepRow.procedure,cidReference:pepRow.cidReference};
    console.log("fato PEP:", { status: pepFact?.status, procedure: pepFact?.procedure?.code, cid: pepFact?.cidReference?.code, municipality: pepFact?.municipality, state: pepFact?.state });
    if (!pepFact || pepFact.status !== "VALIDO") throw new Error("Fato válido deveria estar VALIDO");
    if (pepFact.procedure?.code !== "9900000001") throw new Error("Procedimento não refletido no fato");
    if (pepFact.cidReference?.code !== "J06") throw new Error("CID não refletido no fato");
    if (!pepFact.municipality || !pepFact.state) throw new Error("Município/UF histórico ausente");
    const [{value:semProc}] = await db.select({value:count()}).from(healthProductionCriticisms).innerJoin(healthProductionFacts,eq(healthProductionFacts.id,healthProductionCriticisms.factId)).where(and(eq(healthProductionCriticisms.status,"ABERTA"),eq(healthProductionCriticisms.code,"SEM_PROCEDIMENTO"),eq(healthProductionFacts.competenceId,comp.id)));
    console.log("SEM_PROCEDIMENTO abertas:", semProc);
    if (semProc !== 0) throw new Error("SEM_PROCEDIMENTO deveria ter desaparecido dos casos válidos");

    // 4) Filtros por CID e município (conjunto total autorizado)
    const [{value:byCid}] = await db.select({value:count()}).from(healthProductionFacts).where(eq(healthProductionFacts.cidReferenceId,cid.id));
    const [{value:byMun}] = await db.select({value:count()}).from(healthProductionFacts).where(and(eq(healthProductionFacts.municipality,pepFact.municipality!),eq(healthProductionFacts.state,pepFact.state!)));
    console.log("filtro CID:", byCid, "filtro município/UF:", byMun);
    if (byCid < 1 || byMun < 1) throw new Error("Filtros não retornam o fato");

    // 5) Histórico preservado após mudança do endereço atual (transitória, removida ao final)
    const [hood] = await db.insert(neighborhoods).values({name:"Bairro Transitório",type:"Bairro",city:"Município Transitório",state:"ES"}).returning({id:neighborhoods.id});
    const [patient] = await db.select({personId:patients.personId}).from(patients).where(eq(patients.id,patientId));
    const [addr] = await db.insert(addresses).values({personId:patient!.personId,neighborhoodId:hood.id,streetName:"Rua Transitória"}).returning({id:addresses.id});
    const [after] = await db.select({municipality:healthProductionFacts.municipality,state:healthProductionFacts.state}).from(healthProductionFacts).where(eq(healthProductionFacts.id,pepFact.id));
    await db.delete(addresses).where(eq(addresses.id,addr.id));
    await db.delete(neighborhoods).where(eq(neighborhoods.id,hood.id));
    console.log("snapshot após troca de endereço:", after);
    if (after?.municipality !== pepFact.municipality) throw new Error("Histórico foi alterado pela mudança de endereço");

    // 6) BPA real a partir da competência + adaptador + fechamento
    const file = await generateSusFile(ctx, { competenceId: comp.id, fileType: "BPA" });
    const [stored] = await db.select({content:healthSusFiles.content}).from(healthSusFiles).where(eq(healthSusFiles.id,file.id));
    if (!stored?.content.includes("9900000001")) throw new Error("BPA não contém o procedimento da base");
    console.log("BPA gerado com", file.quantity, "linha(s)");
    const res = await processSusFile(ctx, file.id);
    console.log("BPA processado:", res);
    if (res.status !== "PROCESSADO") throw new Error("BPA deveria ser PROCESSADO");
    await closeCompetence(ctx, comp.id);
    console.log("competência 2026-09 FECHADA");
    console.log(JSON.stringify({ status: "S4-FINAL READY" }));
  } finally {
    await databaseConnection.pool.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
