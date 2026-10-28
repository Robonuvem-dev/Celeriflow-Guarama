import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { planningActions, planningFixations, planningForecasts, planningGoals, planningIndicators, planningObjectives, planningPriorities, planningPrograms, planningRisks } from "@/db/schema/planning-legal";
import { planningBudgetLaws, planningGuidelines, planningMultiYearPlans } from "@/db/schema/planning-budget";
import { budgetAppropriations } from "@/db/schema/finance-budget";
import { financeCmdSchedules, financeMbaTargets, financeCreditRequests, financeCreditItems, financePlanningAmendments } from "@/db/schema/finance-legacy-budget";
import { documents } from "@/db/schema/registry";
import { documentVersions } from "@/db/schema/document-workflow";
import { insertAnnualAudit } from "@/db/repositories/finance/annual-stages";
import { findFinancialScopeYear } from "@/db/repositories/finance/report-scopes";
import { findFinanceCredit, findFinanceLegacyAction, findFinanceLegacyFixation, findFinanceLegacyGuideline, findFinanceLegacyLaw, findFinanceLegacyObjective, findFinanceLegacyPiece, findFinanceLegacyPlan, findFinanceLegacyProgram, findFinanceLegacyRegistry, isFinanceCreditPlanningOwned, isFinanceLegacyPieceAdopted, listFinanceLegacyAppropriations, readFinanceCmdMbaFacts, readFinanceCreditItems } from "@/db/repositories/finance/legacy-budget";
import { listFinanceGuidelineDocuments, listFinanceLawDocuments, listFinancePlanDocuments, listFinanceReportCredits, listFinanceReportUnits } from "@/db/repositories/finance/report-planning-data";
import { assertFinancialYearOpen, FinanceActor, FinanceError, createBudgetMovementInTransaction } from "./index";

type Db = DatabaseExecutor;

const creditTypes = ["Suplementar", "Especial", "Extraordinário", "Remanejamento", "Transposição", "Transferência"] as const;
const creditItemTypes = ["Acréscimo", "Anulação"] as const;

type CreditType = (typeof creditTypes)[number];
type CreditItemType = (typeof creditItemTypes)[number];
type PlanningEntityType = "PPA" | "LDO" | "LOA";
type LegalWorkflowStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "SANCTIONED" | "PUBLISHED";
type LegalEvidenceInput = { legalActNumber: string; legalActDate: Date; legalDocumentId: string };
type PublicationInput = { publicationDate: Date; publicationReference: string };

function assertWorkflowStatus(status: string, expected: LegalWorkflowStatus, label: string) {
  if (status !== expected) throw new FinanceError(`${label} deve estar em ${expected} para esta etapa.`);
}

function assertActorIsDistinct(actor: FinanceActor, priorActorIds: (string | null | undefined)[]) {
  if (priorActorIds.includes(actor.usuarioId)) {
    throw new FinanceError("Segregação de funções: o ator desta etapa deve ser diferente dos atores anteriores.");
  }
}

function assertPlanningEditable(status: string, label: string) {
  if (status === "SANCTIONED" || status === "PUBLISHED") {
    throw new FinanceError(`${label} não pode ser alterado após a sanção.`);
  }
}

function validateDate(value: Date, field: string) {
  if (Number.isNaN(value.getTime())) throw new FinanceError(`${field} inválida.`);
  return value;
}

async function assertValidFinalDocument(tx: Db, documentId: string) {
  if (!documentId) throw new FinanceError("Documento GED comprobatório é obrigatório.");
  const [document] = await tx.select().from(documents).where(eq(documents.id, documentId));
  const versions = await tx.select({ id: documentVersions.id }).from(documentVersions).where(and(eq(documentVersions.documentId, documentId), sql`${documentVersions.status} IN ('FINAL','SIGNED')`)).limit(1);
  if (!document || document.status !== "Válido" || (document.validUntil && document.validUntil < new Date()) || !versions.length) {
    throw new FinanceError("O documento GED comprobatório deve estar válido e possuir versão finalizada.");
  }
}

async function validateLegalEvidence(tx: Db, input: LegalEvidenceInput) {
  requireText(input.legalActNumber, "Número do ato legal");
  validateDate(input.legalActDate, "Data do ato legal");
  await assertValidFinalDocument(tx, input.legalDocumentId);
}

function validatePublication(input: PublicationInput) {
  validateDate(input.publicationDate, "Data de publicação");
  requireText(input.publicationReference, "Referência da publicação");
}

async function assertFinancialYearPlanningEligible(tx: Db, financialYearId: string) {
  const financialYear = await findFinancialScopeYear(tx, financialYearId);
  if (!financialYear) throw new FinanceError("Exercício financeiro não encontrado.");
  if (!['Preparação', 'Aberto'].includes(financialYear.status)) {
    throw new FinanceError(`O exercício ${financialYear.year} não está disponível para planejamento.`);
  }
  return financialYear;
}

function requireText(value: string, field: string) {
  if (!value.trim()) throw new FinanceError(`${field} é obrigatório.`);
  return value.trim();
}

function requirePositiveMoney(value: number, field: string) {
  const decimal = new Decimal(value);
  if (!decimal.isFinite() || decimal.lessThanOrEqualTo(0)) {
    throw new FinanceError(`${field} deve ser maior que zero.`);
  }
  return decimal.toDecimalPlaces(2);
}

function requireNonNegativeMoney(value: number, field: string) {
  const decimal = new Decimal(value);
  if (!decimal.isFinite() || decimal.lessThan(0)) {
    throw new FinanceError(`${field} deve ser maior ou igual a zero.`);
  }
  return decimal.toDecimalPlaces(2);
}

function requireNonNegativeNumber(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new FinanceError(`${field} deve ser maior ou igual a zero.`);
  }
  return value;
}

function assertBudgetUnitPermission(actor: FinanceActor, budgetUnitId: string) {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(budgetUnitId)) {
    throw new FinanceError("Acesso negado à unidade gestora da dotação.");
  }
}

async function lockCreditRequest(tx: DatabaseTransaction, creditRequestId: string) {
  await tx.execute(sql`SELECT id FROM "CreditRequest" WHERE id = ${creditRequestId} FOR UPDATE`);
  if (await isFinanceCreditPlanningOwned(tx, creditRequestId)) {
    throw new FinanceError("Este crédito pertence ao Planejamento e Orçamento. Utilize a jornada da entidade responsável.");
  }
}

async function assertLegacyPlanningOwner(tx: DatabaseTransaction, entityType: PlanningEntityType, id: string) {
  if (await isFinanceLegacyPieceAdopted(tx, entityType, id)) throw new FinanceError("A peça foi adotada pelo Planejamento e Orçamento; utilize a jornada da entidade responsável.");
}

async function audit(
  tx: DatabaseTransaction,
  actor: FinanceActor,
  action: string,
  entityType: string,
  entityId: string,
  payload: JsonValue,
  financialYearId?: string,
  budgetUnitId?: string,
) {
  await insertAnnualAudit(tx, {
      action,
      entityType,
      entityId,
      financialYearId,
      budgetUnitId: budgetUnitId || actor.budgetUnitId || undefined,
      payload,
      authorUsuarioId: actor.usuarioId,
      authorEmployeeId: actor.employeeId,
  });
}

function decimalSnapshot(value: Decimal | null) {
  return value === null ? null : value.toFixed(2);
}

async function planningSnapshot(tx: Db, entityType: PlanningEntityType, entityId: string): Promise<JsonValue> {
  if (entityType === "PPA") {
    const [plan] = await listFinancePlanDocuments(tx, { id: entityId });
    if (!plan) throw new FinanceError("PPA não encontrado para registrar a alteração.");
    return {
      code: plan.code, name: plan.name, startYear: plan.startYear, endYear: plan.endYear, status: plan.status, description: plan.description,
      programs: plan.programs.map((program) => ({
        code: program.code, name: program.name, type: program.type,
        objectives: program.objectives.map((objective) => ({ code: objective.code, description: objective.description, indicators: objective.indicators.map((indicator) => ({ name: indicator.name, unit: indicator.unit, baselineValue: indicator.baselineValue, targetValue: indicator.targetValue })) })),
        actions: program.actions.map((action) => ({ code: action.code, name: action.name, type: action.type, goals: action.goals.map((goal) => ({ year: goal.year, physical: goal.physical, financial: decimalSnapshot(goal.financial) })) })),
      })),
    };
  }

  if (entityType === "LDO") {
    const [guideline] = await listFinanceGuidelineDocuments(tx, { id: entityId });
    if (!guideline) throw new FinanceError("LDO não encontrada para registrar a alteração.");
    const year = await findFinancialScopeYear(tx, guideline.financialYearId);
    if (!year) throw new FinanceError("Exercício financeiro não encontrado.");
    return {
      financialYear: year.year, ppaCode: guideline.multiYearPlan?.code ?? null, status: guideline.status,
      priorities: guideline.priorities.map((priority) => ({ description: priority.description, targetValue: decimalSnapshot(priority.targetValue) })),
      risks: guideline.risks.map((risk) => ({ description: risk.description, estimatedImpact: risk.estimatedImpact.toFixed(2), mitigation: risk.mitigation })),
    };
  }

  const [law] = await listFinanceLawDocuments(tx, { id: entityId });
  if (!law) throw new FinanceError("LOA não encontrada para registrar a alteração.");
  const year = await findFinancialScopeYear(tx, law.financialYearId);
  if (!year) throw new FinanceError("Exercício financeiro não encontrado.");
  return {
    lawNumber: law.lawNumber, publicationDate: law.publicationDate?.toISOString() ?? null, financialYear: year.year, status: law.status,
    totalRevenue: law.totalRevenue.toFixed(2), totalExpense: law.totalExpense.toFixed(2),
    revenueForecasts: law.revenueForecasts.map((forecast) => ({ code: forecast.code, name: forecast.name, estimatedValue: forecast.estimatedValue.toFixed(2) })),
    expenseFixations: law.expenseFixations.map((fixation) => ({ code: fixation.code, name: fixation.name, fixedValue: fixation.fixedValue.toFixed(2) })),
    cmdSchedules: law.cmdSchedules.map((schedule) => ({ month: schedule.month, budgetUnitId: schedule.budgetUnitId, limitValue: schedule.limitValue.toFixed(2) })),
    mbaTargets: law.mbaTargets.map((target) => ({ bimonth: target.bimonth, targetValue: target.targetValue.toFixed(2) })),
  };
}

export async function createPlanningAmendment(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { entityType: PlanningEntityType; entityId: string; reason: string; amendedSnapshot: JsonValue },
) {
  const reason = requireText(input.reason, "Justificativa da alteração");
  if (!input.entityId) throw new FinanceError("Selecione o registro de planejamento a alterar.");
  return withDatabaseTransaction(db, async (tx) => {
    const entity = await findFinanceLegacyPiece(tx, input.entityType, input.entityId);
    if (!entity) throw new FinanceError("Registro de planejamento não encontrado.");
    assertPlanningEditable(entity.status, input.entityType);
    // Serializes version allocation even before a record exists for this entity.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PlanningAmendment:${input.entityType}:${input.entityId}`}))`);
    const originalSnapshot = await planningSnapshot(tx, input.entityType, input.entityId);
    const [latest] = await tx.select({ version: financePlanningAmendments.version }).from(financePlanningAmendments).where(and(eq(financePlanningAmendments.entityType, input.entityType), eq(financePlanningAmendments.entityId, input.entityId))).orderBy(desc(financePlanningAmendments.version)).limit(1);
    const [amendment] = await tx.insert(financePlanningAmendments).values({
        entityType: input.entityType,
        entityId: input.entityId,
        version: (latest?.version ?? 0) + 1,
        reason,
        originalSnapshot,
        amendedSnapshot: input.amendedSnapshot,
        authorUsuarioId: actor.usuarioId,
    }).returning();
    await audit(tx, actor, "CREATE", "PlanningAmendment", amendment.id, { entityType: amendment.entityType, entityId: amendment.entityId, version: amendment.version, reason });
    return amendment;
  });
}

export async function getAnnualBudgetScheduleCompletion(tx: Db, annualBudgetLawId: string, budgetUnitId?: string) {
  const [cmdSchedules, mbaTargets] = await Promise.all([
    tx.select({ month: financeCmdSchedules.month }).from(financeCmdSchedules).where(and(eq(financeCmdSchedules.annualBudgetLawId, annualBudgetLawId), budgetUnitId ? eq(financeCmdSchedules.budgetUnitId, budgetUnitId) : undefined)),
    tx.select({ bimonth: financeMbaTargets.bimonth }).from(financeMbaTargets).where(eq(financeMbaTargets.annualBudgetLawId, annualBudgetLawId)),
  ]);
  const cmdMonths = new Set(cmdSchedules.map((schedule) => schedule.month));
  const mbaBimesters = new Set(mbaTargets.map((target) => target.bimonth));
  return {
    cmdMonths: cmdMonths.size,
    mbaBimesters: mbaBimesters.size,
    missingCmdMonths: Array.from({ length: 12 }, (_, index) => index + 1).filter((month) => !cmdMonths.has(month)),
    missingMbaBimesters: Array.from({ length: 6 }, (_, index) => index + 1).filter((bimonth) => !mbaBimesters.has(bimonth)),
    cmdComplete: cmdMonths.size === 12,
    mbaComplete: mbaBimesters.size === 6,
  };
}

// --- PPA (Plano Plurianual) ---

export async function createMultiYearPlan(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: {
    code: string;
    name: string;
    startYear: number;
    endYear: number;
    description?: string;
  },
) {
  requireText(input.code, "Código do PPA");
  requireText(input.name, "Nome do PPA");
  if (!Number.isInteger(input.startYear) || !Number.isInteger(input.endYear)) {
    throw new FinanceError("Os anos de vigência do PPA devem ser números inteiros.");
  }
  if (input.endYear <= input.startYear) {
    throw new FinanceError("O ano final do PPA deve ser maior que o ano inicial.");
  }

  return withDatabaseTransaction(db, async (tx) => {
    const existing = await findFinanceLegacyPlan(tx, { code: input.code });
    if (existing) throw new FinanceError(`Já existe um PPA com o código ${input.code}.`);

    const [plan] = await tx.insert(planningMultiYearPlans).values({
        code: input.code.trim(),
        name: input.name.trim(),
        startYear: input.startYear,
        endYear: input.endYear,
        description: input.description?.trim(),
        status: "DRAFT",
        draftedById: actor.usuarioId,
    }).returning();

    await audit(tx, actor, "CREATE", "MultiYearPlan", plan.id, { code: plan.code, name: plan.name });
    return plan;
  });
}

export async function addProgramPPA(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: {
    multiYearPlanId: string;
    code: string;
    name: string;
    type?: string;
  },
) {
  requireText(input.code, "Código do programa");
  requireText(input.name, "Nome do programa");
  return withDatabaseTransaction(db, async (tx) => {
    const plan = await findFinanceLegacyPlan(tx, { id: input.multiYearPlanId });
    if (!plan) throw new FinanceError("Plano Plurianual não encontrado.");
    await assertLegacyPlanningOwner(tx, "PPA", plan.id);
    assertPlanningEditable(plan.status, "PPA");

    const [program] = await tx.insert(planningPrograms).values({
        multiYearPlanId: plan.id,
        code: input.code.trim(),
        name: input.name.trim(),
        type: input.type?.trim() || "Finalístico",
    }).returning();

    await audit(tx, actor, "CREATE", "ProgramPPA", program.id, { code: program.code, name: program.name });
    return program;
  });
}

export async function addActionPPA(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { programId: string; code: string; name: string; type?: string },
) {
  requireText(input.code, "Codigo da acao");
  requireText(input.name, "Nome da acao");
  return withDatabaseTransaction(db, async (tx) => {
    const program = await findFinanceLegacyProgram(tx, input.programId);
    if (!program) throw new FinanceError("Programa do PPA nao encontrado.");
    await assertLegacyPlanningOwner(tx, "PPA", program.multiYearPlanId);
    assertPlanningEditable(program.multiYearPlan.status, "PPA");
    const [action] = await tx.insert(planningActions).values({ programId: program.id, code: input.code.trim(), name: input.name.trim(), type: input.type?.trim() || "Projeto" }).returning();
    await audit(tx, actor, "CREATE", "ActionPPA", action.id, { code: action.code, name: action.name, programId: program.id });
    return action;
  });
}

export async function addObjectivePPA(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { programId: string; code: string; description: string },
) {
  const code = requireText(input.code, "Código do objetivo");
  const description = requireText(input.description, "Descrição do objetivo");
  return withDatabaseTransaction(db, async (tx) => {
    const program = await findFinanceLegacyProgram(tx, input.programId);
    if (!program) throw new FinanceError("Programa do PPA não encontrado.");
    await assertLegacyPlanningOwner(tx, "PPA", program.multiYearPlanId);
    assertPlanningEditable(program.multiYearPlan.status, "PPA");
    const [objective] = await tx.insert(planningObjectives).values({ programId: program.id, code, description }).returning();
    await audit(tx, actor, "CREATE", "ObjectivePPA", objective.id, { programId: program.id, code, description });
    return objective;
  });
}

export async function addIndicatorPPA(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { objectiveId: string; name: string; unit: string; baselineValue: number; targetValue: number },
) {
  const name = requireText(input.name, "Nome do indicador");
  const unit = requireText(input.unit, "Unidade de medida");
  const baselineValue = requireNonNegativeNumber(input.baselineValue, "Valor de referência");
  const targetValue = requireNonNegativeNumber(input.targetValue, "Valor da meta");
  return withDatabaseTransaction(db, async (tx) => {
    const objective = await findFinanceLegacyObjective(tx, input.objectiveId);
    if (!objective) throw new FinanceError("Objetivo do PPA não encontrado.");
    await assertLegacyPlanningOwner(tx, "PPA", objective.program.multiYearPlanId);
    assertPlanningEditable(objective.program.multiYearPlan.status, "PPA");
    const [indicator] = await tx.insert(planningIndicators).values({ objectiveId: objective.id, name, unit, baselineValue, targetValue }).returning();
    await audit(tx, actor, "CREATE", "IndicatorPPA", indicator.id, {
      objectiveId: objective.id,
      name,
      unit,
      baselineValue,
      targetValue,
    });
    return indicator;
  });
}

export async function addGoalPPA(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { actionId: string; year: number; physical: number; financial: number },
) {
  if (!Number.isInteger(input.year)) throw new FinanceError("O ano da meta deve ser um número inteiro.");
  const physical = requireNonNegativeNumber(input.physical, "Meta física");
  const financial = requireNonNegativeMoney(input.financial, "Meta financeira");
  return withDatabaseTransaction(db, async (tx) => {
    const action = await findFinanceLegacyAction(tx, input.actionId);
    if (!action) throw new FinanceError("Ação do PPA não encontrada.");
    await assertLegacyPlanningOwner(tx, "PPA", action.program.multiYearPlanId);
    const plan = action.program.multiYearPlan;
    assertPlanningEditable(plan.status, "PPA");
    if (input.year < plan.startYear || input.year > plan.endYear) {
      throw new FinanceError("O ano da meta deve estar dentro da vigência do PPA.");
    }
    const [goal] = await tx.insert(planningGoals).values({ actionId: action.id, year: input.year, physical, financial }).returning();
    await audit(tx, actor, "CREATE", "GoalPPA", goal.id, {
      actionId: action.id,
      year: input.year,
      physical,
      financial: financial.toFixed(2),
    });
    return goal;
  });
}

// --- LDO (Lei de Diretrizes Orçamentárias) ---

export async function createBudgetGuideline(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: {
    financialYearId: string;
    multiYearPlanId: string;
    priorities?: { description: string; targetValue?: number }[];
    risks?: { description: string; estimatedImpact: number; mitigation: string }[];
  },
) {
  return withDatabaseTransaction(db, async (tx) => {
    const financialYear = await assertFinancialYearPlanningEligible(tx, input.financialYearId);
    const plan = await findFinanceLegacyPlan(tx, { id: input.multiYearPlanId });
    if (!plan) throw new FinanceError("Plano Plurianual não encontrado.");
    await assertLegacyPlanningOwner(tx, "PPA", plan.id);
    if (financialYear.year < plan.startYear || financialYear.year > plan.endYear) {
      throw new FinanceError("O exercício da LDO deve estar dentro da vigência do PPA selecionado.");
    }
    const priorities = input.priorities ?? [];
    const risks = input.risks ?? [];
    for (const priority of priorities) requireText(priority.description, "Descrição da prioridade");
    for (const risk of risks) {
      requireText(risk.description, "Descrição do risco");
      requireText(risk.mitigation, "Mitigação do risco");
      requirePositiveMoney(risk.estimatedImpact, "Impacto estimado do risco");
    }
    const [guideline] = await tx.insert(planningGuidelines).values({
          financialYearId: input.financialYearId,
          multiYearPlanId: input.multiYearPlanId,
          status: "DRAFT",
          draftedById: actor.usuarioId,
    }).returning();
    const createdPriorities = priorities.length ? await tx.insert(planningPriorities).values(priorities.map(p => ({ budgetGuidelineId: guideline.id, description: p.description.trim(), targetValue: p.targetValue === undefined ? undefined : requirePositiveMoney(p.targetValue, "Meta da prioridade") }))).returning() : [];
    const createdRisks = risks.length ? await tx.insert(planningRisks).values(risks.map(r => ({ budgetGuidelineId: guideline.id, description: r.description.trim(), estimatedImpact: requirePositiveMoney(r.estimatedImpact, "Impacto estimado do risco"), mitigation: r.mitigation.trim() }))).returning() : [];

    await audit(tx, actor, "CREATE", "BudgetGuideline", guideline.id, {}, input.financialYearId);
    return { ...guideline, priorities: createdPriorities, risks: createdRisks };
  });
}

// --- LOA (Lei Orçamentária Anual) ---

export async function createAnnualBudgetLaw(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: {
    lawNumber: string;
    publicationDate: Date;
    financialYearId: string;
    budgetGuidelineId: string;
    totalRevenue: number;
    totalExpense: number;
    revenueForecasts?: { code: string; name: string; estimatedValue: number }[];
    expenseFixations?: { code: string; name: string; fixedValue: number }[];
  },
) {
  requireText(input.lawNumber, "Número da LOA");
  if (Number.isNaN(input.publicationDate.getTime())) {
    throw new FinanceError("Data de publicação da LOA inválida.");
  }
  const revenue = new Decimal(input.totalRevenue);
  const expense = new Decimal(input.totalExpense);

  if (!revenue.isFinite() || !expense.isFinite() || revenue.lessThanOrEqualTo(0) || expense.lessThanOrEqualTo(0)) {
    throw new FinanceError("Os totais da LOA devem ser maiores que zero.");
  }
  if (!revenue.equals(expense)) {
    throw new FinanceError("O valor total da receita prevista deve ser igual ao valor total da despesa fixada (Equilíbrio Orçamentário).");
  }

  const revenueForecasts = input.revenueForecasts ?? [];
  const expenseFixations = input.expenseFixations ?? [];
  if (!revenueForecasts.length || !expenseFixations.length) {
    throw new FinanceError("Informe a previsão de receita e a fixação de despesa que compõem a LOA.");
  }
  const forecastTotal = revenueForecasts.reduce(
    (sum, item) => sum.plus(requirePositiveMoney(item.estimatedValue, "Valor previsto da receita")),
    new Decimal(0),
  );
  const fixationTotal = expenseFixations.reduce(
    (sum, item) => sum.plus(requirePositiveMoney(item.fixedValue, "Valor fixado da despesa")),
    new Decimal(0),
  );
  if (!forecastTotal.equals(revenue) || !fixationTotal.equals(expense)) {
    throw new FinanceError("Os totais informados devem corresponder à soma das previsões e fixações da LOA.");
  }

  return withDatabaseTransaction(db, async (tx) => {
    await assertFinancialYearPlanningEligible(tx, input.financialYearId);
    const guideline = await findFinanceLegacyGuideline(tx, input.budgetGuidelineId);
    if (!guideline) throw new FinanceError("Lei de Diretrizes Orçamentárias não encontrada.");
    await assertLegacyPlanningOwner(tx, "LDO", guideline.id);
    if (guideline.financialYearId !== input.financialYearId) {
      throw new FinanceError("A LDO selecionada deve pertencer ao mesmo exercício financeiro da LOA.");
    }

    const [loa] = await tx.insert(planningBudgetLaws).values({
        lawNumber: input.lawNumber.trim(),
        publicationDate: input.publicationDate,
        financialYearId: input.financialYearId,
        budgetGuidelineId: input.budgetGuidelineId,
        status: "DRAFT",
        draftedById: actor.usuarioId,
        totalRevenue: revenue,
        totalExpense: expense,
    }).returning();
    const createdForecasts = await tx.insert(planningForecasts).values(revenueForecasts.map((r) => ({
            annualBudgetLawId: loa.id,
            code: requireText(r.code, "Código da previsão de receita"),
            name: requireText(r.name, "Nome da previsão de receita"),
            estimatedValue: requirePositiveMoney(r.estimatedValue, "Valor previsto da receita"),
          }))).returning();
    const createdFixations = await tx.insert(planningFixations).values(expenseFixations.map((e) => ({
            annualBudgetLawId: loa.id,
            code: requireText(e.code, "Código da fixação de despesa"),
            name: requireText(e.name, "Nome da fixação de despesa"),
            fixedValue: requirePositiveMoney(e.fixedValue, "Valor fixado da despesa"),
          }))).returning();

    await audit(tx, actor, "CREATE", "AnnualBudgetLaw", loa.id, { lawNumber: loa.lawNumber }, input.financialYearId);
    return { ...loa, revenueForecasts: createdForecasts, expenseFixations: createdFixations };
  });
}

export async function transitionPlanningLegalWorkflow(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { entityType: PlanningEntityType; entityId: string; stage: Exclude<LegalWorkflowStatus, "DRAFT">; legalEvidence?: LegalEvidenceInput; publication?: PublicationInput },
) {
  return withDatabaseTransaction(db, async (tx) => {
    const record = await findFinanceLegacyPiece(tx, input.entityType, input.entityId);
    if (!record) throw new FinanceError(`${input.entityType} não encontrado.`);
    if (await isFinanceLegacyPieceAdopted(tx, input.entityType, record.id)) {
      throw new FinanceError("Esta peça pertence ao Planejamento e Orçamento. Utilize a jornada da entidade responsável para a tramitação legal.");
    }

    const expected: Record<Exclude<LegalWorkflowStatus, "DRAFT">, LegalWorkflowStatus> = {
      SUBMITTED: "DRAFT",
      APPROVED: "SUBMITTED",
      SANCTIONED: "APPROVED",
      PUBLISHED: "SANCTIONED",
    };
    assertWorkflowStatus(record.status, expected[input.stage], input.entityType);
    assertActorIsDistinct(actor, [record.draftedById, record.submittedById, record.approvedById, record.sanctionedById]);

    const now = new Date();
    if (input.stage === "SANCTIONED") {
      if (!input.legalEvidence) throw new FinanceError("A sanção exige os dados do ato legal e documento GED.");
      await validateLegalEvidence(tx, input.legalEvidence);
    }
    if (input.stage === "PUBLISHED") {
      if (!input.publication) throw new FinanceError("A publicação exige data e referência oficial.");
      validatePublication(input.publication);
    }

    const data = input.stage === "SUBMITTED"
      ? { status: "SUBMITTED", submittedById: actor.usuarioId, submittedAt: now }
      : input.stage === "APPROVED"
        ? { status: "APPROVED", approvedById: actor.usuarioId, approvedAt: now }
        : input.stage === "SANCTIONED"
          ? { status: "SANCTIONED", sanctionedById: actor.usuarioId, sanctionedAt: now, legalActNumber: input.legalEvidence!.legalActNumber.trim(), legalActDate: input.legalEvidence!.legalActDate, legalDocumentId: input.legalEvidence!.legalDocumentId }
          : { status: "PUBLISHED", publishedById: actor.usuarioId, publishedAt: now, publicationDate: input.publication!.publicationDate, publicationReference: input.publication!.publicationReference.trim() };

    const [updated] = input.entityType === "PPA"
      ? await tx.update(planningMultiYearPlans).set(data).where(eq(planningMultiYearPlans.id, record.id)).returning()
      : input.entityType === "LDO"
        ? await tx.update(planningGuidelines).set(data).where(eq(planningGuidelines.id, record.id)).returning()
        : await tx.update(planningBudgetLaws).set(data).where(eq(planningBudgetLaws.id, record.id)).returning();
    if (!updated) throw new FinanceError(`${input.entityType} não encontrado.`);
    const financialYearId = "financialYearId" in record && typeof record.financialYearId === "string" ? record.financialYearId : undefined;
    await audit(tx, actor, input.stage, input.entityType, record.id, { stage: input.stage }, financialYearId);
    return updated;
  });
}

export async function submitMultiYearPlan(db: DatabaseConnection, actor: FinanceActor, id: string) {
  return transitionPlanningLegalWorkflow(db, actor, { entityType: "PPA", entityId: id, stage: "SUBMITTED" });
}
export async function approveMultiYearPlan(db: DatabaseConnection, actor: FinanceActor, id: string) {
  return transitionPlanningLegalWorkflow(db, actor, { entityType: "PPA", entityId: id, stage: "APPROVED" });
}
export async function sanctionMultiYearPlan(db: DatabaseConnection, actor: FinanceActor, id: string, legalEvidence: LegalEvidenceInput) {
  return transitionPlanningLegalWorkflow(db, actor, { entityType: "PPA", entityId: id, stage: "SANCTIONED", legalEvidence });
}
export async function publishMultiYearPlan(db: DatabaseConnection, actor: FinanceActor, id: string, publication: PublicationInput) {
  return transitionPlanningLegalWorkflow(db, actor, { entityType: "PPA", entityId: id, stage: "PUBLISHED", publication });
}

export async function submitBudgetGuideline(db: DatabaseConnection, actor: FinanceActor, id: string) {
  return transitionPlanningLegalWorkflow(db, actor, { entityType: "LDO", entityId: id, stage: "SUBMITTED" });
}
export async function approveBudgetGuideline(db: DatabaseConnection, actor: FinanceActor, id: string) {
  return transitionPlanningLegalWorkflow(db, actor, { entityType: "LDO", entityId: id, stage: "APPROVED" });
}
export async function sanctionBudgetGuideline(db: DatabaseConnection, actor: FinanceActor, id: string, legalEvidence: LegalEvidenceInput) {
  return transitionPlanningLegalWorkflow(db, actor, { entityType: "LDO", entityId: id, stage: "SANCTIONED", legalEvidence });
}
export async function publishBudgetGuideline(db: DatabaseConnection, actor: FinanceActor, id: string, publication: PublicationInput) {
  return transitionPlanningLegalWorkflow(db, actor, { entityType: "LDO", entityId: id, stage: "PUBLISHED", publication });
}

export async function submitAnnualBudgetLaw(db: DatabaseConnection, actor: FinanceActor, id: string) {
  return transitionPlanningLegalWorkflow(db, actor, { entityType: "LOA", entityId: id, stage: "SUBMITTED" });
}
export async function approveAnnualBudgetLaw(db: DatabaseConnection, actor: FinanceActor, id: string) {
  return transitionPlanningLegalWorkflow(db, actor, { entityType: "LOA", entityId: id, stage: "APPROVED" });
}
export async function sanctionAnnualBudgetLaw(db: DatabaseConnection, actor: FinanceActor, id: string, legalEvidence: LegalEvidenceInput) {
  return transitionPlanningLegalWorkflow(db, actor, { entityType: "LOA", entityId: id, stage: "SANCTIONED", legalEvidence });
}
export async function publishAnnualBudgetLaw(db: DatabaseConnection, actor: FinanceActor, id: string, publication: PublicationInput) {
  return transitionPlanningLegalWorkflow(db, actor, { entityType: "LOA", entityId: id, stage: "PUBLISHED", publication });
}

export async function createBudgetAppropriationFromFixation(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: {
    annualBudgetExpenseFixationId: string;
    programPPAId: string;
    actionPPAId: string;
    code: string;
    budgetUnitId: string;
    expenseNatureId: string;
    resourceSourceId: string;
    initialValue: number;
  },
) {
  const code = requireText(input.code, "Codigo da dotacao");
  if (!input.annualBudgetExpenseFixationId) throw new FinanceError("Selecione a fixacao de despesa da LOA.");
  if (!input.programPPAId) throw new FinanceError("Selecione o programa do PPA.");
  if (!input.actionPPAId) throw new FinanceError("Selecione a acao do PPA.");
  if (!input.budgetUnitId) throw new FinanceError("Selecione a unidade orcamentaria.");
  if (!input.expenseNatureId) throw new FinanceError("Selecione a natureza de despesa.");
  if (!input.resourceSourceId) throw new FinanceError("Selecione a fonte de recursos.");
  const initialValue = requirePositiveMoney(input.initialValue, "Valor inicial da dotacao");
  assertBudgetUnitPermission(actor, input.budgetUnitId);

  return withDatabaseTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT id FROM "AnnualBudgetExpenseFixation" WHERE id = ${input.annualBudgetExpenseFixationId} FOR UPDATE`);
    const fixation = await findFinanceLegacyFixation(tx, input.annualBudgetExpenseFixationId);
    if (!fixation) throw new FinanceError("Fixacao de despesa da LOA nao encontrada.");
    await assertLegacyPlanningOwner(tx, "LOA", fixation.annualBudgetLawId);
    assertPlanningEditable(fixation.annualBudgetLaw.status, "LOA");

    await assertFinancialYearPlanningEligible(tx, fixation.annualBudgetLaw.financialYearId);
    if (!fixation.annualBudgetLaw.budgetGuideline?.multiYearPlanId) {
      throw new FinanceError("A LOA da fixacao deve estar vinculada a uma LDO e a um PPA.");
    }
    const [budgetUnit, expenseNature, resourceSource, program, action, existing] = await Promise.all([
      findFinanceLegacyRegistry(tx, "BudgetUnit", input.budgetUnitId),
      findFinanceLegacyRegistry(tx, "ExpenseNature", input.expenseNatureId),
      findFinanceLegacyRegistry(tx, "ResourceSource", input.resourceSourceId),
      findFinanceLegacyProgram(tx, input.programPPAId),
      findFinanceLegacyAction(tx, input.actionPPAId),
      listFinanceLegacyAppropriations(tx, { fixationId: fixation.id }),
    ]);
    if (!budgetUnit) throw new FinanceError("Unidade orcamentaria nao encontrada.");
    if (!expenseNature) throw new FinanceError("Natureza de despesa nao encontrada.");
    if (!resourceSource) throw new FinanceError("Fonte de recursos nao encontrada.");
    if (!program || program.multiYearPlanId !== fixation.annualBudgetLaw.budgetGuideline.multiYearPlanId) {
      throw new FinanceError("O programa deve pertencer ao PPA vinculado a LOA.");
    }
    if (!action || action.programId !== program.id) throw new FinanceError("A acao selecionada deve pertencer ao programa do PPA.");

    const allocated = existing.reduce(
      (total, appropriation) => total.plus(appropriation.initialValueDecimal ?? appropriation.initialValue),
      new Decimal(0),
    );
    if (allocated.plus(initialValue).greaterThan(fixation.fixedValue)) {
      throw new FinanceError("O valor da dotacao excede o saldo disponivel da fixacao de despesa da LOA.");
    }

    const [appropriation] = await tx.insert(budgetAppropriations).values({
        code,
        financialYearId: fixation.annualBudgetLaw.financialYearId,
        budgetUnitId: budgetUnit.id,
        expenseNatureId: expenseNature.id,
        resourceSourceId: resourceSource.id,
        annualBudgetExpenseFixationId: fixation.id,
        programPPAId: program.id,
        actionPPAId: action.id,
        initialValue: Number(initialValue.toString()),
        initialValueDecimal: initialValue,
        updatedValue: Number(initialValue.toString()),
        updatedValueDecimal: initialValue,
        committedValue: 0,
        committedValueDecimal: new Decimal(0),
    }).returning();
    await audit(
      tx,
      actor,
      "CREATE",
      "BudgetAppropriation",
      appropriation.id,
      { code: appropriation.code, annualBudgetExpenseFixationId: fixation.id, programPPAId: program.id, actionPPAId: action.id, initialValue: initialValue.toFixed(2) },
      appropriation.financialYearId,
      appropriation.budgetUnitId,
    );
    return appropriation;
  });
}

export async function saveMonthlyDisbursementSchedule(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { annualBudgetLawId: string; month: number; budgetUnitId: string; limitValue: number },
) {
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
    throw new FinanceError("O mes do CMD deve estar entre 1 e 12.");
  }
  if (!input.annualBudgetLawId) throw new FinanceError("Selecione a LOA.");
  if (!input.budgetUnitId) throw new FinanceError("Selecione a unidade orcamentaria.");
  const limitValue = requireNonNegativeMoney(input.limitValue, "Limite mensal de desembolso");
  assertBudgetUnitPermission(actor, input.budgetUnitId);

  return withDatabaseTransaction(db, async (tx) => {
    const [law, budgetUnit] = await Promise.all([
      findFinanceLegacyLaw(tx, input.annualBudgetLawId),
      findFinanceLegacyRegistry(tx, "BudgetUnit", input.budgetUnitId),
    ]);
    if (!law) throw new FinanceError("LOA nao encontrada.");
    await assertLegacyPlanningOwner(tx, "LOA", law.id);
    assertPlanningEditable(law.status, "LOA");
    if (!budgetUnit) throw new FinanceError("Unidade orcamentaria nao encontrada.");
    await assertFinancialYearPlanningEligible(tx, law.financialYearId);
    const [schedule] = await tx.insert(financeCmdSchedules).values({ annualBudgetLawId: law.id, month: input.month, budgetUnitId: budgetUnit.id, limitValue }).onConflictDoUpdate({ target: [financeCmdSchedules.annualBudgetLawId, financeCmdSchedules.month, financeCmdSchedules.budgetUnitId], set: { limitValue } }).returning();
    await audit(tx, actor, "UPSERT", "MonthlyDisbursementSchedule", schedule.id, { annualBudgetLawId: law.id, month: input.month, limitValue: limitValue.toFixed(2) }, law.financialYearId, budgetUnit.id);
    return schedule;
  });
}

export async function saveBimonthlyRevenueTarget(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: { annualBudgetLawId: string; bimonth: number; targetValue: number },
) {
  if (!Number.isInteger(input.bimonth) || input.bimonth < 1 || input.bimonth > 6) {
    throw new FinanceError("O bimestre da MBA deve estar entre 1 e 6.");
  }
  if (!input.annualBudgetLawId) throw new FinanceError("Selecione a LOA.");
  const targetValue = requireNonNegativeMoney(input.targetValue, "Meta bimestral de arrecadacao");

  return withDatabaseTransaction(db, async (tx) => {
    const law = await findFinanceLegacyLaw(tx, input.annualBudgetLawId);
    if (!law) throw new FinanceError("LOA nao encontrada.");
    await assertLegacyPlanningOwner(tx, "LOA", law.id);
    assertPlanningEditable(law.status, "LOA");
    await assertFinancialYearPlanningEligible(tx, law.financialYearId);
    const [target] = await tx.insert(financeMbaTargets).values({ annualBudgetLawId: law.id, bimonth: input.bimonth, targetValue }).onConflictDoUpdate({ target: [financeMbaTargets.annualBudgetLawId, financeMbaTargets.bimonth], set: { targetValue } }).returning();
    await audit(tx, actor, "UPSERT", "BimonthlyRevenueTarget", target.id, { annualBudgetLawId: law.id, bimonth: input.bimonth, targetValue: targetValue.toFixed(2) }, law.financialYearId);
    return target;
  });
}

// --- Créditos Adicionais com segregação de funções ---

export async function createCreditRequest(
  db: DatabaseConnection,
  actor: FinanceActor,
  input: {
    number: string;
    financialYearId: string;
    type: CreditType;
    lawNumber?: string;
    legalActNumber: string;
    legalActDate: Date;
    legalDocumentId: string;
    fundingSourceId: string;
    justification: string;
    items: { appropriationId: string; type: CreditItemType; value: number }[];
  },
) {
  const number = requireText(input.number, "Número do crédito");
  const justification = requireText(input.justification, "Justificativa do crédito");
  const legalActNumber = requireText(input.legalActNumber, "Número do ato legal");
  validateDate(input.legalActDate, "Data do ato legal");
  if (!input.fundingSourceId) throw new FinanceError("Fonte de recursos do crédito é obrigatória.");
  if (!creditTypes.includes(input.type)) throw new FinanceError("Tipo de crédito adicional inválido.");
  if (input.items.length === 0) {
    throw new FinanceError("Informe ao menos um item de acréscimo ou anulação na solicitação de crédito.");
  }

  for (const item of input.items) {
    if (!item.appropriationId) throw new FinanceError("Selecione a dotação de cada item do crédito.");
    if (!creditItemTypes.includes(item.type)) throw new FinanceError("Tipo de item do crédito inválido.");
    requirePositiveMoney(item.value, "Valor do item do crédito");
  }

  const acrescimo = input.items
    .filter((i) => i.type === "Acréscimo")
    .reduce((sum, i) => sum.plus(requirePositiveMoney(i.value, "Valor do item do crédito")), new Decimal(0));
  const anulacao = input.items
    .filter((i) => i.type === "Anulação")
    .reduce((sum, i) => sum.plus(requirePositiveMoney(i.value, "Valor do item do crédito")), new Decimal(0));

  if (acrescimo.lessThanOrEqualTo(0)) {
    throw new FinanceError("O crédito adicional deve possuir ao menos um acréscimo.");
  }

  if (input.type === "Remanejamento" || input.type === "Transposição" || input.type === "Transferência") {
    if (!acrescimo.equals(anulacao)) {
      throw new FinanceError(`Para ${input.type}, o valor total de acréscimo deve ser exatamente igual ao de anulação.`);
    }
  }

  return withDatabaseTransaction(db, async (tx) => {
    await assertFinancialYearOpen(tx, input.financialYearId, new Date());
    await validateLegalEvidence(tx, { legalActNumber, legalActDate: input.legalActDate, legalDocumentId: input.legalDocumentId });
    const fundingSource = await findFinanceLegacyRegistry(tx, "ResourceSource", input.fundingSourceId);
    if (!fundingSource) throw new FinanceError("Fonte de recursos do crédito não encontrada.");

    const appropriations = await listFinanceLegacyAppropriations(tx, { ids: input.items.map(item => item.appropriationId) });
    if (appropriations.length !== new Set(input.items.map((item) => item.appropriationId)).size) {
      throw new FinanceError("Uma ou mais dotações informadas não foram encontradas.");
    }
    for (const appropriation of appropriations) {
      if (appropriation.financialYearId !== input.financialYearId) {
        throw new FinanceError("Todas as dotações do crédito devem pertencer ao exercício financeiro selecionado.");
      }
      assertBudgetUnitPermission(actor, appropriation.budgetUnitId);
    }

    const existing = await findFinanceCredit(tx, { number });
    if (existing) throw new FinanceError(`Já existe uma solicitação de crédito com o número ${number}.`);

    const [credit] = await tx.insert(financeCreditRequests).values({
        number,
        financialYearId: input.financialYearId,
        type: input.type,
        lawNumber: input.lawNumber?.trim(),
        legalActNumber,
        legalActDate: input.legalActDate,
        legalDocumentId: input.legalDocumentId,
        fundingSourceId: fundingSource.id,
        justification,
        totalValue: acrescimo,
        status: "DRAFT",
        requestedById: actor.usuarioId,
    }).returning();
    const items = await tx.insert(financeCreditItems).values(input.items.map((item) => ({
            creditRequestId: credit.id,
            appropriationId: item.appropriationId,
            type: item.type,
            value: requirePositiveMoney(item.value, "Valor do item do crédito"),
          }))).returning();

    await audit(tx, actor, "CREATE", "CreditRequest", credit.id, { number: credit.number, type: credit.type }, input.financialYearId);
    return { ...credit, items };
  });
}

export async function approveCreditRequest(
  db: DatabaseConnection,
  actor: FinanceActor,
  creditRequestId: string,
) {
  return withDatabaseTransaction(db, async (tx) => {
    await lockCreditRequest(tx, creditRequestId);
    const credit = await readFinanceCreditItems(tx, creditRequestId);
    if (!credit) throw new FinanceError("Solicitação de crédito adicional não encontrada.");
    if (credit.status !== "SUBMITTED") throw new FinanceError(`A solicitação de crédito deve estar em SUBMITTED, e está em ${credit.status}.`);
    await assertFinancialYearOpen(tx, credit.financialYearId, new Date());
    for (const item of credit.items) {
      if (item.appropriation.financialYearId !== credit.financialYearId) {
        throw new FinanceError("A solicitação possui dotação de exercício divergente e não pode ser aprovada.");
      }
      assertBudgetUnitPermission(actor, item.appropriation.budgetUnitId);
    }

    // Regra de Segregação: O solicitante NÃO pode aprovar a própria solicitação.
    assertActorIsDistinct(actor, [credit.requestedById, credit.submittedById]);

    const approved = await tx.update(financeCreditRequests).set({ status: "APPROVED", approvedById: actor.usuarioId, approvedAt: new Date() }).where(and(eq(financeCreditRequests.id, creditRequestId), eq(financeCreditRequests.status, "SUBMITTED"))).returning();
    if (approved.length !== 1) throw new FinanceError("A solicitação foi alterada por outro usuário. Atualize a página e tente novamente.");
    const updated = approved[0];

    await audit(tx, actor, "APPROVE", "CreditRequest", credit.id, { approvedBy: actor.usuarioId }, credit.financialYearId);
    return updated;
  });
}

export async function submitCreditRequest(db: DatabaseConnection, actor: FinanceActor, creditRequestId: string) {
  return withDatabaseTransaction(db, async (tx) => {
    await lockCreditRequest(tx, creditRequestId);
    const credit = await findFinanceCredit(tx, { id: creditRequestId });
    if (!credit) throw new FinanceError("Solicitação de crédito adicional não encontrada.");
    assertWorkflowStatus(credit.status, "DRAFT", "Solicitação de crédito");
    assertActorIsDistinct(actor, [credit.requestedById]);
    await assertFinancialYearOpen(tx, credit.financialYearId, new Date());
    if (!credit.fundingSourceId || !credit.legalActNumber || !credit.legalActDate || !credit.legalDocumentId) {
      throw new FinanceError("O crédito exige ato legal, documento GED e fonte de recursos antes da submissão.");
    }
    await validateLegalEvidence(tx, { legalActNumber: credit.legalActNumber, legalActDate: credit.legalActDate, legalDocumentId: credit.legalDocumentId });
    const [submitted] = await tx.update(financeCreditRequests).set({ status: "SUBMITTED", submittedById: actor.usuarioId, submittedAt: new Date() }).where(eq(financeCreditRequests.id, credit.id)).returning();
    await audit(tx, actor, "SUBMIT", "CreditRequest", credit.id, {}, credit.financialYearId);
    return submitted;
  });
}

export async function sanctionCreditRequest(db: DatabaseConnection, actor: FinanceActor, creditRequestId: string) {
  return withDatabaseTransaction(db, async (tx) => {
    await lockCreditRequest(tx, creditRequestId);
    const credit = await findFinanceCredit(tx, { id: creditRequestId });
    if (!credit) throw new FinanceError("Solicitação de crédito adicional não encontrada.");
    assertWorkflowStatus(credit.status, "APPROVED", "Solicitação de crédito");
    assertActorIsDistinct(actor, [credit.requestedById, credit.submittedById, credit.approvedById]);
    if (!credit.legalActNumber || !credit.legalActDate || !credit.legalDocumentId) {
      throw new FinanceError("A sanção exige ato legal e documento GED.");
    }
    await validateLegalEvidence(tx, { legalActNumber: credit.legalActNumber, legalActDate: credit.legalActDate, legalDocumentId: credit.legalDocumentId });
    const [sanctioned] = await tx.update(financeCreditRequests).set({ status: "SANCTIONED", sanctionedById: actor.usuarioId, sanctionedAt: new Date() }).where(eq(financeCreditRequests.id, credit.id)).returning();
    await audit(tx, actor, "SANCTION", "CreditRequest", credit.id, {}, credit.financialYearId);
    return sanctioned;
  });
}

export async function publishCreditRequest(
  db: DatabaseConnection,
  actor: FinanceActor,
  creditRequestId: string,
  publication: PublicationInput,
) {
  validatePublication(publication);
  return withDatabaseTransaction(db, async (tx) => {
    await lockCreditRequest(tx, creditRequestId);
    const credit = await findFinanceCredit(tx, { id: creditRequestId });
    if (!credit) throw new FinanceError("Solicitação de crédito adicional não encontrada.");
    assertWorkflowStatus(credit.status, "SANCTIONED", "Solicitação de crédito");
    assertActorIsDistinct(actor, [credit.requestedById, credit.submittedById, credit.approvedById, credit.sanctionedById]);
    const [published] = await tx.update(financeCreditRequests).set({ status: "PUBLISHED", publishedById: actor.usuarioId, publishedAt: new Date(), publicationDate: publication.publicationDate, publicationReference: publication.publicationReference.trim() }).where(eq(financeCreditRequests.id, credit.id)).returning();
    await audit(tx, actor, "PUBLISH", "CreditRequest", credit.id, { publicationReference: published.publicationReference! }, credit.financialYearId);
    return published;
  });
}

export async function executeCreditRequest(
  db: DatabaseConnection,
  actor: FinanceActor,
  creditRequestId: string,
) {
  return withDatabaseTransaction(db, async (tx) => {
    await lockCreditRequest(tx, creditRequestId);
    const credit = await readFinanceCreditItems(tx, creditRequestId);
    if (!credit) throw new FinanceError("Solicitação de crédito adicional não encontrada.");
    if (credit.status !== "PUBLISHED" || !credit.publicationDate) throw new FinanceError("A solicitação de crédito deve estar publicada para ser efetivada.");
    if (credit.executedAt) throw new FinanceError("A solicitação de crédito já foi efetivada.");
    assertActorIsDistinct(actor, [credit.requestedById, credit.submittedById, credit.approvedById, credit.sanctionedById, credit.publishedById]);
    await assertFinancialYearOpen(tx, credit.financialYearId, new Date());

    const increaseMovementType: Record<CreditType, string> = {
      Suplementar: "Suplementação",
      Especial: "Especial",
      Extraordinário: "Extraordinário",
      Remanejamento: "Remanejamento",
      Transposição: "Transposição",
      Transferência: "Transferência",
    };

    for (const item of [...credit.items].sort((a, b) => a.appropriationId.localeCompare(b.appropriationId))) {
      if (item.appropriation.financialYearId !== credit.financialYearId) {
        throw new FinanceError("A solicitação possui dotação de exercício divergente e não pode ser efetivada.");
      }
      assertBudgetUnitPermission(actor, item.appropriation.budgetUnitId);
      const movementType = item.type === "Acréscimo" ? increaseMovementType[credit.type as CreditType] : "Anulação";
      await createBudgetMovementInTransaction(tx, actor, {
        date: new Date(),
        type: movementType,
        value: item.value,
        justification: `Crédito Adicional ${credit.type} N.º ${credit.number}: ${credit.justification}`,
        appropriationId: item.appropriationId,
        sourceModule: "PLANEJAMENTO",
        sourceType: "CREDIT_REQUEST",
        sourceId: credit.id,
        eventType: "CREDIT_EXECUTED",
        idempotencyKey: `CREDIT_REQUEST:${credit.id}:${item.id}`,
      });
    }

    const execution = await tx.update(financeCreditRequests).set({ executedById: actor.usuarioId, executedAt: new Date() }).where(and(eq(financeCreditRequests.id, creditRequestId), eq(financeCreditRequests.status, "PUBLISHED"), isNull(financeCreditRequests.executedAt))).returning();
    if (execution.length !== 1) throw new FinanceError("A solicitação foi alterada por outro usuário. Atualize a página e tente novamente.");
    const executed = execution[0];

    await audit(tx, actor, "EXECUTE", "CreditRequest", credit.id, {}, credit.financialYearId);
    return executed;
  });
}

// -----------------------------------------------------------------------------
// Demonstrativo Comparativo da LOA (Original vs Alterações por Créditos)
// -----------------------------------------------------------------------------
export async function generateBudgetChangesComparison(db: DatabaseExecutor, financialYearId: string) {
  const candidates = await db.select({ id: planningBudgetLaws.id }).from(planningBudgetLaws).where(eq(planningBudgetLaws.financialYearId, financialYearId));
  if (candidates.length !== 1) throw new FinanceError("Selecione a peça/entidade na jornada de Planejamento; o exercício não possui uma LOA única para o comparativo legado.");
  if (await isFinanceLegacyPieceAdopted(db, "LOA", candidates[0].id)) throw new FinanceError("Comparativo da peça adotada deve ser emitido pelo Planejamento com entidade, versão e data de corte.");
  const [[loa], credits, appropriations] = await Promise.all([
    listFinanceLawDocuments(db, { financialYearId }),
    listFinanceReportCredits(db, financialYearId),
    listFinanceLegacyAppropriations(db, { financialYearId }),
  ]);
  const creditRequests = credits.filter(credit => credit.status === "PUBLISHED" && credit.executedAt !== null);

  if (!loa) throw new FinanceError("LOA não encontrada para o exercício.");

  const totalFixadoOriginal = Number(loa.totalExpense);
  const totalCreditosAdicionais = Number(creditRequests.reduce((sum, req) => sum.plus(req.items.reduce((value, item) => item.type === "Anulação" ? value.minus(item.value) : value.plus(item.value), new Decimal(0))), new Decimal(0)));
  const totalAtualizado = totalFixadoOriginal + totalCreditosAdicionais;

  const dotacoesComparativo = appropriations.map((app) => {
    const inicial = Number(app.initialValueDecimal ?? app.initialValue);
    const atualizado = Number(app.updatedValueDecimal ?? app.updatedValue);
    const empenhado = Number(app.committedValueDecimal ?? app.committedValue);
    const disponivel = atualizado - empenhado;
    const variacao = atualizado - inicial;

    return {
      code: app.code,
      budgetUnit: `${app.budgetUnit.code} - ${app.budgetUnit.name}`,
      expenseNature: `${app.expenseNature.code} - ${app.expenseNature.name}`,
      valorInicial: inicial,
      valorAtualizado: atualizado,
      variacaoCredito: variacao,
      valorEmpenhado: empenhado,
      valorDisponivel: disponivel,
    };
  });

  return {
    financialYearId,
    lawNumber: loa.lawNumber,
    totalFixadoOriginal,
    totalCreditosAdicionais,
    totalAtualizado,
    variacaoPercentual: totalFixadoOriginal > 0 ? Number(((totalCreditosAdicionais / totalFixadoOriginal) * 100).toFixed(2)) : 0,
    dotacoesComparativo,
  };
}

// -----------------------------------------------------------------------------
// Relatório de Acompanhamento Executivo CMD & MBA
// -----------------------------------------------------------------------------
export async function generateCmdMbaExecutionReport(db: DatabaseExecutor, financialYearId: string) {
  const [laws, units, { commitments, revenues }] = await Promise.all([
    listFinanceLawDocuments(db, { financialYearId }),
    listFinanceReportUnits(db),
    readFinanceCmdMbaFacts(db, financialYearId),
  ]);
  if (!laws.length) throw new FinanceError("LOA não encontrada para o exercício.");
  const cmdSchedules = laws.flatMap(law => law.cmdSchedules), mbaTargets = laws.flatMap(law => law.mbaTargets);

  const unitsMap = new Map(units.map((u) => [u.id, `${u.code} - ${u.name}`]));

  const cmdAcompanhamento = cmdSchedules.map((schedule) => {
    const executado = commitments
      .filter(
        (c) =>
          c.appropriation.budgetUnitId === schedule.budgetUnitId &&
          c.date.getUTCMonth() + 1 === schedule.month,
      )
      .reduce((sum, c) => sum + Number(c.valueDecimal ?? c.value), 0);

    const limite = Number(schedule.limitValue);
    const saldo = limite - executado;
    const estourado = executado > limite;

    return {
      budgetUnit: unitsMap.get(schedule.budgetUnitId) ?? schedule.budgetUnitId,
      month: schedule.month,
      limiteProgramado: limite,
      executado,
      saldoCota: saldo,
      situacao: estourado ? "ALERTA_EXCESSO_CMD" : "DENTRO_DO_LIMITE",
    };
  });

  const mbaAcompanhamento = mbaTargets.map((target) => {
    const startMonth = (target.bimonth - 1) * 2;
    const endMonth = startMonth + 1;

    const arrecadado = revenues
      .filter((r) => {
        const m = (r.collectionDate || new Date()).getUTCMonth();
        return m >= startMonth && m <= endMonth;
      })
      .reduce((sum, r) => sum + Number(r.valueDecimal ?? r.value), 0);

    const meta = Number(target.targetValue);
    const frustracao = Math.max(0, meta - arrecadado);
    const percentualAtingido = meta > 0 ? Number(((arrecadado / meta) * 100).toFixed(2)) : 100;

    return {
      bimonth: target.bimonth,
      metaArrecadacao: meta,
      arrecadadoRealizado: arrecadado,
      frustracaoReceita: frustracao,
      percentualAtingido,
      situacao: percentualAtingido < 90 ? "ALERTA_FRUSTRACAO_RECEITA" : "META_ATINGIDA",
    };
  });

  return {
    financialYearId,
    cmdAcompanhamento,
    mbaAcompanhamento,
  };
}
