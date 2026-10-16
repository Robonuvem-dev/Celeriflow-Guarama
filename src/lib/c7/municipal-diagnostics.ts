import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { C7OperationError } from "./operations-service";
import { resolveFinancialReportScope } from "@/lib/financeiro/report-scope";
import { readMunicipalFiscalIndex } from "@/lib/financeiro/fiscal-indices";
import { taxAssessmentCompensatedValue, taxScopeSnapshot } from "@/lib/tributacao/scope";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";

type Actor = { usuarioId: string; allowedBudgetUnitIds?: string[]; sourcePermissions: { financial: boolean; procurement: boolean; tax: boolean } };
type Status = "REGULAR" | "IRREGULAR" | "NOT_EVALUATED";
type Result = { family: "SUPPLIER_DEBT" | "CONTRACT_LIMIT" | "NEGATIVE_SOURCE" | "CONSTITUTIONAL_MINIMUM"; subjectId: string; status: Status; description: string; evidence: unknown; diagnosticKey?: string; findingId?: string };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function runMunicipalControlDiagnostics(db: PrismaClient, actor: Actor, input: { planId: string; financialYearId: string; fiscalThrough: Date; idempotencyKey: string }) {
  if (!input.idempotencyKey?.trim() || !Number.isFinite(input.fiscalThrough.getTime())) throw new C7OperationError("Informe corte fiscal e chave de execução.");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "InternalControlPlan" WHERE id=${input.planId} FOR UPDATE`;
    const plan = await tx.internalControlPlan.findUnique({ where: { id: input.planId } });
    if (!plan?.budgetUnitId || plan.status !== "ABERTO" || plan.ownerId !== actor.usuarioId || (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(plan.budgetUnitId))) throw new C7OperationError("Diagnóstico exige plano aberto do controlador, com UG autorizada.");
    const binding = await tx.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId: plan.budgetUnitId } });
    const scope = await resolveFinancialReportScope(tx, input.financialYearId, { governmentEntityId: binding.governmentEntityId, budgetUnitIds: actor.allowedBudgetUnitIds });
    if (scope.governmentEntityId !== binding.governmentEntityId || !scope.fullEntity) throw new C7OperationError("Diagnóstico municipal exige exercício do ente e acesso às suas UGs completas.");
    const request = { planId: plan.id, financialYearId: input.financialYearId, fiscalThrough: input.fiscalThrough.toISOString(), idempotencyKey: input.idempotencyKey.trim() };
    const replay = await tx.internalControlEvent.findFirst({ where: { planId: plan.id, eventType: "MUNICIPAL_DIAGNOSTICS_EXECUTED", snapshot: { path: ["idempotencyKey"], equals: request.idempotencyKey } } });
    if (replay) { if ((replay.snapshot as Prisma.JsonObject).requestHash !== hash(request)) throw new C7OperationError("Chave do diagnóstico já utilizada com outro corte/exercício."); return replay; }
    const now = new Date();
    const rows: Result[] = [];
    const commits = actor.sourcePermissions.financial ? await tx.commitment.findMany({ where: { appropriation: { financialYearId: input.financialYearId, budgetUnitId: { in: scope.budgetUnitIds } } }, include: { supplier: true, movements: true, appropriation: true }, orderBy: { id: "asc" } }) : [];
    function effectiveValue(commitment: typeof commits[number]) {
      if (!commitment.valueDecimal || commitment.movements.some(movement => !["Reforço", "Anulação"].includes(movement.type))) return null;
      const value = commitment.movements.reduce((sum, movement) => sum.plus(movement.valueDecimal.mul(movement.type === "Reforço" ? 1 : -1)), commitment.valueDecimal);
      return value.gte(0) ? value : null;
    }
    if (!actor.sourcePermissions.financial || !actor.sourcePermissions.tax) rows.push({ family: "SUPPLIER_DEBT", subjectId: binding.governmentEntityId, status: "NOT_EVALUATED", description: "Leitura financeira e tributária não autorizada/ativada.", evidence: {} });
    else if (!commits.length) rows.push({ family: "SUPPLIER_DEBT", subjectId: binding.governmentEntityId, status: "NOT_EVALUATED", description: "Sem empenhos no exercício para avaliar fornecedores.", evidence: {} });
    else for (const supplier of new Map(commits.filter(commitment => effectiveValue(commitment)?.gt(0)).map(commitment => [commitment.supplierId, commitment.supplier])).values()) {
      const linked = commits.filter(commitment => commitment.supplierId === supplier.id).map(commitment => commitment.id);
      if ((!supplier.personId && !supplier.companyId) || (supplier.personId && supplier.companyId)) {
        rows.push({ family: "SUPPLIER_DEBT", subjectId: supplier.id, status: "NOT_EVALUATED", description: "Fornecedor sem identidade canônica PF/PJ única; exige conciliação documental antes de pesquisar débitos.", evidence: { commitmentIds: linked } });
        continue;
      }
      const identities = [...(supplier.personId ? [{ personId: supplier.personId }] : []), ...(supplier.companyId ? [{ companyId: supplier.companyId }] : [])];
      const taxpayers = await tx.taxpayer.findMany({ where: { OR: identities }, select: { id: true, taxpayerType: true, personId: true, companyId: true }, take: 2 });
      const taxpayer = taxpayers.length === 1 ? taxpayers[0] : null;
      if (taxpayers.length > 1 || taxpayer && (taxpayer.personId !== supplier.personId || taxpayer.companyId !== supplier.companyId || taxpayer.taxpayerType !== (supplier.personId ? "PF" : "PJ"))) {
        rows.push({ family: "SUPPLIER_DEBT", subjectId: supplier.id, status: "NOT_EVALUATED", description: "Contribuinte duplicado ou incompatível com a identidade do fornecedor; históricos preservados para conciliação.", evidence: { commitmentIds: linked, taxpayerIds: taxpayers.map(row => row.id) } });
        continue;
      }
      if (!taxpayer) { rows.push({ family: "SUPPLIER_DEBT", subjectId: supplier.id, status: "NOT_EVALUATED", description: "Fornecedor sem identidade vinculada a contribuinte municipal.", evidence: { commitmentIds: linked } }); continue; }
      const assessments = await tx.taxAssessment.findMany({ where: { taxpayerId: taxpayer.id, status: { notIn: ["Cancelado", "CANCELADO"] } }, include: { activeDebt: true }, orderBy: { id: "asc" } });
      const evidence: Array<{ assessmentId: string; debtId: string | null; balance: string }> = []; const issues: string[] = [];
      for (const assessment of assessments) {
        const stored = taxScopeSnapshot(assessment.calculationSnapshot);
        const unitId = typeof stored.budgetUnitId === "string" ? stored.budgetUnitId : assessment.activeDebt?.budgetUnitId;
        const unit = unitId ? await tx.planningEntityUnit.findUnique({ where: { budgetUnitId: unitId } }) : null;
        if (!unit) { issues.push(`Lançamento ${assessment.id} sem ente/UG duráveis.`); continue; }
        if (unit.governmentEntityId !== binding.governmentEntityId) continue;
        if (typeof stored.governmentEntityId === "string" && stored.governmentEntityId !== unit.governmentEntityId) { issues.push(`Escopo histórico divergente em ${assessment.id}.`); continue; }
        if (assessment.activeDebt && ["CANCELADA", "Cancelada", "BAIXADA", "BAIXADA_PRESCRICAO", "DEVOLVIDA"].includes(assessment.activeDebt.status)) continue;
        const value = assessment.finalValueDecimal ?? assessment.originalValueDecimal;
        const payments = await tx.taxPayment.findMany({ where: { guide: { assessmentId: assessment.id }, status: "Confirmado" }, select: { id: true, amountPaidDecimal: true } });
        if (!value || payments.some(payment => !payment.amountPaidDecimal)) { issues.push(`Posição Decimal não conciliada em ${assessment.id}.`); continue; }
        const paid = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), await taxAssessmentCompensatedValue(tx, assessment.id));
        const balance = Prisma.Decimal.max(0, value.minus(paid));
        evidence.push({ assessmentId: assessment.id, debtId: assessment.activeDebt?.id ?? null, balance: balance.toFixed(2) });
      }
      const unlinkedDebts = await tx.activeDebt.findMany({ where: { taxpayerId: taxpayer.id, assessmentId: null, status: { notIn: ["PAGA", "Paga", "CANCELADA", "Cancelada", "BAIXADA", "BAIXADA_PRESCRICAO", "DEVOLVIDA"] }, OR: [{ governmentEntityId: binding.governmentEntityId }, { governmentEntityId: null }] }, select: { id: true } });
      if (unlinkedDebts.length) issues.push("Dívidas legadas sem lançamento reconciliado exigem conferência individual.");
      const total = evidence.reduce((sum, row) => sum.plus(row.balance), new Prisma.Decimal(0));
      rows.push({ family: "SUPPLIER_DEBT", subjectId: supplier.id, status: total.gt(0) ? "IRREGULAR" : issues.length ? "NOT_EVALUATED" : "REGULAR", description: total.gt(0) ? `Fornecedor de empenhos possui saldo tributário municipal de ${total.toFixed(2)} BRL; achado não equivale a impedimento legal de contratação.` : issues.length ? issues.join(" ") : "Não identificado saldo tributário nos lançamentos conciliados do ente.", evidence: { taxpayerId: taxpayer.id, commitmentIds: linked, positions: evidence, issues, total: total.toFixed(2), checkedAt: now.toISOString(), scope: "CURRENT_POSITION" } });
    }
    if (!actor.sourcePermissions.financial || !actor.sourcePermissions.procurement) rows.push({ family: "CONTRACT_LIMIT", subjectId: binding.governmentEntityId, status: "NOT_EVALUATED", description: "Leitura de Financeiro/Compras não autorizada/ativada.", evidence: {} });
    else {
      const contractIds = [...new Set(commits.flatMap(commitment => commitment.contractId ? [commitment.contractId] : []))];
      if (!contractIds.length) rows.push({ family: "CONTRACT_LIMIT", subjectId: binding.governmentEntityId, status: "NOT_EVALUATED", description: "Sem empenhos vinculados a contratos no exercício.", evidence: {} });
      for (const id of contractIds) {
        const contract = await tx.contract.findUniqueOrThrow({ where: { id }, include: { commitments: { include: { movements: true, appropriation: true, supplier: true } } } });
        const values = contract.commitments.map(effectiveValue);
        const unit = contract.sourceBudgetUnitId ? await tx.planningEntityUnit.findUnique({ where: { budgetUnitId: contract.sourceBudgetUnitId } }) : null;
        const limit = Number.isFinite(contract.updatedValue) ? new Prisma.Decimal(String(contract.updatedValue)) : null;
        if (!unit || unit.governmentEntityId !== binding.governmentEntityId || values.some(value => !value) || !limit || limit.lt(0) || limit.decimalPlaces() > 2 || contract.commitments.some(commitment => !scope.budgetUnitIds!.includes(commitment.appropriation.budgetUnitId))) { rows.push({ family: "CONTRACT_LIMIT", subjectId: id, status: "NOT_EVALUATED", description: "Contrato/empenhos sem UG, valor ou movimentos conciliados no ente.", evidence: { number: contract.number } }); continue; }
        const committed = values.reduce<Prisma.Decimal>((sum, value) => sum.plus(value!), new Prisma.Decimal(0));
        rows.push({ family: "CONTRACT_LIMIT", subjectId: id, status: committed.gt(limit) ? "IRREGULAR" : "REGULAR", description: `Contrato ${contract.number}: empenhado líquido ${committed.toFixed(2)} BRL; limite cadastral vigente ${limit.toFixed(2)} BRL.`, evidence: { contractId: id, updatedAt: contract.updatedAt.toISOString(), registeredLimit: String(contract.updatedValue), valueRepresentation: "REGISTERED_FLOAT_READ_AS_DECIMAL_WITHOUT_BACKFILL", committed: committed.toFixed(2), commitments: contract.commitments.map((commitment, at) => ({ id: commitment.id, value: values[at]!.toFixed(2), movementIds: commitment.movements.map(movement => movement.id) })), scope: "ALL_CONTRACT_COMMITMENTS_CURRENT_POSITION" } });
      }
    }
    if (!actor.sourcePermissions.financial) rows.push({ family: "NEGATIVE_SOURCE", subjectId: binding.governmentEntityId, status: "NOT_EVALUATED", description: "Leitura financeira não autorizada/ativada.", evidence: {} });
    else {
      const accounts = await tx.bankAccount.findMany({ where: { budgetUnitId: { in: scope.budgetUnitIds } }, include: { treasuryMovements: { where: { status: "Confirmado", date: { lte: now } }, orderBy: { id: "asc" } } } });
      const grouped = new Map<string, { value: Prisma.Decimal; ids: string[]; movementIds: string[]; issues: string[] }>();
      if (!accounts.length) rows.push({ family: "NEGATIVE_SOURCE", subjectId: binding.governmentEntityId, status: "NOT_EVALUATED", description: "Sem contas bancárias conciliadas no ente.", evidence: {} });
      for (const account of accounts) {
        if (!account.resourceSourceId) { rows.push({ family: "NEGATIVE_SOURCE", subjectId: account.id, status: "NOT_EVALUATED", description: "Conta bancária sem fonte vinculada.", evidence: {} }); continue; }
        const group = grouped.get(account.resourceSourceId) ?? { value: new Prisma.Decimal(0), ids: [], movementIds: [], issues: [] };
        group.ids.push(account.id);
        const creation = await tx.financialAuditLog.findFirst({ where: { entityType: "BankAccount", entityId: account.id, action: "CREATE" }, orderBy: { createdAt: "asc" }, select: { payload: true } });
        const creationMemory = taxScopeSnapshot(creation?.payload);
        if (!account.treasuryMovements.some(movement => movement.type === "OpeningBalance") && creationMemory.openingBalance !== "0.00") group.issues.push(`Conta ${account.id} sem saldo inicial auditado, inclusive zero.`);
        if (!account.treasuryMovements.length) group.issues.push(`Conta ${account.id} sem movimentos/saldo inicial reconciliado.`);
        for (const movement of account.treasuryMovements) {
          const sign = ["Entrada", "CREDIT"].includes(movement.direction) ? 1 : ["Saída", "DEBIT"].includes(movement.direction) ? -1 : null;
          if (sign === null) { group.issues.push(`Sinal inválido no movimento ${movement.id}.`); continue; }
          group.value = group.value.plus(movement.valueDecimal.mul(sign)); group.movementIds.push(movement.id);
        }
        grouped.set(account.resourceSourceId, group);
      }
      for (const [sourceId, group] of grouped) {
        const issues = [...group.issues, "Disponibilidade de DDR/passivos por fonte ainda não conciliada; saldo bancário positivo não comprova regularidade da fonte."];
        rows.push({ family: "NEGATIVE_SOURCE", subjectId: sourceId, status: group.value.lt(0) ? "IRREGULAR" : "NOT_EVALUATED", description: `Saldo de tesouraria das contas vinculadas à fonte: ${group.value.toFixed(2)} BRL. ${issues.join(" ")}`, evidence: { accountIds: group.ids, treasuryMovementIds: group.movementIds, balance: group.value.toFixed(2), issues, scope: "CURRENT_BANK_SOURCE_CASH_BALANCE_NOT_DDR_AVAILABILITY" } });
      }
    }
    for (const code of ["HEALTH_MINIMUM", "EDUCATION_MINIMUM"] as const) {
      if (!actor.sourcePermissions.financial) rows.push({ family: "CONSTITUTIONAL_MINIMUM", subjectId: code, status: "NOT_EVALUATED", description: "Leitura financeira não autorizada/ativada.", evidence: {} });
      else {
        const index = await readMunicipalFiscalIndex(tx, actor, { financialYearId: input.financialYearId, code, through: input.fiscalThrough });
        rows.push({ family: "CONSTITUTIONAL_MINIMUM", subjectId: code, status: index.status, description: index.status === "NOT_EVALUATED" ? index.issues.join(" ") : `Aplicação ${index.percentage}% frente ao mínimo configurado ${index.minimum}%.`, evidence: index });
      }
    }
    const findingIds: string[] = [];
    const priorRuns = await tx.internalControlEvent.findMany({ where: { planId: plan.id, eventType: "MUNICIPAL_DIAGNOSTICS_EXECUTED" }, select: { snapshot: true } });
    for (const row of rows.filter(row => row.status === "IRREGULAR")) {
      const stable = row.evidence && typeof row.evidence === "object" ? Object.fromEntries(Object.entries(row.evidence).filter(([key]) => key !== "checkedAt")) : row.evidence;
      row.diagnosticKey = hash({ family: row.family, subjectId: row.subjectId, evidence: stable });
      const priorIds = priorRuns.flatMap(run => { const memory = run.snapshot as Prisma.JsonObject; return Array.isArray(memory.rows) ? memory.rows.flatMap(value => value && typeof value === "object" && !Array.isArray(value) && value.diagnosticKey === row.diagnosticKey && typeof value.findingId === "string" ? [value.findingId] : []) : []; });
      const prior = priorIds.length ? await tx.internalControlFinding.findFirst({ where: { id: { in: priorIds }, planId: plan.id, status: "PENDENTE" }, select: { id: true } }) : null;
      if (prior) { row.findingId = prior.id; findingIds.push(prior.id); continue; }
      const finding = await tx.internalControlFinding.create({ data: { planId: plan.id, title: `${row.family}: ${row.subjectId}`, description: row.description, status: "PENDENTE" } });
      row.findingId = finding.id; findingIds.push(finding.id);
    }
    const event = await tx.internalControlEvent.create({ data: { planId: plan.id, eventType: "MUNICIPAL_DIAGNOSTICS_EXECUTED", actorId: actor.usuarioId, reason: `Quatro famílias de diagnóstico; ${findingIds.length} achados`, snapshot: json({ ...request, requestHash: hash(request), evaluatedAt: now.toISOString(), governmentEntityId: binding.governmentEntityId, rows, sourceHash: hash(rows), findingIds }) } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "MUNICIPAL_CONTROL_DIAGNOSTICS", targetId: event.id });
    return event;
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
}
