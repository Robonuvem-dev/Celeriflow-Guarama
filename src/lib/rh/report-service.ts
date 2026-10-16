import { Prisma, type PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { resolveContractRevision } from "./contract-timeline";
import { payrollPeriod } from "./calculation-engine";
import { buildPocAnnualIncomeReport } from "./poc-payment";
import { allocateProratedStatementLocations } from "./prorated-statement-locations";

export const hrReportInputSchema = z.object({
  kind: z.enum(["CONTRATOS", "FOLHA", "DIREITOS", "RESUMO_CONTABIL", "PREVIDENCIA", "IRRF", "PENSOES", "REMESSA_SALARIAL_POC", "INFORME_ANUAL_POC", "CONTRATOS_MULTIPLOS", "SERVIDORES_ATIVOS", "QUANTIDADE_SERVIDORES"]), format: z.enum(["CSV", "XLSX", "PDF"]),
  q: z.string().max(200).default(""), competence: z.string().regex(/^(0[1-9]|1[0-2])\/\d{4}$/).optional(),
  referenceDate: z.iso.date().optional(),
  payrollId: z.string().min(1).optional(),
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  customCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).optional(), customValue: z.string().max(4000).optional(), customType: z.enum(["TEXTO", "BOOLEANO"]).optional(),
});
type Report = { title: string; headers: string[]; rows: string[][] };
const payrollSnapshot = z.object({
  contract: z.object({ registration: z.string(), costCenterId: z.string().nullable(), workLocation: z.string(), employee: z.object({ name: z.string() }) }),
  regime: z.object({ code: z.string(), socialSecurityScheme: z.object({ code: z.string(), name: z.string(), regime: z.string() }).nullable() }),
  bases: z.record(z.string(), z.string()),
  items: z.array(z.object({ code: z.string(), name: z.string(), type: z.string(), value: z.string() })),
});

export async function buildHrReport(db: PrismaClient, input: z.infer<typeof hrReportInputSchema>, payrollScope: Prisma.PayrollWhereInput = {}): Promise<Report> {
  if (input.kind === "INFORME_ANUAL_POC") {
    if (input.q || input.competence || input.payrollId || input.customCode || input.referenceDate) throw new Error("Informe anual POC usa ano de pagamento e acesso orçamentário; remova os demais filtros.");
    return buildPocAnnualIncomeReport(db, input.year ?? new Date().getUTCFullYear(), payrollScope);
  }
  const contractWhere: Prisma.HrEmploymentContractWhereInput = input.q ? { OR: [{ registration: { contains: input.q, mode: "insensitive" } }, { employee: { name: { contains: input.q, mode: "insensitive" } } }] } : {};
  if (input.customCode) {
    if (input.kind !== "CONTRATOS") throw new Error("Filtro de campo configurável disponível no relatório de contratos atuais.");
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(input.customCode) || input.customValue === undefined || (input.customType === "BOOLEANO" && !["true", "false"].includes(input.customValue))) throw new Error("Filtro de campo configurável inválido.");
    contractWhere.details = { path: ["customFields", input.customCode], equals: input.customType === "BOOLEANO" ? input.customValue === "true" : input.customValue };
  }
  if (input.kind === "CONTRATOS") {
    const rows = await db.hrEmploymentContract.findMany({ where: contractWhere, include: { employee: { select: { name: true } } }, orderBy: [{ registration: "asc" }, { id: "asc" }] });
    return { title: "Contratos funcionais — última revisão cadastrada", headers: ["Matrícula", "Servidor", "Admissão", "Término", "Local", "Jornada", "Salário BRL", "Situação", "Versão", "Campos configuráveis (JSON)"], rows: rows.map(row => [row.registration, row.employee.name, row.admittedAt.toISOString().slice(0, 10), row.endsAt?.toISOString().slice(0, 10) || "", row.workLocation, String(row.monthlyHours), row.salary.toFixed(2), row.status, String(row.version), JSON.stringify((row.details as { customFields?: unknown })?.customFields || {})]) };
  }
  if (input.kind === "CONTRATOS_MULTIPLOS") {
    const reference = input.competence ? payrollPeriod(input.competence).start : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    const contracts = await db.hrEmploymentContract.findMany({ where: input.q ? { employee: { OR: [{ name: { contains: input.q, mode: "insensitive" } }, { hrContracts: { some: { registration: { contains: input.q, mode: "insensitive" } } } }] } } : {}, include: { revisions: true, employee: { select: { id: true, name: true } } }, orderBy: [{ employeeId: "asc" }, { id: "asc" }] });
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
    const contracts = await db.hrEmploymentContract.findMany({ where: contractWhere, include: { revisions: true, employee: { select: { id: true, name: true } } }, orderBy: [{ registration: "asc" }, { id: "asc" }] });
    const active = contracts.flatMap(contract => {
      if (!contract.revisions.some(revision => revision.effectiveFrom <= reference)) return [];
      const snapshot = resolveContractRevision(contract, contract.revisions, { start: reference, end: reference }).contract;
      return snapshot.status === "ATIVO" && snapshot.admittedAt <= reference && (!snapshot.endsAt || snapshot.endsAt >= reference) ? [{ ...snapshot, employee: contract.employee }] : [];
    });
    const regimes = await db.hrEmploymentRegime.findMany({ where: { id: { in: [...new Set(active.map(contract => contract.regimeId))] } }, select: { id: true, name: true } });
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
    const roles = await db.role.findMany({ where: { id: { in: [...new Set(active.map(contract => contract.roleId))] } }, select: { id: true, name: true } });
    const roleNames = new Map(roles.map(role => [role.id, role.name]));
    return { title: "Relação de servidores/vínculos ativos — referência documental Ibema; nomes de cargo/regime do cadastro atual", headers: ["Referência", "Matrícula", "Nome", "Cargo/Função", "Lotação", "Situação", "Regime", "Admissão", "Faixa salarial", "Jornada mensal (horas)", "Versão contratual"], rows: active.map(contract => [date, contract.registration, contract.employee.name, roleNames.get(contract.roleId) || contract.roleId, contract.workLocation, contract.status, regimeNames.get(contract.regimeId) || contract.regimeId, contract.admittedAt.toISOString().slice(0, 10), contract.salaryLevel || "", String(contract.monthlyHours), String(contract.version)]) };
  }
  if (["FOLHA", "RESUMO_CONTABIL", "PREVIDENCIA", "IRRF", "PENSOES", "REMESSA_SALARIAL_POC"].includes(input.kind)) {
    const rows = await db.hrPayrollStatement.findMany({ where: { contract: contractWhere, run: { mode: "OFICIAL", status: "FECHADA", ...(input.payrollId ? { payrollId: input.payrollId } : {}), payroll: { AND: [payrollScope, ...(input.competence ? [{ competence: input.competence }] : [])] } } }, include: { contract: { select: { registration: true, employee: { select: { name: true } } } }, run: { select: { payroll: { select: { competence: true, type: true } }, scope: true } } }, orderBy: [{ run: { createdAt: "asc" } }, { id: "asc" }] });
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
      const grouped = new Map<string, { labels: string[]; value: Prisma.Decimal }>();
      for (const row of rows) {
        const snapshot = payrollSnapshot.parse(row.snapshot);
        if ((row.snapshot as { proration?: unknown }).proration) {
          for (const part of allocateProratedStatementLocations(row.snapshot, row.employer)) {
            const prefix = [row.run.payroll.competence, row.run.payroll.type, row.run.scope, snapshot.regime.code, part.costCenterId || "SEM_CENTRO", part.workLocation];
            const totals = [{ code: "TOTAL_BRUTO", type: "TOTAL", value: part.gross }, { code: "TOTAL_DESCONTOS", type: "TOTAL", value: part.deductions }, { code: "TOTAL_LIQUIDO", type: "TOTAL", value: part.net }, { code: "TOTAL_ENCARGOS", type: "TOTAL", value: part.employer }];
            for (const item of [...part.items, ...totals]) {
              const labels = [...prefix, item.code, item.type], key = JSON.stringify(labels);
              const group = grouped.get(key) ?? { labels, value: new Prisma.Decimal(0) };
              group.value = group.value.add(item.value); grouped.set(key, group);
            }
          }
          continue;
        }
        const prefix = [row.run.payroll.competence, row.run.payroll.type, row.run.scope, snapshot.regime.code, snapshot.contract.costCenterId || "SEM_CENTRO", snapshot.contract.workLocation];
        const totals = [{ code: "TOTAL_BRUTO", type: "TOTAL", value: row.gross }, { code: "TOTAL_DESCONTOS", type: "TOTAL", value: row.deductions }, { code: "TOTAL_LIQUIDO", type: "TOTAL", value: row.net }, { code: "TOTAL_ENCARGOS", type: "TOTAL", value: row.employer }];
        for (const item of [...snapshot.items, ...totals]) {
          const labels = [...prefix, item.code, item.type]; const key = JSON.stringify(labels);
          const group = grouped.get(key) || { labels, value: new Prisma.Decimal(0) };
          group.value = group.value.add(item.value); grouped.set(key, group);
        }
      }
      return { title: "Resumo por rubrica/regime/centro/local — totais são linhas de conferência, não somar com rubricas", headers: ["Competência", "Tipo folha", "Escopo", "Regime", "Centro ID", "Local", "Rubrica/total", "Tipo linha", "Valor BRL"], rows: [...grouped.values()].sort((a, b) => JSON.stringify(a.labels).localeCompare(JSON.stringify(b.labels))).map(group => [...group.labels, group.value.toFixed(2)]) };
    }
    return { title: "Folha calculada e fechada — não comprova pagamento", headers: ["Competência", "Tipo", "Escopo", "Matrícula", "Servidor", "Bruto BRL", "Descontos BRL", "Líquido BRL", "Encargos BRL", "Versão"], rows: rows.map(row => { const snapshot = payrollSnapshot.parse(row.snapshot); return [row.run.payroll.competence, row.run.payroll.type, row.run.scope, snapshot.contract.registration, snapshot.contract.employee.name, row.gross.toFixed(2), row.deductions.toFixed(2), row.net.toFixed(2), row.employer.toFixed(2), row.id]; }) };
  }
  const entries = await db.hrRightEntry.findMany({ where: { contract: contractWhere }, include: { contract: { select: { registration: true, employee: { select: { name: true } } } } }, orderBy: [{ periodStart: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
  const totals = new Map<string, { registration: string; name: string; kind: string; scope: string; start: string; end: string; quantity: Prisma.Decimal; amount: Prisma.Decimal }>();
  for (const entry of entries) {
    const start = entry.periodStart.toISOString().slice(0, 10); const end = entry.periodEnd.toISOString().slice(0, 10);
    const scope = (entry.details as { scope?: string }).scope || "LEGADO_SEM_ESCOPO";
    const key = `${entry.contractId}:${entry.kind}:${scope}:${start}:${end}`;
    const row = totals.get(key) || { registration: entry.contract.registration, name: entry.contract.employee.name, kind: entry.kind, scope, start, end, quantity: new Prisma.Decimal(0), amount: new Prisma.Decimal(0) };
    row.quantity = row.quantity.add(entry.quantity); row.amount = row.amount.add(entry.amount); totals.set(key, row);
  }
  return { title: "Saldos de direitos e provisões por escopo", headers: ["Matrícula", "Servidor", "Direito", "Escopo", "Início", "Fim", "Saldo quantidade", "Saldo BRL"], rows: [...totals.values()].map(row => [row.registration, row.name, row.kind, row.scope, row.start, row.end, row.quantity.toString(), row.amount.toFixed(2)]) };
}

export async function renderHrReport(report: Report, format: "CSV" | "XLSX" | "PDF") {
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
  const pdf = new PDFDocument({ size: "A4", margin: 35, bufferPages: true }); const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => { pdf.on("data", chunk => chunks.push(Buffer.from(chunk))); pdf.on("end", () => resolve(Buffer.concat(chunks))); pdf.on("error", reject); });
  pdf.fontSize(14).text(report.title); pdf.fontSize(9).text(`${report.rows.length} registros · relatório integral do filtro`); pdf.moveDown();
  for (const [index, row] of report.rows.entries()) {
    pdf.fontSize(9).text(`${index + 1}. ${row.map((value, col) => `${report.headers[col]}: ${value}`).join(" · ")}`);
    pdf.moveDown(0.5);
  }
  const pages = pdf.bufferedPageRange();
  for (let page = 0; page < pages.count; page++) { pdf.switchToPage(page); pdf.text(`${page + 1}/${pages.count}`, 35, pdf.page.height - 25, { lineBreak: false }); }
  pdf.end();
  return { bytes: await result, contentType: "application/pdf", extension: "pdf" };
}
