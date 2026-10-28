import type { HealthManagementContext as AppContext } from "@/lib/contracts/health-management-operations";
import { db } from "@/db/client";
import * as administration from "@/db/repositories/health-management-operations/report-administration";
import * as pharmacy from "@/db/repositories/health-management-operations/report-pharmacy";
import * as assistential from "@/db/repositories/health-management-operations/report-assistential";
import * as clinical from "@/db/repositories/health-management-operations/report-clinical";
import type { InternalReportDataset, ReportRow } from "@/lib/financeiro/report-delivery";
import type { ReportDefinition } from "@/lib/reports/report-engine";
import { createReportTemplatePresentation, type ReportEmissionMetadata, type ReportInstitutionIdentity } from "@/lib/reports/report-template";
import { getHealthReportOption, type HealthAdministrativeReportType } from "./health-report-catalog";
import { calculateMunicipalityPercentages } from "./health-report-policy";
import { createExtendedRows } from "./health-report-extra";

export type HealthReportInput = {
  reportType: HealthAdministrativeReportType;
  from?: string;
  to?: string;
  unitId?: string;
  professionalId?: string;
  specialtyId?: string;
  teamId?: string;
  municipality?: string;
  status?: string;
  cid?: string;
  procedure?: string;
  financing?: string;
  covenant?: string;
  query?: string;
  recordId?: string;
};

export type HealthReportDataset = {
  reportType: HealthAdministrativeReportType;
  requirement: string;
  report: InternalReportDataset;
  chart?: { label: string; value: number; percentage: number }[];
  presentation: {
    institution: ReportInstitutionIdentity | null;
    template: ReturnType<typeof createReportTemplatePresentation>;
    emission: ReportEmissionMetadata | null;
  };
};

const dateText = (value: Date | null | undefined) => value ? value.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "Não informado";
const activeText = (value: boolean) => value ? "Ativo" : "Inativo";
const moneyText = (value: { toString(): string } | null | undefined) => value ? Number(value.toString()).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Não informado";
const joined = (values: (string | null | undefined)[]) => values.filter(Boolean).join(", ") || "Não informado";

function range(input: HealthReportInput) {
  const from = input.from && /^\d{4}-\d{2}-\d{2}$/.test(input.from) ? new Date(`${input.from}T00:00:00-03:00`) : undefined;
  const to = input.to && /^\d{4}-\d{2}-\d{2}$/.test(input.to) ? new Date(`${input.to}T23:59:59.999-03:00`) : undefined;
  if (from && to && from > to) throw new Error("O período inicial deve ser anterior ao final.");
  return from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
}

function allowedUnits(context: AppContext, selected?: string) {
  const scoped = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  if (selected && scoped && !scoped.includes(selected)) throw new Error("A unidade selecionada está fora do seu escopo de acesso.");
  if (selected) return [selected];
  return scoped;
}

function reportMetadata(input: HealthReportInput, context: AppContext, rows: ReportRow[], warnings: string[]): InternalReportDataset["metadata"] {
  const units = allowedUnits(context, input.unitId);
  const period = input.from || input.to ? `${input.from || "início"} a ${input.to || "data atual"}` : "Todos os registros disponíveis";
  return {
    status: warnings.length ? "INTERNAL_PARTIAL" : "INTERNAL_REVIEW",
    scope: units ? `${units.length} unidade(s) autorizada(s)` : "Todas as unidades autorizadas",
    referencePeriod: `${period} · ${rows.length} registro(s)`,
    statutoryCompleteness: "NOT_STATUTORY",
    publicSnapshotEligible: false,
    publicSnapshotCondition: "Uso administrativo interno",
  };
}

async function createAssistentialRows(context: AppContext, input: HealthReportInput, unitIds: string[] | undefined, period: { gte?: Date; lte?: Date } | undefined): Promise<{ rows: ReportRow[]; warnings: string[] } | null> {
  const database = context.database ?? context.connection?.db ?? db;
  const type = input.reportType as string;
  const query = input.query?.toLocaleLowerCase("pt-BR");
  if (type.startsWith("PHARMACY_")) {
    if (type === "PHARMACY_UNMET_DEMAND" || type === "PHARMACY_FULFILLED_REQUEST_COST") {
      const records = await pharmacy.readManagementPharmacyRequests(database, unitIds, period, type === "PHARMACY_UNMET_DEMAND");
      const filtered = type === "PHARMACY_UNMET_DEMAND" ? records.filter(row => row.fulfilledQuantity < row.requestedQuantity) : records.filter(row => row.fulfilledQuantity > 0);
      return { rows: filtered.filter(row => !query || `${row.material.name} ${row.request.patient?.person.fullName || ""}`.toLocaleLowerCase("pt-BR").includes(query)).map(row => ({ Data: dateText(row.request.requestedAt), Paciente: row.request.patient?.person.fullName || "Pedido entre unidades", Unidade: row.request.destinationWarehouse.name, Produto: row.material.name, Solicitado: row.requestedQuantity, Atendido: row.fulfilledQuantity, Pendente: row.requestedQuantity - row.fulfilledQuantity, Situação: row.request.status })), warnings: [] };
    }
    if (["PHARMACY_CONTROLLED_BY_PATIENT", "PHARMACY_PATIENT_CONSUMPTION", "PHARMACY_FINANCIAL"].includes(type)) {
      const records = await pharmacy.readManagementDispensations(database, { unitIds, period, controlled: type === "PHARMACY_CONTROLLED_BY_PATIENT" });
      return { rows: records.filter(row => !query || `${row.patient.person.fullName} ${row.medicine.name}`.toLocaleLowerCase("pt-BR").includes(query)).map(row => ({ Data: dateText(row.date), Paciente: row.patient.person.fullName, Unidade: row.unit.name, Produto: row.medicine.name, Lote: row.stock?.batchNumber || "Não informado", Quantidade: row.quantity, "Valor de referência": row.stock?.unitCost ? (row.stock.unitCost * row.quantity).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Não informado", Retorno: dateText(row.nextWithdrawalAt) })), warnings: [] };
    }
    if (type === "PHARMACY_INVOICE_ENTRIES") {
      const records = await pharmacy.readManagementInvoiceEntries(database, unitIds, period);
      return { rows: records.map(row => ({ Data: dateText(row.receipt.receivedAt), Nota: row.receipt.invoiceNumber || "Não informada", Fornecedor: row.receipt.supplier?.company?.corporateName || row.receipt.supplier?.person?.fullName || "Não informado", Estoque: row.receipt.warehouse.name, Produto: row.material.name, Lote: row.batchNumber, Quantidade: row.quantity, "Valor unitário": row.unitCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) })), warnings: [] };
    }
    if (type === "PHARMACY_TRANSFERS") {
      const records = await pharmacy.readManagementTransfers(database, unitIds, period);
      return { rows: records.map(row => ({ Data: dateText(row.transfer.createdAt), Origem: row.transfer.originWarehouse.name, Destino: row.transfer.destinationWarehouse.name, Produto: row.material.name, Lote: row.batchNumber, Quantidade: row.quantity, Situação: row.transfer.status })), warnings: [] };
    }
    const restricted = ["PHARMACY_RESTRICTED_MOVEMENTS", "PHARMACY_CONTROLLED_BOOK"].includes(type);
    const stocks = await pharmacy.readManagementStocks(database, unitIds, restricted);
    if (["PHARMACY_STOCK_POSITION", "PHARMACY_STOCK_VALUE", "PHARMACY_EXPIRY_LOCATION", "PHARMACY_RESTRICTED_MOVEMENTS", "PHARMACY_CONTROLLED_BOOK"].includes(type)) return { rows: stocks.filter(row => !query || `${row.material.name} ${row.batchNumber}`.toLocaleLowerCase("pt-BR").includes(query)).map(row => ({ Estoque: row.warehouse.name, Produto: row.material.name, Tipo: row.material.healthProfile?.productKind || "Assistencial", Lote: row.batchNumber, Validade: dateText(row.expirationDate), Saldo: row.quantity, "Valor unitário": row.unitCost?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "Não informado", "Valor total": row.unitCost ? (row.unitCost * row.quantity).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Não informado", Situação: row.blockedAt ? "Bloqueado" : "Disponível" })), warnings: [] };
    const movements = await pharmacy.readManagementMovements(database, unitIds, period);
    if (type === "PHARMACY_ABC") {
      const grouped = new Map<string, { name: string; quantity: number; value: number }>();
      for (const row of movements.filter(item => item.type === "Saída" && !item.reversalMovement)) { const current = grouped.get(row.materialId) || { name: row.material.name, quantity: 0, value: 0 }; current.quantity += row.quantity; current.value += row.quantity * (row.unitValue || 0); grouped.set(row.materialId, current); }
      const sorted = [...grouped.values()].sort((a, b) => b.value - a.value); const total = sorted.reduce((sum, row) => sum + row.value, 0); let accumulated = 0;
      return { rows: sorted.map(row => { accumulated += row.value; const percentage = total ? accumulated / total * 100 : 0; return { Produto: row.name, Consumo: row.quantity, Valor: row.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), Acumulado: `${percentage.toFixed(2)}%`, Classe: percentage <= 80 ? "A" : percentage <= 95 ? "B" : "C" }; }), warnings: [] };
    }
    return { rows: movements.map(row => ({ Data: dateText(row.date), Estoque: row.warehouse.name, Produto: row.material.name, Lote: row.stock?.batchNumber || "Não informado", Movimento: row.type, Motivo: row.reason || "Não informado", Quantidade: row.quantity, Valor: row.unitValue?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "Não informado" })), warnings: [] };
  }
  if (type.startsWith("VACCINATION_")) {
    if (type === "VACCINATION_OVERDUE") return { rows: [], warnings: ["A relação de atrasos depende de calendário oficial versionado; nenhum calendário clínico foi configurado nesta instalação."] };
    const records = await assistential.readManagementVaccinations(database, unitIds, period);
    return { rows: records.filter(row => !query || `${row.patient.person.fullName} ${row.vaccine.name}`.toLocaleLowerCase("pt-BR").includes(query)).map(row => ({ Data: dateText(row.date), Cidadão: row.patient.person.fullName, Imunobiológico: row.vaccine.name, Dose: row.doseNumber, Lote: row.lotNumber || "Não informado", Profissional: row.professional.employee.name, Unidade: row.unit.name, Estratégia: row.strategy || "Não informada" })), warnings: type === "VACCINATION_COVERAGE" ? ["Cobertura representa aplicações registradas; denominadores populacionais oficiais não foram configurados."] : [] };
  }
  if (type.startsWith("LAB_")) {
    const records = await assistential.readManagementLabOrders(database, { unitIds, period });
    return { rows: records.filter(row => !query || `${row.patient.person.fullName} ${row.examRequest?.examName || row.examModel?.name || ""}`.toLocaleLowerCase("pt-BR").includes(query)).map(row => ({ Solicitação: dateText(row.createdAt), Paciente: row.patient.person.fullName, Exame: row.examRequest?.examName || row.examModel?.name || "Não informado", Solicitante: row.requestUnit?.name || "Não informada", Coleta: row.collectionUnit?.name || "Não informada", Agenda: dateText(row.scheduledAt), Coletado: dateText(row.collectedAt), Prestador: row.providerSupplier?.company?.corporateName || row.providerSupplier?.person?.fullName || "Municipal", "Valor de referência": row.referenceValue?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) || "Não informado", Etapa: row.status, Laudos: row.reports.length })), warnings: type === "LAB_PREGNANT_STATISTICS" ? ["O recorte depende da condição registrada no prontuário; registros sem essa informação não são classificados."] : [] };
  }
  if (type.startsWith("SPECIALIZED_")) {
    const records = await assistential.readManagementDistributions(database, unitIds, period, input.teamId);
    return { rows: records.filter(row => !query || `${row.patient.person.fullName} ${row.material.name}`.toLocaleLowerCase("pt-BR").includes(query)).map(row => ({ Data: dateText(row.deliveredAt), Paciente: row.patient.person.fullName, Unidade: row.plan.unit.name, Equipe: row.plan.team.name, Produto: row.material.name, Lote: row.stock.batchNumber, Quantidade: row.quantity, "Valor de referência": row.referenceValue ? (row.referenceValue * row.quantity).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Não informado" })), warnings: [] };
  }
  const extended = await createExtendedRows(context, input);
  if (extended) return extended;
  return null;
}

async function createRows(context: AppContext, input: HealthReportInput): Promise<{ rows: ReportRow[]; warnings: string[]; chart?: HealthReportDataset["chart"] }> {
  const database = context.database ?? context.connection?.db ?? db;
  const unitIds = allowedUnits(context, input.unitId);
  const active = input.status === "active" ? true : input.status === "inactive" ? false : undefined;
  const period = range(input);
  const assistential = await createAssistentialRows(context, input, unitIds, period);
  if (assistential) return assistential;

  switch (input.reportType) {
    case "CID_LIST": {
      const records = await administration.readManagementCids(database, active, input.cid);
      return { rows: records.map(row => ({ Código: row.code, Descrição: row.description, Classificação: row.classification || "Não informada", Fonte: row.source, Competência: row.competence, Situação: activeText(row.isActive) })), warnings: [] };
    }
    case "PROCEDURES_BY_FINANCING":
    case "PROCEDURE_LIST": {
      const records = await administration.readManagementProcedures(database, { active, financing: input.financing, procedure: input.procedure, byFinancing: input.reportType === "PROCEDURES_BY_FINANCING" });
      return { rows: records.map(row => ({ Financiamento: row.financing || "Não informado", Código: row.code, Procedimento: row.description, Grupo: row.groupName || "Não informado", Complexidade: row.complexity || "Não informada", Valor: moneyText(row.unitValue), Fonte: row.source, Competência: row.competence, Situação: activeText(row.isActive) })), warnings: [] };
    }
    case "COVENANT_LIST": {
      const records = await administration.readManagementCovenants(database, period, input.covenant, input.status);
      return { rows: records.map(row => ({ Número: row.number, Concedente: row.grantor, Descrição: row.description, Valor: moneyText(row.totalValueDecimal), Início: dateText(row.startDate), Término: dateText(row.endDate), Situação: row.status })), warnings: ["Relação baseada no cadastro institucional de convênios compartilhado com os demais módulos."] };
    }
    case "ADDRESS_LIST": {
      const records = await administration.readManagementAddresses(database, unitIds, input.query, input.municipality);
      return { rows: records.map(row => ({ Titular: row.healthUnit?.name || row.person?.fullName || row.company?.corporateName || "Não informado", Tipo: row.addressType || "Não informado", Logradouro: row.streetName || "Não informado", Número: row.number || "s/n", Complemento: row.complement || "", Bairro: row.neighborhood?.name || "Não informado", Município: row.neighborhood?.city || "Não informado", UF: row.neighborhood?.state || "", CEP: row.zipCode || "Não informado", Zona: row.zone || "Não informada", Consolidação: row.canonicalAddressId ? "Endereço vinculado ao principal" : "Principal" })), warnings: [] };
    }
    case "UNIT_LIST": {
      const records = await administration.readManagementUnits(database, unitIds, active);
      return { rows: records.map(row => ({ Unidade: row.name, Tipo: row.type, CNES: row.cnes || "Não informado", Gestor: row.manager?.name || "Não informado", Telefone: row.phone || "Não informado", Email: row.email || "Não informado", Endereço: joined([row.address?.streetName, row.address?.number, row.address?.neighborhood?.name]), Município: joined([row.address?.neighborhood?.city, row.address?.neighborhood?.state]), Equipes: row._count.teams, Especialidades: row._count.specialties, Vínculos: row._count.professionalAssignments, Gestão: row.isThirdParty ? "Terceirizada" : "Própria", Situação: activeText(row.isActive) })), warnings: [] };
    }
    case "SPECIALTIES_BY_UNIT": {
      const records = await administration.readManagementUnitSpecialties(database, unitIds, input.specialtyId, active);
      return { rows: records.map(row => ({ Unidade: row.unit.name, CNES: row.unit.cnes || "Não informado", Código: row.specialty.code, Especialidade: row.specialty.name, Vínculo: activeText(row.isActive), Cadastro: activeText(row.specialty.isActive) })), warnings: [] };
    }
    case "SPECIALTY_GROUPS_BY_UNIT": {
      const records = await administration.readManagementSpecialtyGroups(database, unitIds, active);
      const rows = records.flatMap(group => {
        const units = new Map<string, { name: string; cnes: string | null; specialties: Set<string> }>();
        for (const member of group.specialties) for (const link of member.specialty.unitLinks) {
          const unit = units.get(link.unit.id) || { name: link.unit.name, cnes: link.unit.cnes, specialties: new Set<string>() };
          unit.specialties.add(member.specialty.name);
          units.set(link.unit.id, unit);
        }
        return [...units.values()].map(unit => ({ Unidade: unit.name, CNES: unit.cnes || "Não informado", Grupo: group.name, Especialidades: joined([...unit.specialties]), Situação: activeText(group.isActive) }));
      }).sort((left, right) => String(left.Unidade).localeCompare(String(right.Unidade), "pt-BR") || String(left.Grupo).localeCompare(String(right.Grupo), "pt-BR"));
      return { rows, warnings: [] };
    }
    case "PROFESSIONALS_BY_UNIT":
    case "PROFESSIONALS_BY_SPECIALTY": {
      const records = await administration.readManagementAssignments(database, { unitIds, professionalId: input.professionalId, specialtyId: input.specialtyId, active, bySpecialty: input.reportType === "PROFESSIONALS_BY_SPECIALTY" });
      return { rows: records.map(row => ({ Especialidade: row.specialty?.name || "Não informada", Código: row.specialty?.code || "", Profissional: row.professional.employee.name, Matrícula: row.professional.employee.registration || "Não informada", CBO: row.professional.cbo || "Não informado", CNS: row.professional.cns || "Não informado", Conselho: joined([row.professional.councilName, row.professional.councilNumber]), Unidade: row.unit.name, CNES: row.unit.cnes || "Não informado", "Carga semanal": row.weeklyHours, Vínculo: activeText(row.isActive), Situação: activeText(row.professional.isActive) })), warnings: [] };
    }
    case "PROFESSIONALS_BY_TEAM": {
      const records = await administration.readManagementTeamProfessionals(database, { unitIds, teamId: input.teamId, professionalId: input.professionalId, active });
      return { rows: records.map(row => ({ Unidade: row.team!.unit.name, Equipe: row.team!.name, Código: row.team!.code || "Não informado", Microárea: row.team!.microarea || "Não informada", Profissional: row.employee.name, Matrícula: row.employee.registration || "Não informada", CBO: row.cbo || "Não informado", CNS: row.cns || "Não informado", Especialidade: row.specialty || "Não informada", Situação: activeText(row.isActive) })), warnings: [] };
    }
    case "PROFESSIONAL_RECORD": {
      const records = await administration.readManagementProfessionalRecords(database, unitIds, input.professionalId, active);
      return { rows: records.map(row => ({ Profissional: row.employee.name, CPF: row.employee.cpf || "Não informado", Matrícula: row.employee.registration || "Não informada", Cargo: row.employee.role?.name || "Não informado", Email: row.employee.email || "Não informado", Telefone: row.employee.phone || "Não informado", CNS: row.cns || "Não informado", CBO: row.cbo || "Não informado", Conselho: joined([row.councilName, row.councilNumber]), Tratamento: row.treatment || "Não informado", Especialidades: joined([...row.assignments.map(item => item.specialty?.name), row.specialty]), Unidades: joined([...row.assignments.map(item => item.unit.name), row.unit?.name]), Equipe: row.team?.name || "Não informada", Vínculos: joined(row.assignments.map(item => `${item.unit.name} · ${item.weeklyHours}h · ${activeText(item.isActive)}`)), Serviços: joined(row.serviceAssignments.map(item => item.service.name)), Habilitações: joined(row.habilitations.map(item => item.description)), Auditor: row.isAuditor ? "Sim" : "Não", "Intervalo de consulta": row.consultationIntervalMinutes ? `${row.consultationIntervalMinutes} min` : "Não informado", Situação: activeText(row.isActive), Motivo: row.inactivationReason || "" })), warnings: [] };
    }
    case "EXTERNAL_DEMAND_BY_SPECIALTY":
    case "ATTENDANCE_PERCENTAGE_BY_CITY": {
      const institution = await administration.readManagementInstitution(database);
      const records = input.reportType === "EXTERNAL_DEMAND_BY_SPECIALTY"
        ? await clinical.readManagementAppointments(database, { unitIds, period, status: input.status, assignmentSpecialtyId: input.specialtyId, ascending: true, primaryAddress: true })
        : await clinical.readManagementMedicalRecords(database, { unitIds, period, ascending: true, primaryAddress: true });
      const grouped = new Map<string, { city: string; state: string; specialty: string; unit: string; count: number }>();
      for (const record of records) {
        const place = record.patient.person.addresses[0]?.neighborhood;
        const snapshot = "municipalitySnapshot" in record ? record : record.appointment;
        const city = snapshot?.municipalitySnapshot || place?.city || "Município não informado";
        const state = snapshot?.stateSnapshot || place?.state || "";
        const specialty = "specialty" in record ? String(record.specialty || "Especialidade não informada") : "Atendimentos realizados";
        if (input.municipality && !city.toLocaleLowerCase("pt-BR").includes(input.municipality.toLocaleLowerCase("pt-BR"))) continue;
        if (input.reportType === "EXTERNAL_DEMAND_BY_SPECIALTY" && institution?.city && city.toLocaleLowerCase("pt-BR") === institution.city.toLocaleLowerCase("pt-BR") && (!institution.state || state === institution.state)) continue;
        const key = `${city}|${state}|${specialty}|${record.unit.name}`;
        const current = grouped.get(key) || { city, state, specialty, unit: record.unit.name, count: 0 };
        current.count += 1;
        grouped.set(key, current);
      }
      const groups = [...grouped.values()].sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "pt-BR") || a.specialty.localeCompare(b.specialty, "pt-BR"));
      if (input.reportType === "EXTERNAL_DEMAND_BY_SPECIALTY") return { rows: groups.map(item => ({ Município: item.city, UF: item.state, Especialidade: item.specialty, Unidade: item.unit, Procura: item.count })), warnings: [] };
      const chart = calculateMunicipalityPercentages(groups.map(item => ({ city: item.city, state: item.state, count: item.count })));
      return { rows: chart.map(item => ({ Município: item.label, Atendimentos: item.value, Percentual: `${item.percentage.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%` })), chart, warnings: [] };
    }
  }
  throw new Error("Relatório de saúde não implementado.");
}

export const healthAdministrativeReportDefinition = {
  key: "health.administrative",
  moduleCode: "SAUDE",
  async createDataset(context: AppContext, input: HealthReportInput): Promise<HealthReportDataset> {
    const option = getHealthReportOption(input.reportType);
    const [{ rows, warnings, chart }, institution, storedTemplate] = await Promise.all([
      createRows(context, input),
      administration.readManagementInstitution(context.database ?? context.connection?.db ?? db),
      administration.readManagementTemplate(context.database ?? context.connection?.db ?? db),
    ]);
    const template = createReportTemplatePresentation(storedTemplate);
    const report: InternalReportDataset = { title: option.label, year: new Date().getFullYear(), warnings, metadata: reportMetadata(input, context, rows, warnings), sections: [{ title: option.label, rows }] };
    return { reportType: input.reportType, requirement: option.requirement, report, chart, presentation: { institution, template, emission: template.includeEmissionMetadata ? { issuedAt: new Date().toISOString(), issuedBy: context.user.name } : null } };
  },
  auditTarget(dataset: HealthReportDataset) {
    return { targetType: "HEALTH_ADMINISTRATIVE_REPORT", targetId: dataset.requirement };
  },
} satisfies ReportDefinition<HealthReportInput, HealthReportDataset>;

export function healthReportFilename(type: HealthAdministrativeReportType, format: string) {
  return `saude-${type.toLowerCase().replace(/_/g, "-")}.${format.toLowerCase()}`;
}
