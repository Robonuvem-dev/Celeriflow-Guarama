import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { Decimal } from "../src/db/decimal";
import { people } from "../src/db/schema/people";
import { employees, roles } from "../src/db/schema/administration";
import { users } from "../src/db/schema/identity";
import * as s from "../src/db/schema/social";
import * as w from "../src/db/schema/social-workflows";
import { fleetDrivers, fleetUnits } from "../src/db/schema/fleet";
import { saveSocialWorkflow } from "../src/db/repositories/social/workflow-operations";
import { deliverBenefitInTransaction } from "../src/db/repositories/social/benefit-delivery";
import { previewSocialImport } from "../src/db/repositories/social/imports";
import { localCadunicoHeaders } from "../src/lib/social/cadunico-import";
import { syntheticCpf, syntheticCnpj, syntheticPersonName, syntheticPhone } from "../src/lib/poc/fixture-catalog";
import type { SocialWorkflowArea } from "../src/lib/social/workflow-contract";
import { accessProfiles } from "../src/db/schema/identity";
import { mkdirSync, writeFileSync } from "node:fs";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const datasetId = "social-poc-2026-v1", apply = process.argv.includes("--apply");
const today = new Date().toISOString().slice(0, 10);
const day = (offset: number) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  const connection = createDatabaseConnection(process.env.DATABASE_URL);
  try {
    const rollback = new Error("SOCIAL_POPULATION_PREVIEW_ROLLBACK");
    let result: Record<string, unknown> = {};
    try { result = await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${datasetId},0))`);
      if ((await tx.select().from(w.socialPocDatasets).where(eq(w.socialPocDatasets.id, datasetId))).length) return { replay: true, datasetId };
      const [actor] = await tx.select({ id: users.id }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(and(eq(users.ativo, true), eq(accessProfiles.ativo, true), eq(accessProfiles.codigo, "SYSTEM_ADMINISTRATOR"))).limit(1);
      if (!actor) throw new Error("Administrador existente não localizado.");
      const units = await tx.select().from(s.socialUnits).where(eq(s.socialUnits.isActive, true));
      if (!units.length || units.some(u => !u.id.startsWith("aurora-system-v1:"))) throw new Error("A carga requer as unidades sintéticas Aurora já identificadas no diagnóstico.");
      const [professional] = await tx.select().from(employees).where(eq(employees.id, "aurora-system-v1:employee:003"));
      const [role] = await tx.select().from(roles).where(eq(roles.id, "aurora-system-v1:role:003"));
      if (!professional?.personId || !role) throw new Error("Equipe/cargo sintético de origem não encontrado.");
      const access = { administrator: true, employeeId: professional.id, userId: actor.id, links: [] };
      const save = (area: SocialWorkflowArea, values: Record<string, string>, id?: string) => saveSocialWorkflow(tx, access, area, id, values);
      for (const [i, unit] of units.entries()) {
        const [registration] = await tx.select().from(w.socialUnitRegistrations).where(eq(w.socialUnitRegistrations.unitId, unit.id));
        await save("unidades", { name: unit.name, type: unit.type, cnpj: registration?.cnpj || syntheticCnpj(25000 + i), legalName: registration?.legalName || unit.name, stateRegistration: "ISENTO", unitNumber: registration?.unitNumber || `SUAS-${String(i + 1).padStart(3, "0")}`, phone: unit.phone || syntheticPhone(700 + i), managerId: professional.id, streetAddress: unit.streetAddress || "Rua das Veredas, 100, Centro", municipality: "Aurora das Veredas/MG" }, unit.id);
        await save("profissionais", { employeeId: professional.id, unitId: unit.id, roleId: role.id, council: "CRESS-MG", registration: "19347", startsAt: day(-120), endsAt: "", individualScope: "UNIT", familyScope: "UNIT" });
      }
      for (const [kind, name] of [["INCOME", "Renda do trabalho"], ["EXPENSE", "Alimentação e moradia"], ["VULNERABILITY", "Insegurança alimentar"], ["POTENTIALITY", "Rede de apoio familiar"], ["REFERRAL_REASON", "Atualização cadastral CadÚnico"], ["PRIORITY", "Família com crianças"]]) await tx.insert(s.socialCatalogEntries).values({ kind, name, description: "Referência para avaliação socioeconômica e acompanhamento familiar." }).onConflictDoNothing();
      await tx.insert(s.socialMinimumWages).values({ validFrom: new Date(`${day(-120)}T00:00:00Z`), value: new Decimal("1621.00") }).onConflictDoNothing();
      const [program] = await tx.insert(s.socialPrograms).values({ id: `${datasetId}:program`, name: "Apoio às Famílias das Veredas", sphere: "Municipal", description: "Acompanhamento familiar, orientação documental e acesso aos serviços comunitários." }).returning();
      const beneficiaries: { id: string; birthDate: string; unitId: string }[] = [], familyIds: string[] = [];
      for (let i = 0; i < 25; i++) {
        const unitId = units[i % units.length].id;
        const familyPeople: string[] = [];
        for (let member = 0; member < 2 + i % 2; member++) {
          const priorId = i < 10 && member < 2 ? `aurora-system-v1:person:${String(member === 0 ? i : i + 40).padStart(3, "0")}` : undefined;
          const [prior] = priorId ? await tx.select().from(people).where(eq(people.id, priorId)) : [];
          const birthDate = prior?.birthDate?.toISOString().slice(0, 10) || `${member === 0 ? i % 5 === 0 ? 1950 : 1980 + i % 15 : 2015 + i % 3}-03-12`;
          const fullName = prior?.fullName || syntheticPersonName(3000 + i * 3 + member);
          const personId = await save("beneficiarios", { unitId, fullName, socialName: "", cpf: prior?.cpf || syntheticCpf(25000 + i * 3 + member), birthDate, birthPlace: "Aurora das Veredas/MG", nationality: "Brasileira", raceColor: ["Parda", "Branca", "Preta"][i % 3], maritalStatus: member ? "Solteiro(a)" : "União estável", motherName: "Não informada", fatherName: "Não informado", gender: "Não informado", religion: "Não informada", phonePrimary: prior?.phonePrimary || syntheticPhone(1000 + i), email: prior?.email || `familia.${101 + i}.${member + 1}@auroradasveredas.example`, rg: String(21000300 + i * 3 + member), nis: String(40000000000 + i * 3 + member), birthCertificate: "", registeredAt: day(-60), zipCode: "30000000", streetName: "Rua das Veredas", number: String(100 + i), complement: "" }, prior?.id);
          familyPeople.push(personId); beneficiaries.push({ id: personId, birthDate, unitId });
        }
        const [priorFamily] = i < 10 ? await tx.select().from(s.socialFamilies).where(eq(s.socialFamilies.id, `aurora-system-v1:social-family:${String(i).padStart(3, "0")}`)) : [];
        const familyId = await save("familias", { unitId, representativeId: familyPeople[0], familyCode: priorFamily?.familyCode || `2026${String(901 + i).padStart(5, "0")}`, nis: String(40000000000 + i * 3), income: String(1200 + i * 75), vulnerabilities: "Renda familiar variável e necessidade de orientação para acesso à rede de serviços." }, priorFamily?.id);
        familyIds.push(familyId);
        for (const personId of familyPeople.slice(1)) {
          const [existing] = await tx.select().from(s.socialFamilyMembers).where(eq(s.socialFamilyMembers.personId, personId));
          await save("membros", { unitId, familyId, personId, kinship: "FILHO" }, existing?.id);
        }
        await save("participacoes", { unitId, familyId, personId: "", programId: program.id, registeredAt: day(-50), includedAt: day(-45), excludedAt: "", benefitValue: "150.00", benefitNumber: `2026/${String(901 + i).padStart(6, "0")}` });
        const followupId = await save("acompanhamentos", { unitId, familyId, personId: "", professionalId: professional.id, service: units[i % units.length].type === "CREAS" ? "PAEFI" : "PAIF", startsAt: day(-40), endsAt: "", diagnosis: "Renda variável e dificuldade para organizar os documentos de acesso aos serviços.", objectives: "Fortalecer acesso à rede e segurança alimentar.", actions: "Visita, orientação e revisão em 30 dias.", reviewAt: day(20), status: "ACTIVE" });
        await save("evolucoes", { followupId, occurredAt: day(-5), description: "Família compareceu à orientação, apresentou comprovante de residência e pactuou retorno para atualização cadastral.", nextReviewAt: day(20) });
        await save("visitas", { unitId, familyId, professionalId: professional.id, scheduledDate: `${day(i % 3 === 0 ? -5 : 5)}T09:00`, objective: "Orientação e atualização do acompanhamento familiar.", status: i % 3 === 0 ? "Realizada" : "Agendada", realizedDate: i % 3 === 0 ? `${day(-5)}T09:15` : "", report: i % 3 === 0 ? "Visita realizada com escuta da família, conferência das condições de moradia e orientação sobre a rede de apoio." : "" });
        await tx.insert(s.socialAttendances).values({ unitId, familyId, personId: familyPeople[0], professionalId: professional.id, type: i % 2 ? "PAIF" : "Acolhimento", description: "Orientação sobre documentação, acesso à rede de serviços e retorno para acompanhamento.", date: new Date(`${day(-(i % 28))}T10:00:00-03:00`) });
        await save("condicionalidades", { unitId, personId: familyPeople[0], programId: program.id, kind: ["Saúde", "Educação", "Recadastramento"][i % 3], dueAt: day(i % 4 === 0 ? -3 : 15), occurredAt: i % 4 === 0 ? day(-2) : "", effect: "Sem efeito financeiro; orientação e acompanhamento da equipe", suspensionFrom: "", suspensionUntil: "", status: i % 4 === 0 ? "NONCOMPLIANCE" : "PENDING", observations: "Acompanhamento do programa municipal com orientação registrada e retorno pactuado com a família." });
      }
      const benefits = await tx.select().from(s.socialBenefits).where(eq(s.socialBenefits.isActive, true));
      for (const benefit of benefits) {
        await tx.update(s.socialBenefits).set({ maxPerRequest: 10, authorizerEmployeeId: professional.id, requiresApproval: true }).where(eq(s.socialBenefits.id, benefit.id));
        await tx.insert(w.socialBenefitClassifications).values({ benefitId: benefit.id, sphere: "Municipal" }).onConflictDoNothing();
        for (const [index, unit] of units.entries()) { await tx.insert(s.socialBenefitStocks).values({ benefitId: benefit.id, unitId: unit.id, quantity: 200 }).onConflictDoUpdate({ target: [s.socialBenefitStocks.benefitId, s.socialBenefitStocks.unitId], set: { quantity: sql`${s.socialBenefitStocks.quantity} + 200` } }); await tx.insert(s.socialBenefitStockMovements).values({ benefitId: benefit.id, unitId: unit.id, direction: "IN", quantity: 200, supplierName: "Vale Verde Alimentos Ltda.", invoiceNumber: `000${9101 + benefits.indexOf(benefit) * units.length + index}`, invoiceDate: new Date(`${day(-30)}T00:00:00Z`), invoiceValue: new Decimal(10000), createdBy: actor.id }); }
      }
      for (let i = 0; i < familyIds.length; i++) {
        const benefit = benefits[i % benefits.length], unitId = units[i % units.length].id;
        const [family] = await tx.select().from(s.socialFamilies).where(eq(s.socialFamilies.id, familyIds[i]));
        const [request] = await tx.insert(s.socialBenefitRequests).values({ familyId: family.id, personId: i % 2 ? family.representativeId : null, unitId, reason: "Apoio temporário para segurança alimentar e atendimento de necessidade familiar identificada no acompanhamento.", createdBy: actor.id, createdAt: new Date(`${day(-20)}T10:00:00Z`), cancelledAt: i % 5 === 4 ? new Date() : null, cancellationReason: i % 5 === 4 ? "Solicitação cancelada a pedido da família após reorganização da rede de apoio." : null }).returning();
        await tx.insert(w.socialRequestDetails).values({ requestId: request.id, professionalId: professional.id, requestedAt: day(-20), applicantId: family.representativeId, recipientId: family.representativeId, deliveryType: i % 2 ? "DOMICILIAR" : "RETIRADA" });
        const status = ["PENDING", "APPROVED", "APPROVED", "DENIED", "CANCELLED"][i % 5];
        const [item] = await tx.insert(s.socialBenefitRequestItems).values({ requestId: request.id, benefitId: benefit.id, quantity: 1, status, approvalRequired: true, dispensingMode: "QUANTITY", quotaControlled: false, authorizerEmployeeId: professional.id, evaluatedBy: status === "PENDING" ? null : actor.id, evaluatedAt: status === "PENDING" ? null : new Date(`${day(-10)}T10:00:00Z`), assessment: status === "PENDING" ? null : status === "DENIED" ? "A avaliação não identificou necessidade do item solicitado; mantidas orientação e oferta de acompanhamento." : "Concessão compatível com a necessidade temporária registrada no atendimento familiar." }).returning();
        if (i % 5 === 2) await deliverBenefitInTransaction(tx, access, { itemId: item.id, actorId: actor.id, reason: "Item entregue ao responsável com orientação e registro de recebimento.", today: new Date(`${day(-1)}T00:00:00Z`), deliveredAt: new Date(`${day(-1)}T12:00:00Z`) });
      }
      const [reason] = await tx.select().from(s.socialCatalogEntries).where(eq(s.socialCatalogEntries.kind, "REFERRAL_REASON"));
      const [destination] = await tx.insert(s.socialNetworkOrganizations).values({ name: "Posto Municipal do Cadastro Único", organizationType: "CADUNICO", address: "Rua das Veredas, 100, Centro", phone: syntheticPhone(999), usesCounterReference: true }).returning();
      for (let i = 0; i < 6; i++) { const [referral] = await tx.insert(s.socialReferrals).values({ unitId: units[i % units.length].id, familyId: familyIds[i], destinationOrganizationId: destination.id, reasonId: reason.id, referenceProfessional: professional.name, objective: "Atualização cadastral e orientação sobre documentação.", referredAt: new Date(`${day(-8)}T00:00:00Z`), status: i % 2 ? "RETURNED" : "OPEN", counterReferenceAt: i % 2 ? new Date(`${day(-3)}T00:00:00Z`) : null, counterReferenceProfessional: i % 2 ? professional.name : null, counterReferenceDescription: i % 2 ? "Documentos conferidos e cadastro atualizado; família orientada sobre o próximo retorno." : null, createdBy: actor.id }).returning(); await tx.insert(w.socialReferralDetails).values({ referralId: referral.id, professionalId: professional.id, referralType: "Atualização CadÚnico" }); }
      for (const [min, max, name] of [[6, 14, "Caminhos da infância"], [18, 59, "Laços comunitários"], [60, 130, "Convivência e memória"]] as const) {
        const unitId = units[0].id;
        const groupId = await save("scfv", { unitId, realizationUnitId: unitId, name, serviceType: "Convivência e fortalecimento de vínculos", ageMin: String(min), ageMax: String(max), registeredAt: day(-60), startsAt: day(-60), endsAt: day(90), professionalId: professional.id, referenceProfessionalId: professional.id, advisorId: professional.id, facilitatorId: professional.id, weekdays: "[1,3,5]", startTime: "14:00", endTime: "16:00" });
        const eligible = beneficiaries.filter(p => { const age = Number(day(-45).slice(0, 4)) - Number(p.birthDate.slice(0, 4)); return p.unitId === unitId && age >= min + 1 && age <= max - 1; }).slice(0, 12);
        const enrollmentIds: string[] = [];
        for (const p of eligible) enrollmentIds.push(await save("matriculas", { groupId, personId: p.id, enrolledAt: day(-45), leftAt: "", exitReason: "" }));
        const eventId = await save("eventos", { groupId, title: "Oficina comunitária de convivência", occursAt: day(-2), planning: "Roda de conversa, atividade coletiva e avaliação participativa.", status: "REALIZED", report: "Roda de conversa e atividade coletiva realizadas; participantes avaliaram o encontro e sugeriram temas para a próxima oficina." });
        for (const [i, enrollmentId] of enrollmentIds.entries()) await save("presencas", { eventId, enrollmentId, present: i % 4 ? "true" : "false", justification: i % 4 ? "" : "Ausência comunicada pela família por compromisso de saúde." });
        await save("eventos", { groupId, title: "Próximo encontro do grupo", occursAt: day(7), planning: "Planejamento de atividade futura com o grupo.", status: "PLANNED", report: "" });
      }
      const questionnaireId = await save("formularios", { unitId: units[0].id, title: "Avaliação de acesso à rede socioassistencial", questions: JSON.stringify([{ key: "demanda", label: "Demanda principal", type: "SHORT", required: true, options: [] }, { key: "relato", label: "Relato familiar", type: "LONG", required: false, options: [] }, { key: "contato", label: "Telefone de contato confirmado", type: "CHECKBOX", required: true, options: [] }, { key: "rede", label: "Rede de apoio", type: "SINGLE", required: true, options: ["Familiar", "Comunitária"] }, { key: "servicos", label: "Serviços acessados", type: "MULTIPLE", required: true, options: ["Saúde", "Educação", "Assistência Social"] }]) });
      await save("respostas", { questionnaireId, familyId: familyIds[0], personId: "", answeredAt: day(-1), answers: JSON.stringify({ demanda: "Orientação sobre serviços", relato: "A família relata apoio de vizinhos e solicita orientação para organizar os atendimentos da rede.", contato: true, rede: "Comunitária", servicos: ["Saúde", "Assistência Social"] }) });
      // Keep outbound notifications for the real communication lifecycle; population creates no SMS queue.
      const [vehicle] = await tx.select().from(fleetUnits).where(eq(fleetUnits.departmentId, professional.departmentId!));
      if (vehicle) {
        await tx.update(fleetUnits).set({ manufactureYear: vehicle.year || 2023, modelYear: vehicle.year || 2023, rntrc: "Não aplicável — uso municipal" }).where(eq(fleetUnits.id, vehicle.id));
        const [driver] = await tx.insert(fleetDrivers).values({ personId: professional.personId!, departmentId: professional.departmentId!, employeeId: professional.id, outsourced: false, cnhNumber: "25000123456", cnhCategories: ["B"], firstLicenseAt: new Date("2010-01-10T00:00:00Z"), cnhExpiresAt: new Date("2030-12-31T00:00:00Z"), policyReference: "Deslocamentos da equipe para acompanhamento das famílias.", createdById: actor.id }).onConflictDoNothing().returning();
        if (driver) await tx.execute(sql`INSERT INTO "FleetBooking"(id,"unitId","driverId",kind,purpose,"startsAt","endsAt","createdById") VALUES (${`${datasetId}:booking`},${vehicle.id},${driver.id},'VIAGEM','Visitas de acompanhamento familiar',${new Date(`${day(5)}T09:00:00-03:00`)},${new Date(`${day(5)}T11:00:00-03:00`)},${actor.id})`);
      }
      await previewSocialImport(tx, { unitId: units[0].id, filename: "cadastro-familias-novembro-2026.csv", content: localCadunicoHeaders.join(";") + "\n" + [syntheticCpf(35000), "45000000001", "João Carlos Moreira", "20260000926", "RESPONSAVEL", "1985-03-12", "1200.00", syntheticPhone(1800), "Rua das Veredas, 999", "Aurora das Veredas", "MG"].join(";"), actorId: actor.id });
      await tx.insert(w.socialPocDatasets).values({ id: datasetId, referenceDate: today });
      result = { datasetId, families: familyIds.length, beneficiaries: beneficiaries.length, externalSmsSent: false, referenceDate: today, familyIds };
      if (!apply) throw rollback;
      return result;
    }, { timeoutMs: 240000, lockTimeoutMs: 15000 });
    } catch (error) { if (error !== rollback) throw error; }
    const output = "docs/plano-populacao-2026-11-08/execucao/social";
    mkdirSync(output, { recursive: true });
    const report = { ...result, mode: apply ? "APPLY" : "PREVIEW_ROLLED_BACK", status: "PASS" };
    writeFileSync(`${output}/${apply ? "applied" : "preview"}.json`, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na carga Social."); process.exitCode = 1; });
