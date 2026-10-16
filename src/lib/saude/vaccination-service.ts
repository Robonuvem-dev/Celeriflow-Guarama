import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { applyStockMovement } from "@/lib/patrimonio/stock-service";
import { HealthStockError } from "./health-stock-service";
import { vaccinationProfessional } from "./vaccination-registry-service";
import { vaccineCalendarAge, vaccineDay, vaccineDoseStatus, vaccineLotExpiresAt, vaccineStrategy, type VaccineHistory } from "./vaccination-card-policy";
import { openVaccineVialInTransaction } from "./vaccination-stock-service";

const vaccinationSchema = z.object({
  vaccineId: z.string().min(1),
  patientId: z.string().min(1),
  warehouseId: z.string().min(1),
  batchNumber: z.string().trim().min(1).max(80),
  doseNumber: z.number().int().positive(),
  quantity: z.literal(1).default(1),
  appliedAt: z.coerce.date().optional(),
  professionalId: z.string().nullable().optional(),
  careGroup: z.string().trim().min(1).max(200),
  campaignId: z.string().nullable().optional(),
  indicationEventId: z.string().nullable().optional(),
  diluentStockId: z.string().nullable().optional(),
  openedVialId: z.string().nullable().optional(),
  appointmentId: z.string().nullable().optional(),
  medicalRecordId: z.string().nullable().optional(),
  citizenCondition: z.enum(["NONE", "PREGNANT", "POSTPARTUM", "TRAVELER"]).default("NONE"),
  strategy: z.string().trim().min(1).max(100),
  applicationSite: z.string().trim().min(1).max(100),
  applicationReason: z.string().trim().min(1).max(100),
  administrationRoute: z.string().trim().min(1).max(100),
  shift: z.string().trim().min(1).max(40),
  idempotencyKey: z.string().trim().min(8).max(180),
}).strict();

export async function recordVaccination(context: AppContext, raw: unknown) {
  const input = vaccinationSchema.parse(raw);
  const appliedAt = input.appliedAt || new Date();
  if (appliedAt > new Date()) throw new HealthStockError("A aplicação não pode ser registrada como realizada no futuro.");
  return context.prisma.$transaction(async (tx) => {
    const warehouse = await tx.warehouse.findFirstOrThrow({ where: { id: input.warehouseId, isActive: true } });
    if (!warehouse.healthUnitId) throw new HealthStockError("Estoque sem unidade de saúde vinculada.");
    assertHealthUnitAccess(context.user, warehouse.healthUnitId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`VACCINATION:${input.idempotencyKey}`}))`;
    const existing = await tx.vaccinationRecord.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { stock: { select: { warehouseId: true } } } });
    if (existing) {
      if (existing.patientId !== input.patientId || existing.vaccineId !== input.vaccineId || existing.doseNumber !== input.doseNumber || existing.stock?.warehouseId !== input.warehouseId || existing.lotNumber !== input.batchNumber || input.appliedAt && existing.date.valueOf() !== input.appliedAt.valueOf() || input.professionalId && existing.professionalId !== input.professionalId) throw new HealthStockError("Aplicação já registrada com outros dados.");
      if (vaccineStrategy(existing.strategy) !== vaccineStrategy(input.strategy) || existing.careGroup !== input.careGroup || existing.citizenCondition !== input.citizenCondition || existing.applicationSite !== input.applicationSite || existing.administrationRoute !== input.administrationRoute || existing.applicationReason !== input.applicationReason || existing.shift !== input.shift || existing.campaignId !== (input.campaignId || null) || existing.appointmentId !== (input.appointmentId || null) || existing.medicalRecordId !== (input.medicalRecordId || null)) throw new HealthStockError("A aplicação já foi registrada com outro contexto ou informações clínicas.");
      return { id: existing.id };
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`VACCINATION_PATIENT:${input.patientId}`}))`;
    const vaccine = await tx.vaccine.findFirstOrThrow({ where: { id: input.vaccineId, isActive: true }, include: { material: true, codeMappings: { orderBy: { createdAt: "desc" } } } });
    const patient = await tx.patient.findFirstOrThrow({ where: { id: input.patientId, status: "Ativo", person: { status: "Ativo", deathDate: null } }, include: { person: true } });
    if (!vaccine.materialId || !vaccine.material?.isActive || !["UN", "DOSE", "DOSES"].includes(vaccine.material.unitOfMeasure.toUpperCase())) throw new HealthStockError("Imunobiológico sem cadastro ativo de estoque em doses.");
    if (!patient.person.birthDate || vaccineCalendarAge(patient.person.birthDate, appliedAt, "DAY") < 0) throw new HealthStockError("Complete ou confira o nascimento antes de aplicar o calendário vacinal.");
    const professional = await vaccinationProfessional(tx, warehouse.healthUnitId, input.professionalId || null, context.user.employeeId);
    const [records, cardEvents, rules, interactions] = await Promise.all([
      tx.vaccinationRecord.findMany({ where: { patientId: patient.id }, select: { id: true, vaccineId: true, doseNumber: true, strategy: true, date: true } }),
      tx.healthVaccinationCardEvent.findMany({ where: { patientId: patient.id } }),
      tx.healthVaccineCalendarRule.findMany({ where: { vaccineId: vaccine.id } }),
      tx.healthVaccineInteraction.findMany({ where: { OR: [{ firstVaccineId: vaccine.id }, { secondVaccineId: vaccine.id }] } }),
    ]);
    const history: VaccineHistory[] = [...records.map(record => ({ ...record, source: "APPLICATION" as const })), ...cardEvents.filter(event => event.kind === "RESCUE" && (!event.revokedAt || event.revokedAt > appliedAt)).map(event => ({ id: event.id, vaccineId: event.vaccineId, doseNumber: event.doseNumber, strategy: event.strategy, date: event.occurredAt, source: "RESCUE" as const }))];
    const contraindicated = cardEvents.some(event => event.vaccineId === vaccine.id && event.kind === "CONTRAINDICATION" && (event.doseNumber === 0 || event.doseNumber === input.doseNumber) && event.occurredAt <= appliedAt && (!event.until || event.until > appliedAt) && (!event.revokedAt || event.revokedAt > appliedAt));
    if (contraindicated) throw new HealthStockError("Há contraindicação vigente registrada para este imunobiológico na carteira.");
    const matchingRules = rules.filter(rule => rule.enabled && rule.validFrom <= appliedAt && (!rule.validUntil || rule.validUntil >= appliedAt) && rule.doseNumber === input.doseNumber && vaccineStrategy(rule.strategy) === vaccineStrategy(input.strategy) && vaccineCalendarAge(patient.person.birthDate!, appliedAt, rule.ageUnit) >= rule.minimumAge && (rule.maximumAge === null || vaccineCalendarAge(patient.person.birthDate!, appliedAt, rule.ageUnit) <= rule.maximumAge));
    if (rules.length && matchingRules.length !== 1) throw new HealthStockError("Não há regra única vigente de calendário compatível com dose, estratégia e faixa etária.");
    const rule = matchingRules[0];
    if (rule) {
      const status = vaccineDoseStatus(rule, patient.person.birthDate, history, cardEvents, appliedAt);
      if (status.status === "UP_TO_DATE") throw new HealthStockError("Esta dose já está registrada como válida na carteira.");
      if (status.status === "MISSING_PREVIOUS") throw new HealthStockError("Registre ou resgate a dose anterior antes desta aplicação.");
      if (status.status === "NOT_DUE") throw new HealthStockError(`Respeite o intervalo mínimo: dose aprazada para ${status.dueAt.toLocaleDateString("pt-BR")}.`);
    }
    for (const interaction of interactions) {
      const other = interaction.firstVaccineId === vaccine.id ? interaction.secondVaccineId : interaction.firstVaccineId;
      if (history.some(record => record.vaccineId === other && (vaccineDay(record.date) === vaccineDay(appliedAt) ? !interaction.allowSameDay : Math.abs(vaccineDay(record.date) - vaccineDay(appliedAt)) < interaction.minimumIntervalDays * 86400000))) throw new HealthStockError("O intervalo ou a incompatibilidade entre os imunobiológicos impede esta aplicação.");
    }
    if (input.campaignId && !await tx.healthVaccinationCampaign.count({ where: { id: input.campaignId, startsAt: { lte: appliedAt }, endsAt: { gte: appliedAt } } })) throw new HealthStockError("Campanha fora do período da aplicação.");
    if (input.appointmentId && !await tx.healthAppointment.count({ where: { id: input.appointmentId, patientId: patient.id, unitId: warehouse.healthUnitId, status: { in: ["Aguardando", "Em Atendimento", "Atendido"] } } })) throw new HealthStockError("Registre a chegada e confira paciente/unidade do agendamento antes da vacinação.");
    if (input.medicalRecordId && !await tx.medicalRecord.count({ where: { id: input.medicalRecordId, patientId: patient.id, unitId: warehouse.healthUnitId, ...(input.appointmentId ? { appointmentId: input.appointmentId } : {}) } })) throw new HealthStockError("Atendimento não corresponde ao contexto da aplicação.");
    let indicationEventId: string | null = null;
    if (input.indicationEventId) {
      const indication = await tx.healthVaccinationCardEvent.findFirstOrThrow({ where: { id: input.indicationEventId, patientId: patient.id, vaccineId: vaccine.id, kind: "INDICATION", doseNumber: input.doseNumber, revokedAt: null, occurredAt: { lte: appliedAt }, vaccination: null } });
      indicationEventId = indication.id;
    } else indicationEventId = (await tx.healthVaccinationCardEvent.findFirst({ where: { patientId: patient.id, vaccineId: vaccine.id, kind: "INDICATION", doseNumber: input.doseNumber, revokedAt: null, occurredAt: { lte: appliedAt }, vaccination: null }, orderBy: { createdAt: "desc" }, select: { id: true } }))?.id || null;
    const identity = await tx.materialStock.findUniqueOrThrow({ where: { warehouseId_materialId_batchNumber: { warehouseId: warehouse.id, materialId: vaccine.materialId, batchNumber: input.batchNumber } }, select: { id: true } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`VACCINE_LOT:${identity.id}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`WAREHOUSE_INVENTORY:${warehouse.id}`}))`;
    const stock = await tx.materialStock.findUniqueOrThrow({ where: { id: identity.id }, include: { vaccineLotProfile: { include: { manufacturer: true } } } });
    if (stock.blockedAt || stock.expirationDate && vaccineLotExpiresAt(stock.expirationDate) < appliedAt) throw new HealthStockError("Lote do imunobiológico bloqueado ou vencido na data da aplicação.");
    if (!stock.vaccineLotProfile) throw new HealthStockError("Cadastre a quantidade de doses por frasco e os dados do lote antes de aplicar.");
    const allocatedDoses = await tx.healthVaccineOpenedVial.aggregate({ where: { stockId: stock.id }, _sum: { remainingDoses: true } });
    if ((allocatedDoses._sum.remainingDoses || 0) > stock.quantity) throw new HealthStockError("Concilie os frascos abertos com o saldo físico do lote antes da aplicação.");
    const vials = await tx.healthVaccineOpenedVial.findMany({ where: { stockId: stock.id, vaccineId: vaccine.id, remainingDoses: { gt: 0 }, openedAt: { lte: appliedAt }, OR: [{ expiresAt: null }, { expiresAt: { gte: appliedAt } }], ...(input.openedVialId ? { id: input.openedVialId } : {}) }, orderBy: { openedAt: "asc" }, take: 2 });
    if (input.openedVialId && !vials.length || !input.openedVialId && vials.length > 1) throw new HealthStockError("Selecione um frasco aberto compatível, disponível e dentro da validade.");
    let vial = vials[0];
    if (!vial) {
      vial = await openVaccineVialInTransaction(tx, context, { stockId: stock.id, openedAt: appliedAt, diluentStockId: input.diluentStockId || null, preparationKey: `APP:${input.idempotencyKey}`, sourceReference: "Abertura vinculada à aplicação registrada" });
    }
    if (vial.remainingDoses < 1 || vial.openedAt > appliedAt || vial.expiresAt && vial.expiresAt < appliedAt) throw new HealthStockError("O frasco não possui dose disponível dentro da validade para esta aplicação.");
    const { movement } = await applyStockMovement(tx, { kind: "EXIT", warehouseId: warehouse.id, materialId: vaccine.materialId, batchNumber: input.batchNumber, quantity: 1, reason: "APLICACAO_IMUNOBIOLOGICO", idempotencyKey: `VACCINE_DOSE:${input.idempotencyKey}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
    if ((await tx.healthVaccineOpenedVial.updateMany({ where: { id: vial.id, remainingDoses: { gt: 0 } }, data: { remainingDoses: { decrement: 1 } } })).count !== 1) throw new HealthStockError("O frasco não possui dose remanescente para a aplicação.");
    const mappings = vaccine.codeMappings.filter((mapping, index, all) => all.findIndex(other => other.system === mapping.system) === index).map(mapping => ({ system: mapping.system, code: mapping.code, version: mapping.version, sourceReference: mapping.sourceReference }));
    return tx.vaccinationRecord.create({ data: { date: appliedAt, vaccineId: vaccine.id, patientId: patient.id, professionalId: professional.id, actorUsuarioId: context.user.id, unitId: warehouse.healthUnitId, doseNumber: input.doseNumber, lotNumber: input.batchNumber, manufacturer: stock.vaccineLotProfile.manufacturer?.name || stock.vaccineLotProfile.manufacturerName, manufacturerId: stock.vaccineLotProfile.manufacturerId, citizenCondition: input.citizenCondition, careGroup: input.careGroup, teamSnapshot: professional.team?.name, strategy: vaccineStrategy(input.strategy), applicationSite: input.applicationSite, applicationReason: input.applicationReason, administrationRoute: input.administrationRoute, shift: input.shift, stockId: stock.id, movementId: movement.id, openedVialId: vial.id, indicationEventId, campaignId: input.campaignId, appointmentId: input.appointmentId, medicalRecordId: input.medicalRecordId, codeSnapshot: { mappings, calendarRuleId: rule?.id || null, calendarVersion: rule?.version || null, dosesPerVial: vial.totalDoses, manufacturerRndsCode: stock.vaccineLotProfile.manufacturer?.rndsCode || null }, idempotencyKey: input.idempotencyKey }, select: { id: true } });
  }, { timeout: 60000 });
}
