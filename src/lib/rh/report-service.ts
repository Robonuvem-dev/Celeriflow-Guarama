import { and, asc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import { employees, roles } from "@/db/schema/administration";
import { hrEmploymentRegimes } from "@/db/schema/personnel-configuration";
import { hrEmploymentContracts, hrEmploymentRevisions, hrPayrollRuns, hrPayrollStatements, hrRightEntries, payrolls } from "@/db/schema/personnel-workforce";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { resolveContractRevision } from "./contract-timeline";
import { payrollPeriod } from "./calculation-engine";
import { buildPocAnnualIncomeReport } from "./poc-payment";
import { allocateProratedStatementLocations } from "./prorated-statement-locations";
import { consignmentMarginSchema } from "./consignment-margin";
import { buildOperationalHrReport, operationalReportKinds } from "./operational-reports";
import type { PersonnelReport } from "./operational-reports";
import { matrix132Lines, renderSpecialPersonnelPdf } from "./special-report-layouts";
import { buildPersonnelRecordsReport } from "./personnel-record-reports";
import { personnelReportPresentation, PERSONNEL_ISSUER } from "./personnel-presentation";
import { annualIncomeCertificate } from "./income-certificate";

export const hrReportInputSchema = z.object({
  kind: z.enum(["CONTRATOS", "FOLHA", "DIREITOS", "RESUMO_CONTABIL", "PREVIDENCIA", "IRRF", "PENSOES", "REMESSA_SALARIAL_POC", "INFORME_ANUAL_POC", "CONTRATOS_MULTIPLOS", "SERVIDORES_ATIVOS", "QUANTIDADE_SERVIDORES", "CADASTRO_GERAL", "CADASTRO_LOTACAO", "CADASTRO_LOCAL", "MARGEM_CONSIGNAVEL", "CADASTRO_DOTACAO", ...operationalReportKinds]), format: z.enum(["CSV", "XLSX", "PDF", "TXT"]),
  q: z.string().max(200).default(""), competence: z.string().regex(/^(0[1-9]|1[0-2])\/\d{4}$/).optional(),
  referenceDate: z.iso.date().optional(),
  payrollId: z.string().min(1).optional(),
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  from: z.iso.date().optional(), until: z.iso.date().optional(),
  employeeId: z.string().min(1).optional(), departmentId: z.string().min(1).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  totalizers: z.string().max(100).optional(),
  labelColumns: z.coerce.number().int().min(1).max(3).optional(),
  labelHeight: z.coerce.number().int().min(70).max(300).optional(),
  labelMargin: z.coerce.number().int().min(10).max(50).optional(),
  labelFields: z.string().max(150).optional(),
  customCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).optional(), customValue: z.string().max(4000).optional(), customType: z.enum(["TEXTO", "BOOLEANO"]).optional(),
});
type Report = PersonnelReport;
const payrollSnapshot = z.object({
  contract: z.object({ registration: z.string(), costCenterId: z.string().nullable(), workLocation: z.string(), employee: z.object({ name: z.string() }) }),
  regime: z.object({ code: z.string(), socialSecurityScheme: z.object({ code: z.string(), name: z.string(), regime: z.string() }).nullable() }),
  bases: z.record(z.string(), z.string()),
  items: z.array(z.object({ code: z.string(), name: z.string(), type: z.string(), value: z.string() })),
});

async function historicalReportContracts(db: DatabaseExecutor, where: SQL | undefined, byHolder: boolean) {
  const selected = await db.select({ contract: hrEmploymentContracts, employee: { id: employees.id, name: employees.name } }).from(hrEmploymentContracts).innerJoin(employees, eq(employees.id, hrEmploymentContracts.employeeId)).where(where).orderBy(byHolder ? asc(hrEmploymentContracts.employeeId) : asc(hrEmploymentContracts.registration), asc(hrEmploymentContracts.id));
  const revisions = await db.select().from(hrEmploymentRevisions).where(inArray(hrEmploymentRevisions.contractId, selected.map(row => row.contract.id)));
  return selected.map(row => ({ ...row.contract, employee: row.employee, revisions: revisions.filter(revision => revision.contractId === row.contract.id) }));
}

export async function buildHrReport(db: DatabaseExecutor, input: z.infer<typeof hrReportInputSchema>, payrollScope?: SQL, budgetUnitIds?: readonly string[]): Promise<Report> {
  if ((operationalReportKinds as readonly string[]).includes(input.kind)) return buildOperationalHrReport(db, input, payrollScope, budgetUnitIds);
  if (input.kind.startsWith("CADASTRO_")) return buildPersonnelRecordsReport(db, input, payrollScope);
  if (input.kind === "INFORME_ANUAL_POC") {
    if (input.q || input.competence || input.payrollId || input.customCode || input.referenceDate) throw new Error("O comprovante anual usa ano de pagamento e acesso orçamentário; remova os demais filtros.");
    const annual = await buildPocAnnualIncomeReport(db, input.year ?? new Date().getUTCFullYear(), payrollScope, input.employeeId);
    return input.employeeId ? annualIncomeCertificate(annual) : annual;
  }
  let contractWhere = input.q ? or(sql`strpos(lower(${hrEmploymentContracts.registration}),lower(${input.q})) > 0`, sql`strpos(lower(${employees.name}),lower(${input.q})) > 0`) : undefined;
  if (input.customCode) {
    if (input.kind !== "CONTRATOS") throw new Error("Filtro de campo configurável disponível no relatório de contratos atuais.");
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(input.customCode) || input.customValue === undefined || (input.customType === "BOOLEANO" && !["true", "false"].includes(input.customValue))) throw new Error("Filtro de campo configurável inválido.");
    contractWhere = and(contractWhere, sql`jsonb_extract_path(${hrEmploymentContracts.details},'customFields',${input.customCode}) = ${JSON.stringify(input.customType === "BOOLEANO" ? input.customValue === "true" : input.customValue)}::jsonb`);
  }
  if (input.kind === "CONTRATOS") {
    const selected = await db.select({ contract: hrEmploymentContracts, employee: { name: employees.name } }).from(hrEmploymentContracts).innerJoin(employees, eq(employees.id, hrEmploymentContracts.employeeId)).where(contractWhere).orderBy(asc(hrEmploymentContracts.registration), asc(hrEmploymentContracts.id));
    const rows = selected.map(row => ({ ...row.contract, employee: row.employee }));
    return {
      title: "Contratos funcionais — última revisão cadastrada",
      headers: ["Matrícula", "Servidor", "Admissão", "Término", "Local", "Divisor mensal (horas)", "Salário-base BRL", "Situação", "Versão", "Campos configuráveis (JSON)", "Jornada semanal estimada (horas)", "Origem salarial", "Vigência da estimativa"],
      rows: rows.map(row => {
        const details = row.details as { customFields?: unknown; weeklyHours?: number; salarySource?: string; salaryEstimate?: { effectiveFrom?: string } };
        return [row.registration, row.employee.name, row.admittedAt.toISOString().slice(0, 10), row.endsAt?.toISOString().slice(0, 10) || "", row.workLocation, String(row.monthlyHours), row.salary.toFixed(2), row.status, String(row.version), JSON.stringify(details?.customFields || {}), details?.weeklyHours === undefined ? "Não informada" : String(details.weeklyHours), details?.salarySource ?? "Cadastro contratual", details?.salaryEstimate?.effectiveFrom ?? ""];
      }),
    };
  }
  if (input.kind === "CONTRATOS_MULTIPLOS") {
    const reference = input.competence ? payrollPeriod(input.competence).start : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    const contracts = await historicalReportContracts(db, input.q ? or(sql`strpos(lower(${employees.name}),lower(${input.q})) > 0`, sql`EXISTS (SELECT 1 FROM "HrEmploymentContract" c WHERE c."employeeId"=${employees.id} AND strpos(lower(c.registration),lower(${input.q})) > 0)`) : undefined, true);
    const grouped = new Map<string, { name: string; registrations: string[]; regimes: string[] }>();
    for (const contract of contracts) {
      if (!contract.revisions.some(revision => revision.effectiveFrom <= reference)) continue;
      const active = resolveContractRevision(contract, contract.revisions, { start: reference, end: reference }).contract;
      if (active.status !== "ATIVO" || active.admittedAt > reference || (active.endsAt && active.endsAt < reference)) continue;
      const group = grouped.get(contract.employeeId) || { name: contract.employee.name, registrations: [], regimes: [] };
      group.registrations.push(active.registration); group.regimes.push(active.regimeId); grouped.set(contract.employeeId, group);
    }
    return { title: "Servidores com contratos simultâneos na data de referência", headers: ["Referência", "Servidor", "Quantidade", "Matrículas", "Regimes IDs"], rows: [...grouped.values()].filter(group => group.registrations.length > 1).map(group => [reference.toISOString().slice(0, 10), group.name, String(group.registrations.length), group.registrations.join(" · "), [...new Set(group.regimes)].join(" · ")]) };
  }
  if (input.kind === "SERVIDORES_ATIVOS" || input.kind === "QUANTIDADE_SERVIDORES") {
    const reference = input.referenceDate
      ? new Date(`${input.referenceDate}T00:00:00Z`)
      : input.competence ? payrollPeriod(input.competence).end : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    const contracts = await historicalReportContracts(db, contractWhere, false);
    const active = contracts.flatMap(contract => {
      if (!contract.revisions.some(revision => revision.effectiveFrom <= reference)) return [];
      const snapshot = resolveContractRevision(contract, contract.revisions, { start: reference, end: reference }).contract;
      return snapshot.status === "ATIVO" && snapshot.admittedAt <= reference && (!snapshot.endsAt || snapshot.endsAt >= reference) ? [{ ...snapshot, employee: contract.employee }] : [];
    });
    const regimes = await db.select({ id: hrEmploymentRegimes.id, name: hrEmploymentRegimes.name }).from(hrEmploymentRegimes).where(inArray(hrEmploymentRegimes.id, [...new Set(active.map(contract => contract.regimeId))]));
    const regimeNames = new Map(regimes.map(regime => [regime.id, regime.name]));
    const date = reference.toISOString().slice(0, 10);
    if (input.kind === "QUANTIDADE_SERVIDORES") {
      const groups = new Map<string, { people: Set<string>; contracts: number }>();
      for (const contract of active) {
        const group = groups.get(contract.regimeId) || { people: new Set<string>(), contracts: 0 };
        group.people.add(contract.employeeId); group.contracts++; groups.set(contract.regimeId, group);
      }
      return { title: "Quantidade ativa na referência — pessoas distintas e vínculos; totais de pessoas por regime não são aditivos", headers: ["Referência", "Regime ID", "Regime (nome cadastral atual)", "Pessoas distintas", "Vínculos ativos"], rows: [
        ...[...groups.entries()].map(([id, group]) => [date, id, regimeNames.get(id) || id, String(group.people.size), String(group.contracts)]),
        [date, "TOTAL", "Total do filtro", String(new Set(active.map(contract => contract.employeeId)).size), String(active.length)],
      ] };
    }
    const selectedRoles = await db.select({ id: roles.id, name: roles.name }).from(roles).where(inArray(roles.id, [...new Set(active.map(contract => contract.roleId))]));
    const roleNames = new Map(selectedRoles.map(role => [role.id, role.name]));
    return { title: "Relação de servidores/vínculos ativos — referência documental Ibema; nomes de cargo/regime do cadastro atual", headers: ["Referência", "Matrícula", "Nome", "Cargo/Função", "Lotação", "Situação", "Regime", "Admissão", "Faixa salarial", "Jornada mensal (horas)", "Versão contratual"], rows: active.map(contract => [date, contract.registration, contract.employee.name, roleNames.get(contract.roleId) || contract.roleId, contract.workLocation, contract.status, regimeNames.get(contract.regimeId) || contract.regimeId, contract.admittedAt.toISOString().slice(0, 10), contract.salaryLevel || "", String(contract.monthlyHours), String(contract.version)]) };
  }
  if (["FOLHA", "RESUMO_CONTABIL", "PREVIDENCIA", "IRRF", "PENSOES", "REMESSA_SALARIAL_POC", "MARGEM_CONSIGNAVEL"].includes(input.kind)) {
    const selected = await db.select({ statement: hrPayrollStatements, registration: hrEmploymentContracts.registration, employeeName: employees.name, payroll: { competence: payrolls.competence, type: payrolls.type }, scope: hrPayrollRuns.scope }).from(hrPayrollStatements).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrPayrollStatements.contractId)).innerJoin(employees, eq(employees.id, hrEmploymentContracts.employeeId)).innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).where(and(contractWhere, eq(hrPayrollRuns.mode, "OFICIAL"), eq(hrPayrollRuns.status, "FECHADA"), input.payrollId ? eq(hrPayrollRuns.payrollId, input.payrollId) : undefined, payrollScope, input.competence ? eq(payrolls.competence, input.competence) : undefined)).orderBy(asc(hrPayrollRuns.createdAt), asc(hrPayrollStatements.id));
    const rows = selected.map(row => ({ ...row.statement, contract: { registration: row.registration, employee: { name: row.employeeName } }, run: { payroll: row.payroll, scope: row.scope } }));
    if (input.kind === "MARGEM_CONSIGNAVEL") {
      const seen = new Set<string>();
      const result: string[][] = [];
      for (const row of rows) {
        const margin = z.object({ consignmentMargin: consignmentMarginSchema.nullable().optional() }).parse(row.snapshot).consignmentMargin;
        const key = `${row.runId}:${margin?.contractIds.join(",") || row.contractId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push([row.run.payroll.competence, row.run.payroll.type, row.contract.employee.name, margin?.contractIds.join("; ") || row.contract.registration, margin?.remuneration || "", margin?.compulsoryDeductions || "", margin?.base || "", margin?.rate || "", margin?.limit || "", margin?.used || "", margin?.available || "", margin?.excess || "", margin?.policy.legalReference || "Margem não configurada neste cálculo", margin?.memory.map(m => `${m.contractId}/${m.rubricCode}/${m.purpose}: ${m.value}`).join("; ") || ""]);
      }
      return { title: "Análise de consignados — memória das rubricas e margem compartilhada por pessoa/cálculo", headers: ["Competência", "Tipo", "Servidor", "Contratos", "Remuneração BRL", "Obrigatórios BRL", "Base BRL", "Limite %", "Limite BRL", "Utilizado BRL", "Disponível BRL", "Excesso BRL", "Fundamento / situação", "Memória por rubrica"], rows: result };
    }
    if (input.kind === "PENSOES") {
      const pensionSnapshot = z.object({ pensions: z.array(z.object({ id: z.string(), courtReference: z.string(), method: z.string(), basis: z.string(), base: z.string(), value: z.string(), amount: z.string(), deductFromIncomeTax: z.boolean(), beneficiary: z.object({ id: z.string(), fullName: z.string(), cpf: z.string() }) })).optional().default([]) });
      return { title: "Pensões calculadas — beneficiários e memória; não comprova repasse", headers: ["Competência", "Tipo", "Escopo", "Matrícula", "Servidor", "Pensão", "Beneficiário", "CPF beneficiário", "Processo", "Método", "Base", "Base BRL", "Parâmetro", "Desconto BRL", "Dedutível IRRF", "Demonstrativo"], rows: rows.flatMap(row => {
        const snapshot = payrollSnapshot.parse(row.snapshot);
        return pensionSnapshot.parse(row.snapshot).pensions.map(pension => [row.run.payroll.competence, row.run.payroll.type, row.run.scope, snapshot.contract.registration, snapshot.contract.employee.name, pension.id, pension.beneficiary.fullName, pension.beneficiary.cpf, pension.courtReference, pension.method, pension.basis, pension.base, pension.value, pension.amount, pension.deductFromIncomeTax ? "SIM" : "NAO", row.id]);
      }) };
    }
    if (input.kind === "IRRF") {
      const taxSchema = z.object({ incomeTax: z.object({ income: z.string(), deduction: z.string(), base: z.string(), preliminary: z.string(), reduction: z.string(), tax: z.string(), deductionMethod: z.string(), rraMonths: z.number().nullable() }).nullable().optional() });
      return { title: "IRRF — memória agregada por PF repetida nos vínculos; somar somente o imposto alocado", headers: ["Competência", "Tipo", "Escopo", "Matrícula", "Servidor", "Renda PF BRL", "Dedução PF BRL", "Método", "Base PF BRL", "Preliminar PF BRL", "Redução PF BRL", "Imposto PF BRL", "IRRF alocado BRL", "Meses RRA", "Versão"], rows: rows.map(row => {
        const snapshot = payrollSnapshot.parse(row.snapshot), tax = taxSchema.parse(row.snapshot).incomeTax;
        return [row.run.payroll.competence, row.run.payroll.type, row.run.scope, snapshot.contract.registration, snapshot.contract.employee.name, tax?.income || "", tax?.deduction || "", tax?.deductionMethod || "", tax?.base || "", tax?.preliminary || "", tax?.reduction || "", tax?.tax || "", snapshot.items.find(item => item.code === "IRRF")?.value || "0.00", tax?.rraMonths?.toString() || "", row.id];
      }) };
    }
    if (input.kind === "REMESSA_SALARIAL_POC") {
      const bankSchema = z.object({ contract: z.object({ employee: z.object({ person: z.object({ cpf: z.string() }) }), details: z.object({ pocBankAccount: z.object({ bank: z.string().regex(/^\d{3}$/), agency: z.string(), account: z.string(), accountType: z.string(), estimated: z.literal(true) }) }) }) });
      if (rows.some(row => row.run.scope !== "DEMONSTRACAO")) throw new Error("Modelo de remessa POC exige filtrar somente folhas demonstrativas.");
      return { title: "Remessa salarial — MODELO CSV POC, contas fictícias; sem transmissão ou baixa", headers: ["Competência", "Tipo folha", "Banco", "Agência", "Conta", "Tipo conta", "CPF", "Matrícula", "Favorecido", "Líquido BRL", "Demonstrativo", "Modelo"], rows: rows.map(row => {
        const snapshot = payrollSnapshot.parse(row.snapshot), bankData = bankSchema.parse(row.snapshot).contract, bank = bankData.details.pocBankAccount;
        return [row.run.payroll.competence, row.run.payroll.type, bank.bank, bank.agency, bank.account, bank.accountType, bankData.employee.person.cpf, snapshot.contract.registration, snapshot.contract.employee.name, row.net.toFixed(2), row.id, "REMESSA_SALARIAL_CSV_POC_V1"];
      }) };
    }
    if (input.kind === "PREVIDENCIA") return { title: "Bases e contribuições calculadas — não comprova recolhimento", headers: ["Competência", "Escopo", "Matrícula", "Servidor", "Previdência", "Base BRL", "Segurado BRL", "Patronal BRL", "FGTS BRL", "Versão"], rows: rows.map(row => {
      const snapshot = payrollSnapshot.parse(row.snapshot); const scheme = snapshot.regime.socialSecurityScheme;
      const social = scheme ? snapshot.items.find(item => item.code === `PREVIDENCIA_${scheme.code}`)?.value || "0.00" : "0.00";
      const fgts = snapshot.items.find(item => item.code === "FGTS")?.value || "0.00";
      return [row.run.payroll.competence, row.run.scope, snapshot.contract.registration, snapshot.contract.employee.name, scheme?.name || "—", scheme ? snapshot.bases[scheme.regime] || "0.00" : "0.00", social, row.employer.sub(fgts).toFixed(2), fgts, row.id];
    }) };
    if (input.kind === "RESUMO_CONTABIL") {
      const grouped = new Map<string, { labels: string[]; value: Decimal }>();
      for (const row of rows) {
        const snapshot = payrollSnapshot.parse(row.snapshot);
        if ((row.snapshot as { proration?: unknown }).proration) {
          for (const part of allocateProratedStatementLocations(row.snapshot, row.employer)) {
            const prefix = [row.run.payroll.competence, row.run.payroll.type, row.run.scope, snapshot.regime.code, part.costCenterId || "SEM_CENTRO", part.workLocation];
            const totals = [{ code: "TOTAL_BRUTO", type: "TOTAL", value: part.gross }, { code: "TOTAL_DESCONTOS", type: "TOTAL", value: part.deductions }, { code: "TOTAL_LIQUIDO", type: "TOTAL", value: part.net }, { code: "TOTAL_ENCARGOS", type: "TOTAL", value: part.employer }];
            for (const item of [...part.items, ...totals]) {
              const labels = [...prefix, item.code, item.type], key = JSON.stringify(labels);
              const group = grouped.get(key) ?? { labels, value: new Decimal(0) };
              group.value = group.value.add(item.value); grouped.set(key, group);
            }
          }
          continue;
        }
        const prefix = [row.run.payroll.competence, row.run.payroll.type, row.run.scope, snapshot.regime.code, snapshot.contract.costCenterId || "SEM_CENTRO", snapshot.contract.workLocation];
        const totals = [{ code: "TOTAL_BRUTO", type: "TOTAL", value: row.gross }, { code: "TOTAL_DESCONTOS", type: "TOTAL", value: row.deductions }, { code: "TOTAL_LIQUIDO", type: "TOTAL", value: row.net }, { code: "TOTAL_ENCARGOS", type: "TOTAL", value: row.employer }];
        for (const item of [...snapshot.items, ...totals]) {
          const labels = [...prefix, item.code, item.type]; const key = JSON.stringify(labels);
          const group = grouped.get(key) || { labels, value: new Decimal(0) };
          group.value = group.value.add(item.value); grouped.set(key, group);
        }
      }
      return { title: "Resumo por rubrica/regime/centro/local — totais são linhas de conferência, não somar com rubricas", headers: ["Competência", "Tipo folha", "Escopo", "Regime", "Centro ID", "Local", "Rubrica/total", "Tipo linha", "Valor BRL"], rows: [...grouped.values()].sort((a, b) => JSON.stringify(a.labels).localeCompare(JSON.stringify(b.labels))).map(group => [...group.labels, group.value.toFixed(2)]) };
    }
    return { title: "Folha calculada e fechada — não comprova pagamento", headers: ["Competência", "Tipo", "Escopo", "Matrícula", "Servidor", "Bruto BRL", "Descontos BRL", "Líquido BRL", "Encargos BRL", "Versão"], rows: rows.map(row => { const snapshot = payrollSnapshot.parse(row.snapshot); return [row.run.payroll.competence, row.run.payroll.type, row.run.scope, snapshot.contract.registration, snapshot.contract.employee.name, row.gross.toFixed(2), row.deductions.toFixed(2), row.net.toFixed(2), row.employer.toFixed(2), row.id]; }) };
  }
  const selectedEntries = await db.select({ entry: hrRightEntries, registration: hrEmploymentContracts.registration, employeeName: employees.name }).from(hrRightEntries).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrRightEntries.contractId)).innerJoin(employees, eq(employees.id, hrEmploymentContracts.employeeId)).where(contractWhere).orderBy(asc(hrRightEntries.periodStart), asc(hrRightEntries.createdAt), asc(hrRightEntries.id));
  const entries = selectedEntries.map(row => ({ ...row.entry, contract: { registration: row.registration, employee: { name: row.employeeName } } }));
  const totals = new Map<string, { registration: string; name: string; kind: string; scope: string; start: string; end: string; quantity: Decimal; amount: Decimal }>();
  for (const entry of entries) {
    const start = entry.periodStart.toISOString().slice(0, 10); const end = entry.periodEnd.toISOString().slice(0, 10);
    const scope = (entry.details as { scope?: string }).scope || "LEGADO_SEM_ESCOPO";
    const key = `${entry.contractId}:${entry.kind}:${scope}:${start}:${end}`;
    const row = totals.get(key) || { registration: entry.contract.registration, name: entry.contract.employee.name, kind: entry.kind, scope, start, end, quantity: new Decimal(0), amount: new Decimal(0) };
    row.quantity = row.quantity.add(entry.quantity); row.amount = row.amount.add(entry.amount); totals.set(key, row);
  }
  return { title: "Saldos de direitos e provisões por escopo", headers: ["Matrícula", "Servidor", "Direito", "Escopo", "Início", "Fim", "Saldo quantidade", "Saldo BRL"], rows: [...totals.values()].map(row => [row.registration, row.name, row.kind, row.scope, row.start, row.end, row.quantity.toString(), row.amount.toFixed(2)]) };
}

export async function renderHrReport(report: Report, format: "CSV" | "XLSX" | "PDF" | "TXT") {
  report = personnelReportPresentation(report);
  if (format === "TXT") {
    if (report.print?.kind !== "matrix132") throw new Error("TXT é exclusivo do cartão de ponto de 132 colunas.");
    return { bytes: Buffer.from(matrix132Lines(report).join("\r\n") + "\r\n", "ascii"), contentType: "text/plain; charset=us-ascii", extension: "txt" };
  }
  if (format === "PDF" && report.print) return { bytes: await renderSpecialPersonnelPdf(report), contentType: "application/pdf", extension: "pdf" };
  if (format === "CSV") {
    const quote = (value: string) => {
      const safe = /^[=+@]/.test(value) || /^-\D/.test(value) ? `'${value}` : value;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    return { bytes: Buffer.from("\uFEFF" + [report.headers, ...report.rows].map(row => row.map(quote).join(";")).join("\r\n"), "utf8"), contentType: "text/csv; charset=utf-8", extension: "csv" };
  }
  if (format === "XLSX") {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Relatório RH");
    sheet.addRow(report.headers); report.rows.forEach(row => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.columns.forEach(column => { column.width = 24; });
    return { bytes: Buffer.from(await workbook.xlsx.writeBuffer()), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" };
  }
  const attendanceMirror = report.title.startsWith("Espelho de ponto pessoal");
  const pdf = new PDFDocument({ size: "A4", layout: attendanceMirror ? "landscape" : "portrait", margin: 35, bufferPages: true }); const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => { pdf.on("data", chunk => chunks.push(Buffer.from(chunk))); pdf.on("end", () => resolve(Buffer.concat(chunks))); pdf.on("error", reject); });
  if (!attendanceMirror) pdf.on("pageAdded", () => {
    pdf.font("Helvetica-Bold").fontSize(10).text(report.title, 35, 35, { width: pdf.page.width - 70 });
    pdf.font("Helvetica").fontSize(9).text("Continuação — relatório integral dos critérios selecionados").moveDown();
  });
  pdf.fontSize(11).text(PERSONNEL_ISSUER); pdf.moveDown(0.4);
  pdf.fontSize(14).text(report.title); pdf.fontSize(9).text(`${report.rows.length} registros · relatório integral do filtro`); pdf.moveDown();
  if (attendanceMirror) {
    const available = pdf.page.width - 70;
    const proportions = [0.09, 0.07, 0.07, 0.13, 0.08, 0.09, 0.18, 0.19];
    const widths = proportions.map(value => available * value);
    const drawRow = (row: string[], bold: boolean) => {
      pdf.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8);
      const height = Math.max(22, ...row.map((value, index) => pdf.heightOfString(value, { width: widths[index] - 8 }) + 10));
      if (pdf.y + height > pdf.page.height - 60) {
        pdf.addPage();
        pdf.fontSize(10).text(report.title, 35, 35, { width: available }); pdf.moveDown();
        if (!bold) drawRow(report.headers, true);
      }
      const y = pdf.y;
      if (height > pdf.page.height - 150) {
        // Preserve exceptionally long source values with flowing text instead of clipping a cell.
        pdf.text(row.map((value, index) => `${report.headers[index]}: ${value}`).join(" · "), 35, y, { width: available });
        return;
      }
      if (bold) pdf.save().rect(35, y, available, height).fill("#e8edf2").restore();
      let x = 35;
      row.forEach((value, index) => { pdf.text(value, x + 4, y + 4, { width: widths[index] - 8 }); x += widths[index]; });
      pdf.moveTo(35, y + height).lineTo(35 + available, y + height).strokeColor("#d5dce3").stroke();
      pdf.x = 35; pdf.y = y + height + 2;
    };
    drawRow(report.headers, true);
    for (const row of report.rows) drawRow(row, row[0].startsWith("TOTAL"));
    pdf.font("Helvetica").fontSize(9).moveDown().text("Conferência do servidor: ____________________    Chefia: ____________________", { width: available });
    pdf.text("Assinaturas para conferência; a emissão não representa assinatura digital ou homologação do ponto.", { width: available });
  }
  for (const [index, row] of (attendanceMirror ? [] : report.rows).entries()) {
    pdf.fontSize(9).text(`${index + 1}. ${row.map((value, col) => `${report.headers[col]}: ${value}`).join(" · ")}`);
    pdf.moveDown(0.5);
  }
  const pages = pdf.bufferedPageRange();
  for (let page = 0; page < pages.count; page++) { pdf.switchToPage(page); pdf.text(`${page + 1}/${pages.count}`, 35, pdf.page.height - 25, { lineBreak: false }); }
  pdf.end();
  return { bytes: await result, contentType: "application/pdf", extension: "pdf" };
}
