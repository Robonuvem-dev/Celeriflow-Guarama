import { config } from "dotenv";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { users } from "../src/db/schema/identity";
import { suppliers } from "../src/db/schema/registry";
import { patients } from "../src/db/schema/health-registration";
import { healthUnits } from "../src/db/schema/health-workforce";
import { healthAppointments, healthAppointmentEvents } from "../src/db/schema/health-agenda";
import { healthProviderAccesses, healthRegulationRequests, healthRegulationQuotas } from "../src/db/schema/health-regulation";
import { managementVigilanceInspections, managementVigilanceComplaints, managementVigilanceLicenses } from "../src/db/schema/health-management-operations";
import { vaccinationRecords } from "../src/db/schema/health-vaccination";
import { medicineDispensations } from "../src/db/schema/health-pharmacy";
import { diagnosticLabReports } from "../src/db/schema/health-diagnostics";
import { healthLabOrders } from "../src/db/schema/health-laboratory";
import { ombudsmans, ombudsmanAuditLogs, ombudsmanIdentities } from "../src/db/schema/attendance-portals";
import type { AppContext } from "../src/lib/platform/tenant-context";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const { db, databaseConnection } = await import("../src/db/client");
  const portal = await import("../src/lib/saude/patient-portal-service");
  const timeline = await import("../src/lib/saude/patient-timeline-service");
  const provider = await import("../src/lib/saude/provider-service");
  const vigilance = await import("../src/lib/saude/vigilance-service");
  const { transitionHealthAppointment } = await import("../src/lib/saude/appointment-service");
  try {
    const [admin] = await db.select().from(users).where(isNotNull(users.employeeId)).limit(1);
    if (!admin?.employeeId) throw new Error("Usuario admin não encontrado");
    const ctx: AppContext = { database: db, user: { id: admin.id, firebaseUid: admin.firebaseUid || "", email: admin.email, name: admin.nome, role: "admin", profileCode: "ADMIN", modulePermissions: [], allowedBudgetUnitIds: [], allowedHealthUnitIds: [], hasHealthAccessScope: false, employeeId: admin.employeeId, departmentId: null, secretariatId: null } };

    // Massas mínimas de demonstração (idempotentes, documentadas)
    const [demoUser] = await db.select({id:users.id}).from(users).where(eq(users.id,"USR-SIM-026"));
    await db.update(patients).set({usuarioId:demoUser?.id || null}).where(eq(patients.id,"PAC-SIM-00002"));
    const [supplier] = await db.select({id:suppliers.id}).from(suppliers).where(eq(suppliers.status,"Ativo")).limit(1);
    if (demoUser && supplier) await db.insert(healthProviderAccesses).values({supplierId:supplier.id,usuarioId:demoUser.id}).onConflictDoUpdate({target:[healthProviderAccesses.supplierId,healthProviderAccesses.usuarioId],set:{isActive:true}});
    console.log("vinculos portal/prestador ok");

    // Vigilância: fluxo completo idempotente
    const est = await vigilance.saveEstablishment(ctx, { name: "Mercado Central", document: "12345678000199", cnae: "4711-3/02", activity: "Comércio varejista", riskLevel: "Médio" });
    const prevInspections = await db.select({id:managementVigilanceInspections.id}).from(managementVigilanceInspections).where(eq(managementVigilanceInspections.establishmentId,est.id));
    for (const prev of prevInspections) await db.delete(managementVigilanceInspections).where(eq(managementVigilanceInspections.id,prev.id));
    await db.delete(managementVigilanceComplaints).where(eq(managementVigilanceComplaints.establishmentId,est.id));
    await db.delete(managementVigilanceLicenses).where(eq(managementVigilanceLicenses.establishmentId,est.id));
    const complaint = await vigilance.saveComplaint(ctx, { establishmentId: est.id, place: null, description: "Higiene inadequada no local de manipulação.", isAnonymous: true, reporterPersonId: null });
    await vigilance.transitionComplaint(ctx, complaint.id, "Em apuração");
    const inspection = await vigilance.saveInspection(ctx, { establishmentId: est.id, complaintId: complaint.id, professionalId: null, inspectedAt: new Date(), reason: "Denúncia", findings: "Constatações registradas na inspeção.", items: [{ description: "Higiene do ambiente", result: "Conforme" }, { description: "Acondicionamento", result: "Não conforme", notes: "Ajustar" }] });
    await vigilance.transitionInspection(ctx, inspection.id, "Com pendências");
    const license = await vigilance.issueLicense(ctx, { establishmentId: est.id, licenseNumber: "ALV-2026-0001", validFrom: "2026-01-01", validUntil: "2026-12-31" });
    console.log("vigilancia ok", { est: est.id, complaint: complaint.id, inspection: inspection.id, license: license.id });

    // Isolamento paciente A x B (jornada 9 + segurança)
    const patientA = "PAC-SIM-00002";
    const [patientBRow] = await db.select({id:patients.id}).from(patients).where(and(eq(patients.status,"Ativo"),ne(patients.id,patientA))).limit(1);
    const patientB = patientBRow!.id;
    const [apptA, vacA, dispA, repA] = await Promise.all([
      portal.portalAppointments(ctx, patientA), portal.portalVaccinations(ctx, patientA),
      portal.portalDispensations(ctx, patientA), portal.portalLabReports(ctx, patientA),
    ]);
    const checkOwner = async (ids: string[], model: "appointment" | "vaccination" | "dispensation" | "report") => {
      for (const id of ids) {
        const [row] = model === "appointment" ? await db.select({patientId:healthAppointments.patientId}).from(healthAppointments).where(eq(healthAppointments.id,id))
          : model === "vaccination" ? await db.select({patientId:vaccinationRecords.patientId}).from(vaccinationRecords).where(eq(vaccinationRecords.id,id))
          : model === "dispensation" ? await db.select({patientId:medicineDispensations.patientId}).from(medicineDispensations).where(eq(medicineDispensations.id,id))
          : await db.select({patientId:healthLabOrders.patientId}).from(diagnosticLabReports).innerJoin(healthLabOrders,eq(healthLabOrders.id,diagnosticLabReports.orderId)).where(eq(diagnosticLabReports.id,id));
        const owner = row?.patientId;
        if (owner !== patientA) throw new Error(`Vazamento em ${model}:${id}`);
      }
    };
    await checkOwner(apptA.map(a => a.id), "appointment");
    await checkOwner(vacA.map(a => a.id), "vaccination");
    await checkOwner(dispA.map(a => a.id), "dispensation");
    await checkOwner(repA.map(a => a.id), "report");
    for (const r of repA) {
      const [full] = await db.select({status:diagnosticLabReports.status,publishedAt:diagnosticLabReports.publishedAt}).from(diagnosticLabReports).where(eq(diagnosticLabReports.id,r.id));
      if (full?.status !== "RELEASED" || !full.publishedAt) throw new Error("Laudo não liberado visível no portal");
    }
    const apptB = await portal.portalAppointments(ctx, patientB);
    if (apptA.some(a => apptB.some(b => b.id === a.id))) throw new Error("Interseção indevida entre pacientes");
    console.log(`isolamento portal ok (A:${apptA.length}/${vacA.length}/${dispA.length}/${repA.length} B:${apptB.length})`);

    // Timeline preserva tipos distintos
    const events = await timeline.listPatientTimeline(db, patientA, 50);
    const kinds = new Set(events.map(e => e.kind));
    console.log("timeline:", events.length, "eventos,", [...kinds].join(",") || "vazia");
    if (events.some(e => e.kind === "CONSULTA")) throw new Error("Evento genérico indevido");

    // Prestador A x B
    const [supplierB] = await db.select({id:suppliers.id}).from(suppliers).where(and(eq(suppliers.status,"Ativo"),ne(suppliers.id,supplier!.id))).limit(1);
    const guidesA = await provider.providerGuides(ctx, supplier!.id);
    for (const g of guidesA) {
      const [full] = await db.select({quota:{providerSupplierId:healthRegulationQuotas.providerSupplierId}}).from(healthRegulationRequests).leftJoin(healthRegulationQuotas,eq(healthRegulationQuotas.id,healthRegulationRequests.quotaId)).where(eq(healthRegulationRequests.id,g.id));
      if (full?.quota?.providerSupplierId !== supplier!.id) throw new Error("Guia de outro prestador visível");
    }
    if (supplierB && guidesA.length) {
      try {
        await provider.providerExecuteGuide(ctx, supplierB.id, { requestId: guidesA[0].id });
        throw new Error("Prestador B executou guia de A");
      } catch (e: unknown) {
        if (!(e instanceof Error) || !e.message.includes("não encontrada")) throw e;
        console.log("isolamento prestador ok");
      }
    } else console.log("isolamento prestador: sem guias/segundo prestador para cruzar");

    // Cancelamento não duplica (segunda chamada falha sem efeito)
    const [unit] = await db.select({id:healthUnits.id}).from(healthUnits).where(eq(healthUnits.isActive,true)).limit(1);
    const fresh = await portal.portalRequestAppointment(ctx, patientA, { unitId: unit!.id, date: "2026-10-05T09:00", specialty: null });
    await portal.portalTransitionAppointment(ctx, patientA, fresh.id, "Cancelado", "Desistência do paciente");
    try {
      await transitionHealthAppointment(ctx, { appointmentId: fresh.id, status: "Cancelado", cancellationReason: "repetido" });
      throw new Error("Cancelamento duplicado aceito");
    } catch (e: unknown) {
      if (!(e instanceof Error) || e.message.includes("duplicado aceito")) throw e;
      console.log("cancelamento idempotente ok");
    }
    await db.delete(healthAppointmentEvents).where(eq(healthAppointmentEvents.appointmentId,fresh.id));
    await db.delete(healthAppointments).where(eq(healthAppointments.id,fresh.id));

    // Ouvidoria via portal (anônima oculta + identificada visível; remove registros de teste)
    const [patient] = await db.select({personId:patients.personId}).from(patients).where(eq(patients.id,patientA));
    const personId = patient!.personId;
    const anon = await portal.portalCreateManifestation(ctx, personId, { type: "Sugestão", subject: "Sugestão sobre o atendimento", description: "Registro de sugestão para melhoria do atendimento.", isAnonymous: true });
    const identified = await portal.portalCreateManifestation(ctx, personId, { type: "Elogio", subject: "Elogio ao atendimento recebido", description: "Registro de elogio ao atendimento recebido na unidade.", isAnonymous: false });
    const own = await portal.portalManifestations(ctx, personId);
    console.log("ouvidoria portal:", anon.protocolNumber, identified.protocolNumber, "visíveis:", own.length);
    if (!own.some(o => o.id === identified.id)) throw new Error("Manifestação identificada deveria ser acompanhada");
    if (own.some(o => o.id === anon.id)) throw new Error("Manifestação anônima não deveria ser listada");
    for (const id of [anon.id, identified.id]) {
      await db.delete(ombudsmanAuditLogs).where(eq(ombudsmanAuditLogs.ombudsmanId,id));
      await db.delete(ombudsmanIdentities).where(eq(ombudsmanIdentities.ombudsmanId,id));
      await db.delete(ombudsmans).where(eq(ombudsmans.id,id));
    }

    // Carga SIGTAP repetida não duplica (dedup por checksum)
    const { execSync } = await import("node:child_process");
    const out = execSync("npx tsx --conditions=react-server scripts/load-sigtap-base.ts", { encoding: "utf-8" });
    if (!out.includes("SKIPPED_DUPLICATE")) throw new Error("Dedup da carga falhou");
    console.log("integração repetida sem duplicar ok");

    console.log(JSON.stringify({ status: "S5 READY" }));
  } finally {
    await databaseConnection.pool.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
