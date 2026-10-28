import { eq } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import type { JsonObject } from "@/db/json";
import type { HealthAdministrativeMergeInput as MergeInput } from "@/lib/contracts/health-management-operations";
import { addresses } from "@/db/schema/registry";
import { patients, healthPatientRegistrationChanges, healthPatientContacts, healthPatientCalls } from "@/db/schema/health-registration";
import { healthProfessionals } from "@/db/schema/health-workforce";
import { healthAppointments, healthWaitlists } from "@/db/schema/health-agenda";
import { medicalRecords, healthExamRequests, healthReferrals, healthPatientConditions, healthOngoingMedications, healthObservations } from "@/db/schema/health-care";
import { healthPrescriptions } from "@/db/schema/health-prescriptions";
import { medicineDispensations, pharmacyRequests, healthPharmacyJudicialCases, healthPharmacyKitDeliveries } from "@/db/schema/health-pharmacy";
import { vaccinationRecords, healthVaccinationCardEvents, healthVaccineAdverseEvents } from "@/db/schema/health-vaccination";
import { healthHomeCareRequests, healthFoodMarkers, healthHomeVisitParticipants, healthEsusForms } from "@/db/schema/health-territory";
import { healthPregnancies, healthChronicAssessments, healthClinicalScreenings, healthDentalMarks, specializedTherapeuticPlans } from "@/db/schema/health-care-lines";
import { healthCareProgramEnrollments } from "@/db/schema/health-programs";
import { healthPanelCalls, healthRegulationRequests } from "@/db/schema/health-regulation";
import { healthLabOrders } from "@/db/schema/health-laboratory";
import { diagnosticSpecializedQuotas, diagnosticSpecializedDistributions } from "@/db/schema/health-diagnostics";
import { healthTfdRequests, healthTfdPassengers } from "@/db/schema/health-tfd";
import { healthProductionFacts } from "@/db/schema/health-production";
import { healthReceptions, healthBedOccupancies } from "@/db/schema/health-reception";
import { healthRegistrationStatusHistory } from "@/db/schema/health-administration";
import { managementAdministrativeMerges } from "@/db/schema/health-management-operations";
import { lockManagementMergeRecords, readManagementMergePatients, readManagementMergeProfessionals, countManagementActivePregnancies, moveManagementMergeLinks, transferManagementPatientProfile, transferManagementProfessionalAssignments } from "@/db/repositories/health-management-operations/merge";
import { assertAddressMergeCriteria, assertPatientMergeCriteria, assertProfessionalMergeCriteria } from "./health-merge-policy";

async function mergeInTransaction(tx: DatabaseTransaction, input: MergeInput) {
  let criteria: JsonObject;
  let result: JsonObject;
  if (input.kind === "ADDRESS") {
    await lockManagementMergeRecords(tx, addresses, [input.targetId, input.sourceId]);
    const [target] = await tx.select().from(addresses).where(eq(addresses.id, input.targetId));
    const [source] = await tx.select().from(addresses).where(eq(addresses.id, input.sourceId));
    if (!target || !source) throw new Error("Endereço não encontrado.");
    if (source.canonicalAddressId) throw new Error("O endereço de origem já foi unificado.");
    criteria = assertAddressMergeCriteria(target, source);
    await tx.update(addresses).set({ canonicalAddressId: target.id }).where(eq(addresses.id, source.id));
    result = { canonicalAddressId: target.id, preservedAddressId: source.id };
  } else if (input.kind === "PATIENT") {
    await lockManagementMergeRecords(tx, patients, [input.targetId, input.sourceId]);
    const records = await readManagementMergePatients(tx, [input.targetId, input.sourceId]);
    const target = records.find(r => r.id === input.targetId), source = records.find(r => r.id === input.sourceId);
    if (!target || !source || target.status === "Unificado" || source.status === "Unificado") throw new Error("Prontuário ativo não encontrado.");
    criteria = assertPatientMergeCriteria(target.person, source.person);
    if (await countManagementActivePregnancies(tx, [source.id, target.id]) > 1) throw new Error("Confira e encerre a gestação duplicada antes de unificar os pacientes.");
    const moved: Record<string, number> = {};
    const links = [
      ["appointments", healthAppointments], ["records", medicalRecords], ["prescriptions", healthPrescriptions], ["dispensations", medicineDispensations], ["vaccinations", vaccinationRecords], ["examRequests", healthExamRequests], ["referrals", healthReferrals],
      ["clinicalConditions", healthPatientConditions], ["ongoingMedications", healthOngoingMedications], ["homeCareRequests", healthHomeCareRequests], ["foodMarkers", healthFoodMarkers], ["pregnancies", healthPregnancies], ["chronicAssessments", healthChronicAssessments], ["screenings", healthClinicalScreenings], ["dentalMarks", healthDentalMarks], ["judicialPharmacyCases", healthPharmacyJudicialCases], ["pharmacyKitDeliveries", healthPharmacyKitDeliveries], ["careProgramEnrollments", healthCareProgramEnrollments], ["vaccinationCardEvents", healthVaccinationCardEvents], ["vaccineAdverseEvents", healthVaccineAdverseEvents], ["panelCalls", healthPanelCalls],
      ["laboratory", healthLabOrders], ["therapeuticPlans", specializedTherapeuticPlans], ["specializedQuotas", diagnosticSpecializedQuotas], ["specializedDistributions", diagnosticSpecializedDistributions], ["pharmacyRequests", pharmacyRequests], ["regulation", healthRegulationRequests], ["tfdRequests", healthTfdRequests], ["tfdPassengers", healthTfdPassengers], ["production", healthProductionFacts], ["visits", healthHomeVisitParticipants], ["esusForms", healthEsusForms], ["waitlists", healthWaitlists], ["receptions", healthReceptions], ["bedOccupancies", healthBedOccupancies], ["observations", healthObservations], ["registrationHistory", healthPatientRegistrationChanges], ["contacts", healthPatientContacts], ["phoneCalls", healthPatientCalls],
    ] as const;
    for (const [name, table] of links) moved[name] = await moveManagementMergeLinks(tx, table, "patientId", target.id, source.id);
    const { sourceProfile, sourceDocuments } = await transferManagementPatientProfile(tx, target.id, source.id);
    await tx.update(patients).set({ status: "Unificado" }).where(eq(patients.id, source.id));
    result = JSON.parse(JSON.stringify({ moved, sourceStatus: "Unificado", preservedSourceProfile: sourceProfile, preservedSourceDocumentLinks: sourceDocuments }));
  } else {
    await lockManagementMergeRecords(tx, healthProfessionals, [input.targetId, input.sourceId]);
    const records = await readManagementMergeProfessionals(tx, [input.targetId, input.sourceId]);
    const target = records.find(r => r.id === input.targetId), source = records.find(r => r.id === input.sourceId);
    if (!target || !source || !target.isActive || !source.isActive) throw new Error("Profissional ativo não encontrado.");
    criteria = assertProfessionalMergeCriteria(target.employee.name, source.employee.name);
    const moved: Record<string, number> = {};
    for (const [name, table] of [["healthAppointment", healthAppointments], ["medicalRecord", medicalRecords], ["healthPrescription", healthPrescriptions], ["vaccinationRecord", vaccinationRecords], ["healthExamRequest", healthExamRequests], ["healthReferral", healthReferrals]] as const) moved[name] = await moveManagementMergeLinks(tx, table, "professionalId", target.id, source.id);
    Object.assign(moved, await transferManagementProfessionalAssignments(tx, target.id, source.id));
    moved.statusHistory = await moveManagementMergeLinks(tx, healthRegistrationStatusHistory, "professionalId", target.id, source.id);
    await tx.update(healthProfessionals).set({ isActive: false, inactivatedAt: new Date(), inactivationReason: `Unificado ao profissional ${target.id}` }).where(eq(healthProfessionals.id, source.id));
    result = { moved, sourceStatus: "Inativo por unificação" };
  }
  const [merge] = await tx.insert(managementAdministrativeMerges).values({ kind: input.kind, targetId: input.targetId, sourceIds: [input.sourceId], criteria, result, actorUsuarioId: input.actorUsuarioId }).returning({ id: managementAdministrativeMerges.id });
  return merge.id;
}

export async function executeHealthAdministrativeMerge(connection: DatabaseConnection, input: MergeInput, transaction?: DatabaseTransaction): Promise<string> {
  if (!input.targetId || !input.sourceId || input.targetId === input.sourceId) throw new Error("Selecione registros de origem e principal diferentes.");
  if (transaction) return mergeInTransaction(transaction, input);
  return withDatabaseTransaction(connection, tx => mergeInTransaction(tx, input), { timeoutMs: 5000 });
}
