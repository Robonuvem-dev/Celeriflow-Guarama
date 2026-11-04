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

config({ path: ".env.local", quiet: true });
const datasetId = "social-poc-2026-v1", apply = process.argv.includes("--apply");
const today = new Date().toISOString().slice(0, 10);
const day = (offset: number) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  const connection = createDatabaseConnection(process.env.DATABASE_URL);
  try {
    if (!apply) { console.log("Prévia: carga sintética aditiva de 25 famílias, cadastros completos, vínculos, benefícios, SCFV, visitas e relatórios. Use --apply para aplicar no DATABASE_URL de .env.local."); return; }
    const result = await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${datasetId},0))`);
      if ((await tx.select().from(w.socialPocDatasets).where(eq(w.socialPocDatasets.id, datasetId))).length) return { replay: true, datasetId };
      const [actor] = await tx.select().from(users).where(and(eq(users.email, "admin@email.com"), eq(users.ativo, true)));
      if (!actor) throw new Error("Administrador existente não localizado.");
      const units = await tx.select().from(s.socialUnits).where(eq(s.socialUnits.isActive, true));
      if (!units.length || units.some(u => !u.id.startsWith("aurora-system-v1:"))) throw new Error("A carga requer as unidades sintéticas Aurora já identificadas no diagnóstico.");
      const [professional] = await tx.select().from(employees).where(eq(employees.id, "aurora-system-v1:employee:003"));
      const [role] = await tx.select().from(roles).where(eq(roles.id, "aurora-system-v1:role:003"));
      if (!professional?.personId || !role) throw new Error("Equipe/cargo sintético de origem não encontrado.");
      const access = { administrator: true, employeeId: professional.id, userId: actor.id, links: [] };
      const save = (area: SocialWorkflowArea, values: Record<string, string>, id?: string) => saveSocialWorkflow(tx, access, area, id, values);
      for (const [i, unit] of units.entries()) {
        await save("unidades", { name: unit.name, type: unit.type, cnpj: syntheticCnpj(25000 + i), legalName: `Unidade socioassistencial ${unit.name} — cenário sintético`, stateRegistration: "ISENTO", unitNumber: `AV-SUAS-${i + 1}`, phone: syntheticPhone(700 + i), managerId: professional.id, streetAddress: unit.streetAddress || "Rua das Veredas, 100", municipality: "Aurora das Veredas/MG" }, unit.id);
        await save("profissionais", { employeeId: professional.id, unitId: unit.id, roleId: role.id, council: "CRESS — demonstração", registration: `POC-${1000 + i}`, startsAt: day(-120), endsAt: "", individualScope: "UNIT", familyScope: "UNIT" });
      }
      for (const [kind, name] of [["INCOME", "Renda do trabalho"], ["EXPENSE", "Alimentação e moradia"], ["VULNERABILITY", "Insegurança alimentar"], ["POTENTIALITY", "Rede de apoio familiar"], ["REFERRAL_REASON", "Atualização cadastral CadÚnico"], ["PRIORITY", "Família com crianças"]]) await tx.insert(s.socialCatalogEntries).values({ kind, name, description: "Catálogo local de demonstração; validar critérios municipais." }).onConflictDoNothing();
      await tx.insert(s.socialMinimumWages).values({ validFrom: new Date(`${day(-120)}T00:00:00Z`), value: new Decimal("1621.00") }).onConflictDoNothing();
      const [program] = await tx.insert(s.socialPrograms).values({ id: `${datasetId}:program`, name: "Programa municipal de apoio às famílias — POC", sphere: "Municipal", description: "Cenário sintético de demonstração." }).returning();
      const beneficiaries: { id: string; birthDate: string; unitId: string }[] = [], familyIds: string[] = [];
      for (let i = 0; i < 25; i++) {
        const unitId = units[i % units.length].id;
        const familyPeople: string[] = [];
        for (let member = 0; member < 2 + i % 2; member++) {
          const priorId = i < 10 && member < 2 ? `aurora-system-v1:person:${String(member === 0 ? i : i + 40).padStart(3, "0")}` : undefined;
          const [prior] = priorId ? await tx.select().from(people).where(eq(people.id, priorId)) : [];
          const birthDate = prior?.birthDate?.toISOString().slice(0, 10) || `${member === 0 ? i % 5 === 0 ? 1950 : 1980 + i % 15 : 2015 + i % 3}-03-12`;
          const fullName = prior?.fullName || syntheticPersonName(3000 + i * 3 + member);
          const personId = await save("beneficiarios", { unitId, fullName, socialName: "", cpf: prior?.cpf || syntheticCpf(25000 + i * 3 + member), birthDate, birthPlace: "Aurora das Veredas/MG — fictícia", nationality: "Brasileira", raceColor: ["Parda", "Branca", "Preta"][i % 3], maritalStatus: member ? "Solteiro(a)" : "União estável", motherName: "Filiação materna de demonstração", fatherName: "Filiação paterna de demonstração", gender: i % 2 ? "Feminino" : "Masculino", religion: "Não informada", phonePrimary: syntheticPhone(1000 + i), email: `social.poc.${i}.${member}@auroradasveredas.example`, rg: `POC-${i}-${member}`, nis: String(40000000000 + i * 3 + member), birthCertificate: `Certidão sintética ${i}/${member}`, registeredAt: day(-60), zipCode: "30000000", streetName: "Rua das Veredas", number: String(100 + i), complement: "Cenário sintético" }, prior?.id);
          familyPeople.push(personId); beneficiaries.push({ id: personId, birthDate, unitId });
        }
        const [priorFamily] = i < 10 ? await tx.select().from(s.socialFamilies).where(eq(s.socialFamilies.id, `aurora-system-v1:social-family:${String(i).padStart(3, "0")}`)) : [];
        const familyId = await save("familias", { unitId, representativeId: familyPeople[0], familyCode: priorFamily?.familyCode || `AV-POC-${i + 1}`, nis: String(40000000000 + i * 3), income: String(1200 + i * 75), vulnerabilities: "Condições sintéticas para demonstrar acompanhamento e evolução." }, priorFamily?.id);
        familyIds.push(familyId);
        for (const personId of familyPeople.slice(1)) {
          const [existing] = await tx.select().from(s.socialFamilyMembers).where(eq(s.socialFamilyMembers.personId, personId));
          await save("membros", { unitId, familyId, personId, kinship: "FILHO" }, existing?.id);
        }
        await save("participacoes", { unitId, familyId, personId: "", programId: program.id, registeredAt: day(-50), includedAt: day(-45), excludedAt: "", benefitValue: "150.00", benefitNumber: `POC-BEN-${i + 1}` });
        const followupId = await save("acompanhamentos", { unitId, familyId, personId: "", professionalId: professional.id, service: units[i % units.length].type === "CREAS" ? "PAEFI" : "PAIF", startsAt: day(-40), endsAt: "", diagnosis: "Avaliação socioeconômica sintética da família.", objectives: "Fortalecer acesso à rede e segurança alimentar.", actions: "Visita, orientação e revisão em 30 dias.", reviewAt: day(20), status: "ACTIVE" });
        await save("evolucoes", { followupId, occurredAt: day(-5), description: "Família compareceu à orientação e apresentou documentação do cenário POC.", nextReviewAt: day(20) });
        await save("visitas", { unitId, familyId, professionalId: professional.id, scheduledDate: `${day(i % 3 === 0 ? -5 : 5)}T09:00`, objective: "Orientação e atualização do acompanhamento familiar.", status: i % 3 === 0 ? "Realizada" : "Agendada", realizedDate: i % 3 === 0 ? `${day(-5)}T09:15` : "", report: i % 3 === 0 ? "Visita de demonstração realizada; condições domiciliares registradas no acompanhamento." : "" });
        await tx.insert(s.socialAttendances).values({ unitId, familyId, personId: familyPeople[0], professionalId: professional.id, type: i % 2 ? "PAIF" : "Acolhimento", description: "Atendimento sintético de orientação, análise documental e acesso à rede.", date: new Date(`${day(-(i % 28))}T10:00:00-03:00`) });
        await save("condicionalidades", { unitId, personId: familyPeople[0], programId: program.id, kind: ["Saúde", "Educação", "Recadastramento"][i % 3], dueAt: day(15), occurredAt: i % 4 === 0 ? day(-2) : "", effect: i % 4 === 0 ? "Advertência demonstrativa — validar regra municipal" : "Sem efeito registrado", suspensionFrom: "", suspensionUntil: "", status: i % 4 === 0 ? "NONCOMPLIANCE" : "PENDING", observations: "Dados sintéticos; não representam efeito ou decisão de programa federal." });
      }
      const benefits = await tx.select().from(s.socialBenefits).where(eq(s.socialBenefits.isActive, true));
      for (const benefit of benefits) {
        await tx.update(s.socialBenefits).set({ maxPerRequest: 10, authorizerEmployeeId: professional.id, requiresApproval: true }).where(eq(s.socialBenefits.id, benefit.id));
        await tx.insert(w.socialBenefitClassifications).values({ benefitId: benefit.id, sphere: "Municipal" }).onConflictDoNothing();
        for (const unit of units) { await tx.insert(s.socialBenefitStocks).values({ benefitId: benefit.id, unitId: unit.id, quantity: 200 }).onConflictDoUpdate({ target: [s.socialBenefitStocks.benefitId, s.socialBenefitStocks.unitId], set: { quantity: sql`${s.socialBenefitStocks.quantity} + 200` } }); await tx.insert(s.socialBenefitStockMovements).values({ benefitId: benefit.id, unitId: unit.id, direction: "IN", quantity: 200, supplierName: "Fornecedor sintético POC", invoiceNumber: `${datasetId}-${benefit.id}`, invoiceDate: new Date(`${day(-30)}T00:00:00Z`), invoiceValue: new Decimal(10000), createdBy: actor.id }); }
      }
      for (let i = 0; i < familyIds.length; i++) {
        const benefit = benefits[i % benefits.length], unitId = units[i % units.length].id;
        const [family] = await tx.select().from(s.socialFamilies).where(eq(s.socialFamilies.id, familyIds[i]));
        const [request] = await tx.insert(s.socialBenefitRequests).values({ familyId: family.id, personId: i % 2 ? family.representativeId : null, unitId, reason: "Solicitação sintética para demonstrar análise e entrega de benefício eventual.", createdBy: actor.id, createdAt: new Date(`${day(-20)}T10:00:00Z`), cancelledAt: i % 5 === 4 ? new Date() : null, cancellationReason: i % 5 === 4 ? "Cancelamento demonstrativo solicitado pela família." : null }).returning();
        await tx.insert(w.socialRequestDetails).values({ requestId: request.id, professionalId: professional.id, requestedAt: day(-20), applicantId: family.representativeId, recipientId: family.representativeId, deliveryType: i % 2 ? "DOMICILIAR" : "RETIRADA" });
        const status = ["PENDING", "APPROVED", "APPROVED", "DENIED", "CANCELLED"][i % 5];
        const [item] = await tx.insert(s.socialBenefitRequestItems).values({ requestId: request.id, benefitId: benefit.id, quantity: 1, status, approvalRequired: true, dispensingMode: "QUANTITY", quotaControlled: false, authorizerEmployeeId: professional.id, evaluatedBy: status === "PENDING" ? null : actor.id, evaluatedAt: status === "PENDING" ? null : new Date(`${day(-10)}T10:00:00Z`), assessment: status === "DENIED" ? "Indeferimento sintético fundamentado para demonstração." : "Parecer sintético da equipe." }).returning();
        if (i % 5 === 2) await deliverBenefitInTransaction(tx, access, { itemId: item.id, actorId: actor.id, reason: "Recebimento demonstrativo com baixa de estoque.", today: new Date(`${day(-1)}T00:00:00Z`), deliveredAt: new Date(`${day(-1)}T12:00:00Z`) });
      }
      const [reason] = await tx.select().from(s.socialCatalogEntries).where(eq(s.socialCatalogEntries.kind, "REFERRAL_REASON"));
      const [destination] = await tx.insert(s.socialNetworkOrganizations).values({ name: "Posto municipal CadÚnico — POC", organizationType: "CADUNICO", address: "Rua das Veredas, 100", phone: syntheticPhone(999), usesCounterReference: true }).returning();
      for (let i = 0; i < 6; i++) { const [referral] = await tx.insert(s.socialReferrals).values({ unitId: units[i % units.length].id, familyId: familyIds[i], destinationOrganizationId: destination.id, reasonId: reason.id, referenceProfessional: professional.name, objective: "Atualização cadastral e orientação sobre documentação.", referredAt: new Date(`${day(-8)}T00:00:00Z`), status: i % 2 ? "RETURNED" : "OPEN", counterReferenceAt: i % 2 ? new Date(`${day(-3)}T00:00:00Z`) : null, counterReferenceProfessional: i % 2 ? professional.name : null, counterReferenceDescription: i % 2 ? "Atendimento demonstrativo realizado e devolvido à origem." : null, createdBy: actor.id }).returning(); await tx.insert(w.socialReferralDetails).values({ referralId: referral.id, professionalId: professional.id, referralType: "Atualização CadÚnico" }); }
      for (const [min, max, name] of [[6, 14, "Caminhos da infância"], [18, 59, "Laços comunitários"], [60, 130, "Convivência e memória"]] as const) {
        const unitId = units[0].id;
        const groupId = await save("scfv", { unitId, realizationUnitId: unitId, name, serviceType: "Convivência e fortalecimento de vínculos", ageMin: String(min), ageMax: String(max), registeredAt: day(-60), startsAt: day(-60), endsAt: day(90), professionalId: professional.id, referenceProfessionalId: professional.id, advisorId: professional.id, facilitatorId: professional.id, weekdays: "[1,3,5]", startTime: "14:00", endTime: "16:00" });
        const eligible = beneficiaries.filter(p => { const age = Number(day(-45).slice(0, 4)) - Number(p.birthDate.slice(0, 4)); return age >= min + 1 && age <= max - 1; }).slice(0, 12);
        const enrollmentIds: string[] = [];
        for (const p of eligible) enrollmentIds.push(await save("matriculas", { groupId, personId: p.id, enrolledAt: day(-45), leftAt: "", exitReason: "" }));
        const eventId = await save("eventos", { groupId, title: "Oficina comunitária de convivência", occursAt: day(-2), planning: "Roda de conversa, atividade coletiva e avaliação participativa.", status: "REALIZED", report: "Encontro sintético executado, com chamada individual e avaliação do grupo." });
        for (const [i, enrollmentId] of enrollmentIds.entries()) await save("presencas", { eventId, enrollmentId, present: i % 4 ? "true" : "false", justification: i % 4 ? "" : "Ausência justificada no cenário POC." });
        await save("eventos", { groupId, title: "Próximo encontro do grupo", occursAt: day(7), planning: "Planejamento de atividade futura com o grupo.", status: "PLANNED", report: "" });
      }
      const questionnaireId = await save("formularios", { unitId: units[0].id, title: "Avaliação de acesso à rede — POC", questions: JSON.stringify([{ key: "demanda", label: "Demanda principal", type: "SHORT", required: true, options: [] }, { key: "relato", label: "Relato familiar", type: "LONG", required: false, options: [] }, { key: "contato", label: "Telefone de contato confirmado", type: "CHECKBOX", required: true, options: [] }, { key: "rede", label: "Rede de apoio", type: "SINGLE", required: true, options: ["Familiar", "Comunitária"] }, { key: "servicos", label: "Serviços acessados", type: "MULTIPLE", required: true, options: ["Saúde", "Educação", "Assistência Social"] }]) });
      await save("respostas", { questionnaireId, familyId: familyIds[0], personId: "", answeredAt: day(-1), answers: JSON.stringify({ demanda: "Orientação sobre serviços", relato: "Resposta sintética para demonstração.", contato: true, rede: "Comunitária", servicos: ["Saúde", "Assistência Social"] }) });
      await save("comunicacoes", { unitId: units[0].id, programId: program.id, dueAt: day(15), body: "Aviso de demonstração: confira o prazo de atualização cadastral junto à sua unidade de referência." });
      const [vehicle] = await tx.select().from(fleetUnits).where(eq(fleetUnits.departmentId, professional.departmentId!));
      if (vehicle) {
        await tx.update(fleetUnits).set({ manufactureYear: vehicle.year || 2023, modelYear: vehicle.year || 2023, rntrc: "Não aplicável — uso municipal" }).where(eq(fleetUnits.id, vehicle.id));
        const [driver] = await tx.insert(fleetDrivers).values({ personId: professional.personId!, departmentId: professional.departmentId!, employeeId: professional.id, outsourced: false, cnhNumber: "25000123456", cnhCategories: ["B"], firstLicenseAt: new Date("2010-01-10T00:00:00Z"), cnhExpiresAt: new Date("2030-12-31T00:00:00Z"), policyReference: "Política sintética para demonstração; validar norma municipal.", createdById: actor.id }).onConflictDoNothing().returning();
        if (driver) await tx.execute(sql`INSERT INTO "FleetBooking"(id,"unitId","driverId",kind,purpose,"startsAt","endsAt","createdById") VALUES (${`${datasetId}:booking`},${vehicle.id},${driver.id},'VIAGEM','Visita domiciliar de demonstração',${new Date(`${day(5)}T09:00:00-03:00`)},${new Date(`${day(5)}T11:00:00-03:00`)},${actor.id})`);
      }
      await previewSocialImport(tx, { unitId: units[0].id, filename: "exemplo-local-poc.csv", content: localCadunicoHeaders.join(";") + "\n" + [syntheticCpf(35000), "45000000001", "Responsável de importação POC", "POC-IMPORT-1", "RESPONSAVEL", "1985-03-12", "1200.00", syntheticPhone(1800), "Rua das Veredas, 999", "Aurora das Veredas", "MG"].join(";"), actorId: actor.id });
      await tx.insert(w.socialPocDatasets).values({ id: datasetId, referenceDate: today });
      return { datasetId, families: familyIds.length, beneficiaries: beneficiaries.length, externalSmsSent: false, referenceDate: today };
    }, { timeoutMs: 240000, lockTimeoutMs: 15000 });
    console.log(JSON.stringify(result, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na carga Social."); process.exitCode = 1; });
