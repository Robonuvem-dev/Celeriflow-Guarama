import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { enqueueHrIntegration } from "./workforce-service";
import { resolveContractRevision } from "./contract-timeline";
import { assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";

const decimal = z.string().regex(/^\d{1,12}(?:\.\d{1,6})?$/);
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export const travelAllowancePolicySchema = z.object({ origin: z.enum(["DIARIAS_POC", "DIARIAS_MUNICIPAIS"]), rates: z.object({ DF: decimal, CAPITAL: decimal, INTERIOR: decimal, INTERNACIONAL: decimal }).strict(), minimumDistanceKm: z.number().nonnegative(), rounding: z.enum(["DOWN", "HALF_UP"]), legalReference: z.string().min(3), estimated: z.boolean() }).strict();
const inputSchema = z.object({ requestKey: z.string().min(1).max(120), contractId: z.string().min(1), ruleId: z.string().min(1), budgetUnitId: z.string().min(1).optional(), destination: z.string().trim().min(3).max(300), destinationType: z.enum(["DF", "CAPITAL", "INTERIOR", "INTERNACIONAL"]), departureAt: z.iso.datetime({ offset: true }), returnAt: z.iso.datetime({ offset: true }), distanceKm: decimal, overnight: z.enum(["SIM", "NAO"]), exchangeRate: decimal.default("1"), purpose: z.string().trim().min(10).max(3000), vehiclePlate: z.string().trim().max(20).default("") }).strict();

export function assertTravelAllowanceAccess(payload: Prisma.JsonValue, context?: AppContext, operation: "update" | "issueReports" = "update") {
  const memory = payload as { scope?: string; input?: { budgetUnitId?: string } };
  if (memory.scope !== "PRODUCAO") return;
  if (!context || !canPerformModuleOperation(context.user, "RH", operation) || !memory.input?.budgetUnitId) throw new Error("Diária municipal exige autorização RH e UG definida.");
  assertBudgetUnitAccess(context.user, memory.input.budgetUnitId);
}

export async function assertTravelReportOperationDate(tx: Prisma.TransactionClient, requestId: string, date: string) {
  const reopenings = await tx.hrIntegrationEvent.findMany({ where: { eventType: "DIARIA_PRESTACAO_REABERTA", sourceKey: { startsWith: `DIARIA:REABERTURA:${requestId}:` }, status: "CONCLUIDA" }, select: { payload: true } });
  if (reopenings.some(event => z.object({ input: z.object({ date: z.iso.date() }) }).parse(event.payload).input.date > date)) throw new Error("Operação não pode anteceder a reabertura da prestação da diária.");
}

export function calculateTravelAllowance(rawPolicy: unknown, raw: unknown) {
  const policy = travelAllowancePolicySchema.parse(rawPolicy), input = inputSchema.parse(raw);
  const hours = new Prisma.Decimal(new Date(input.returnAt).getTime() - new Date(input.departureAt).getTime()).div(3600000);
  if (hours.lte(0) || hours.gt(24 * 365)) throw new Error("Período de viagem inválido ou superior a um ano.");
  const distanceEligible = new Prisma.Decimal(input.distanceKm).gt(policy.minimumDistanceKm);
  const full = hours.div(24).floor(), remainder = hours.sub(full.mul(24));
  const partial = remainder.gt(12) && input.overnight === "SIM" ? new Prisma.Decimal(1) : remainder.gt(8) ? new Prisma.Decimal("0.5") : new Prisma.Decimal(0);
  const quantity = distanceEligible ? full.add(partial) : new Prisma.Decimal(0);
  const unitValue = new Prisma.Decimal(policy.rates[input.destinationType]);
  const exchange = input.destinationType === "INTERNACIONAL" ? new Prisma.Decimal(input.exchangeRate) : new Prisma.Decimal(1);
  if (exchange.lte(0)) throw new Error("Câmbio deve ser positivo.");
  const mode = policy.rounding === "DOWN" ? Prisma.Decimal.ROUND_DOWN : Prisma.Decimal.ROUND_HALF_UP;
  return { hours: hours.toFixed(4), fullDays: full.toString(), remainderHours: remainder.toFixed(4), distanceEligible, quantity: quantity.toString(), unitValue: unitValue.toFixed(2), currency: input.destinationType === "INTERNACIONAL" ? "USD" : "BRL", exchangeRate: exchange.toString(), originalAmount: unitValue.mul(quantity).toDecimalPlaces(2, mode).toFixed(2), amountBRL: unitValue.mul(quantity).mul(exchange).toDecimalPlaces(2, mode).toFixed(2), rounding: policy.rounding, estimated: policy.estimated };
}

export async function requestTravelAllowance(db: PrismaClient, actorId: string, raw: unknown, context?: AppContext) {
  const input = inputSchema.parse(raw);
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:DIARIA:${input.requestKey}`}))`;
    const previous = await tx.hrPortalRequest.findFirst({ where: { requestKey: { in: [`DIARIA_POC:${input.requestKey}`, `DIARIA:${input.requestKey}`] } } });
    if (previous) {
      assertTravelAllowanceAccess(previous.payload, context);
      const stored = (previous.payload as { input: typeof input }).input;
      if (Object.entries(input).some(([key, value]) => stored[key as keyof typeof input] !== value)) throw new Error("Solicitação repetida com dados diferentes.");
      return previous;
    }
    const rule = await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.ruleId }, include: { ruleSet: true } });
    const policy = travelAllowancePolicySchema.parse(rule.value);
    const start = new Date(input.departureAt), end = new Date(input.returnAt);
    const stored = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: input.contractId }, include: { revisions: true, employee: { include: { person: true } } } });
    const contract = resolveContractRevision(stored, stored.revisions, { start, end: start }).contract;
    const regime = await tx.hrEmploymentRegime.findUniqueOrThrow({ where: { id: contract.regimeId } });
    const municipal = policy.origin === "DIARIAS_MUNICIPAIS";
    const scope = municipal ? "PRODUCAO" : "DEMONSTRACAO";
    if (!rule.isActive || rule.ruleSet.isDemo === municipal || rule.ruleSet.scope !== scope || rule.ruleSet.status !== "ATIVA" || !regime.isActive || regime.ruleSetId !== rule.ruleSetId || rule.ruleSet.effectiveFrom > start || (rule.ruleSet.effectiveUntil && rule.ruleSet.effectiveUntil < end) || !stored.employee.isActive || !stored.employee.personId || contract.status !== "ATIVO" || start < contract.admittedAt || (contract.endsAt && end > contract.endsAt)) throw new Error("Diária exige contrato e política vigentes em toda a viagem, no mesmo escopo.");
    if (municipal) {
      assertTravelAllowanceAccess(json({ scope, input }) as Prisma.JsonValue, context);
      const unit = await tx.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId: input.budgetUnitId! } });
      const center = contract.costCenterId ? await tx.costCenter.findUniqueOrThrow({ where: { id: contract.costCenterId } }) : null;
      if (!unit.governmentEntityId || !center?.isActive || center.governmentEntityId !== unit.governmentEntityId) throw new Error("Centro de custo do vínculo deve pertencer ao ente da UG da diária.");
    }
    const assessment = calculateTravelAllowance(policy, input);
    const request = await tx.hrPortalRequest.create({ data: { requestKey: `${municipal ? "DIARIA" : "DIARIA_POC"}:${input.requestKey}`, employeeId: stored.employeeId, actorId, kind: municipal ? "DIARIA" : "DIARIA_POC", payload: json({ input, policy, assessment, contract, scope }) } });
    await enqueueHrIntegration(tx, { sourceKey: `DIARIA:SOLICITACAO:${request.id}`, domain: "AUDITORIA", environment: scope, eventType: "DIARIA_SOLICITADA", payload: { requestId: request.id, actorId, assessment } });
    return request;
  }, { timeout: 60000 });
}

export async function decideTravelAllowance(db: PrismaClient, actorId: string, raw: unknown, context?: AppContext) {
  const input = z.object({ requestId: z.string().min(1), status: z.enum(["DEFERIDA", "INDEFERIDA"]), decision: z.string().trim().min(10).max(3000), authorizationNumber: z.string().trim().min(1).max(100) }).strict().parse(raw);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.hrPortalRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    if (!["DIARIA", "DIARIA_POC"].includes(request.kind)) throw new Error("Selecione uma diária.");
    assertTravelAllowanceAccess(request.payload, context);
    if (await tx.hrIntegrationEvent.findUnique({ where: { sourceKey: `DIARIA:PROCESSO:${request.id}` } })) throw new Error("A decisão desta diária deve ocorrer no roteiro do processo vinculado.");
    if (request.kind === "DIARIA") {
      const unit = (request.payload as { input: { budgetUnitId: string } }).input.budgetUnitId;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`DIARIA:AUTORIZACAO:${unit}:${input.authorizationNumber}`}))`;
      const duplicate = await tx.hrIntegrationEvent.findFirst({ where: { eventType: "DIARIA_DECIDIDA", environment: "PRODUCAO", AND: [{ payload: { path: ["input", "authorizationNumber"], equals: input.authorizationNumber } }, { payload: { path: ["requestPayload", "input", "budgetUnitId"], equals: unit } }] } });
      if (duplicate && duplicate.sourceKey !== `DIARIA:DECISAO:${request.id}`) throw new Error("Número de autorização já utilizado nesta UG.");
    }
    const key = `DIARIA:DECISAO:${request.id}`;
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey: key } });
    if (previous) {
      const stored = (previous.payload as { input: typeof input }).input;
      if (Object.entries(input).some(([key, value]) => stored[key as keyof typeof input] !== value)) throw new Error("Diária já decidida com outra autorização/fundamento.");
      return request;
    }
    if (request.status !== "EM_ANALISE") throw new Error("Diária já decidida.");
    const updated = await tx.hrPortalRequest.update({ where: { id: request.id }, data: { status: input.status, decision: input.decision, decidedBy: actorId, decidedAt: new Date() } });
    await enqueueHrIntegration(tx, { sourceKey: key, domain: "AUDITORIA", environment: request.kind === "DIARIA" ? "PRODUCAO" : "DEMONSTRACAO", eventType: "DIARIA_DECIDIDA", payload: { input, actorId, requestPayload: request.payload } });
    return updated;
  });
}

export async function accountForTravelAllowance(db: PrismaClient, actorId: string, raw: unknown, context?: AppContext) {
  const input = z.object({ requestId: z.string().min(1), activities: z.string().trim().min(10).max(4000), returnedAmount: decimal, reportDate: z.iso.date(), documentId: z.string().optional(), restitutionRevenueId: z.string().optional() }).strict().parse(raw);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.hrPortalRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    if (!["DIARIA", "DIARIA_POC"].includes(request.kind) || request.status !== "DEFERIDA") throw new Error("Prestação exige diária autorizada.");
    assertTravelAllowanceAccess(request.payload, context);
    const memory = request.payload as { input: z.infer<typeof inputSchema>; assessment: ReturnType<typeof calculateTravelAllowance> };
    await assertTravelReportOperationDate(tx, request.id, input.reportDate);
    if (input.reportDate < new Date(memory.input.returnAt).toISOString().slice(0, 10) || new Prisma.Decimal(input.returnedAmount).gt(memory.assessment.amountBRL)) throw new Error("Data/valor de restituição incompatíveis com a viagem.");
    const sourceKey = `DIARIA:PRESTACAO:${request.id}`;
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
    if (previous) {
      const stored = (previous.payload as { input: typeof input }).input;
      if (Object.entries(input).some(([key, value]) => stored[key as keyof typeof input] !== value)) throw new Error("Prestação já registrada com outros valores/atividades.");
    }
    const paymentIds: string[] = [];
    if (request.kind === "DIARIA") {
      const document = await tx.document.findUniqueOrThrow({ where: { id: input.documentId || "" } });
      if (document.status !== "Válido") throw new Error("Relatório da viagem exige documento GED válido.");
      const corrections = await tx.hrIntegrationEvent.findMany({ where: { eventType: { in: ["DIARIA_RESTITUICAO_DESPESA", "DIARIA_RESTITUICAO_DESPESA_ESTORNADA"] }, OR: [{ payload: { path: ["input", "requestId"], equals: request.id } }, { payload: { path: ["requestId"], equals: request.id } }] } });
      const correctionIds = corrections.map(event => z.object({ correctionPaymentId: z.string() }).parse(event.payload).correctionPaymentId);
      const payments = await tx.payment.findMany({ where: { id: { notIn: correctionIds }, status: "Paga", commitment: { reservation: { expense: { sourceModule: "RH", sourceType: "TRAVEL_ALLOWANCE", sourceId: request.id } } } }, include: { commitment: { include: { appropriation: { include: { financialYear: true } } } } }, orderBy: { id: "asc" } });
      const unit = memory.input.budgetUnitId!;
      for (const payment of payments) {
        await tx.$queryRaw`SELECT id FROM "Payment" WHERE id=${payment.id} FOR UPDATE`;
        const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
        if (current.status !== "Paga" || payment.commitment.appropriation.budgetUnitId !== unit || payment.date.toISOString().slice(0, 10) > input.reportDate) throw new Error("Pagamento da diária incompatível com a UG ou data da prestação.");
        paymentIds.push(payment.id);
      }
      const paid = payments.reduce((sum, row) => { if (!row.valueDecimal) throw new Error("Pagamento de diária sem Decimal conciliado."); return sum.plus(row.valueDecimal); }, new Prisma.Decimal(0));
      if (!paid.eq(memory.assessment.amountBRL) || !payments.length) throw new Error("Prestação exige pagamento integral da diária pela execução financeira nativa.");
      const expenses = corrections.filter(event => event.eventType === "DIARIA_RESTITUICAO_DESPESA" && event.status === "CONCLUIDA");
      const revenues = await tx.revenue.findMany({ where: { sourceModule: "RH", sourceType: "TRAVEL_ALLOWANCE_REFUND", sourceId: request.id, stage: "ARRECADADA", reversedAt: null }, include: { treasuryMovement: true, financialYear: true } });
      const actual = revenues.reduce((sum, row) => { if (!row.valueDecimal) throw new Error("Restituição sem Decimal conciliado."); return sum.plus(row.valueDecimal); }, new Prisma.Decimal(0)).plus(expenses.reduce((sum, event) => sum.plus(z.object({ input: z.object({ amount: decimal }) }).parse(event.payload).input.amount), new Prisma.Decimal(0)));
      if (!actual.eq(input.returnedAmount)) throw new Error("Restituição não conciliada: inclua todas as devoluções vigentes da diária.");
      const references = input.restitutionRevenueId?.trim() ? input.restitutionRevenueId.split(",").map(id => id.trim()) : [];
      if (references.some(id => !id) || new Set(references).size !== references.length || references.length !== expenses.length + revenues.length) throw new Error("Referências de restituição ausentes, repetidas ou não conciliadas.");
      for (const event of expenses) {
        if (!references.includes(`DESPESA:${event.id}`)) throw new Error("Informe a referência DESPESA de todas as devoluções do corrente.");
        const position = z.object({ input: z.object({ date: z.iso.date(), amount: decimal }), budgetUnitId: z.string(), governmentEntityId: z.string(), financialYearId: z.string(), treasuryMovementId: z.string() }).parse(event.payload);
        const cash = await tx.treasuryMovement.findUniqueOrThrow({ where: { id: position.treasuryMovementId } });
        if (position.budgetUnitId !== unit || position.input.date > input.reportDate || !payments.some(payment => payment.commitment.appropriation.financialYearId === position.financialYearId && payment.commitment.appropriation.financialYear.governmentEntityId === position.governmentEntityId) || cash.status !== "Confirmado" || cash.direction !== "Entrada" || !cash.valueDecimal.eq(position.input.amount)) throw new Error("Devolução do corrente não conciliada com UG, exercício, data ou caixa.");
      }
      for (const revenue of revenues) {
        if (!references.includes(revenue.id) || revenue.budgetUnitId !== unit || revenue.date.toISOString().slice(0, 10) > input.reportDate || !revenue.financialYear || payments.some(payment => payment.date > revenue.date || payment.commitment.appropriation.financialYear.year >= revenue.financialYear!.year || payment.commitment.appropriation.financialYear.governmentEntityId !== revenue.financialYear!.governmentEntityId) || !revenue.treasuryMovement || revenue.treasuryMovement.status !== "Confirmado" || revenue.treasuryMovement.direction !== "Entrada" || !revenue.treasuryMovement.valueDecimal.eq(revenue.valueDecimal!)) throw new Error("Receita de restituição exige devolução de exercício anterior do mesmo ente, UG e caixa conciliados.");
      }
    }
    if (previous) return previous;
    return enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: request.kind === "DIARIA" ? "PRODUCAO" : "DEMONSTRACAO", eventType: "DIARIA_PRESTACAO_REGISTRADA", payload: { input, actorId, spentAmount: new Prisma.Decimal(memory.assessment.amountBRL).sub(input.returnedAmount).toFixed(2), financialSettlement: request.kind === "DIARIA", paymentIds } });
  });
}

export async function reopenTravelAllowanceReport(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), requestKey: z.string().min(1).max(120), date: z.iso.date(), documentId: z.string().min(1), reason: z.string().trim().min(10).max(3000) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.hrPortalRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    assertTravelAllowanceAccess(request.payload, context);
    if (request.kind !== "DIARIA" || !canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new Error("Regularização exige diária municipal e autorização financeira de alteração.");
    const key = `DIARIA:REABERTURA:${request.id}:${input.requestKey}`;
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey: key } });
    if (previous) {
      const stored = z.object({ input: z.object({ requestId: z.string(), requestKey: z.string(), date: z.string(), documentId: z.string(), reason: z.string() }) }).parse(previous.payload).input;
      if (context.user.employeeId === request.employeeId || context.user.id === request.actorId) throw new Error("Regularização exige responsável independente do beneficiário/solicitante.");
      if (Object.entries(input).some(([field, value]) => stored[field as keyof typeof stored] !== value)) throw new Error("Regularização já registrada com outros dados.");
      return previous;
    }
    const report = await tx.hrIntegrationEvent.findUniqueOrThrow({ where: { sourceKey: `DIARIA:PRESTACAO:${request.id}` } });
    const memory = z.object({ actorId: z.string(), input: z.object({ reportDate: z.iso.date() }) }).parse(report.payload);
    if (report.status === "ESTORNADA" || request.status !== "DEFERIDA" || input.date < memory.input.reportDate) throw new Error("Prestação indisponível ou data anterior à apresentação.");
    if (context.user.id === memory.actorId || context.user.id === request.actorId || context.user.employeeId === request.employeeId) throw new Error("Regularização exige responsável independente do beneficiário/apresentante.");
    const document = await tx.document.findUniqueOrThrow({ where: { id: input.documentId } });
    if (document.status !== "Válido") throw new Error("Regularização exige parecer GED válido.");
    await tx.hrIntegrationEvent.update({ where: { id: report.id }, data: { sourceKey: `${report.sourceKey}:HISTORICO:${report.id}`, status: "ESTORNADA" } });
    const event = await enqueueHrIntegration(tx, { sourceKey: key, domain: "AUDITORIA", environment: "PRODUCAO", eventType: "DIARIA_PRESTACAO_REABERTA", payload: { input, previousReportId: report.id, actorId: context.user.id } });
    return tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "CONCLUIDA" } });
  }, { timeout: 60000 });
}

export async function buildTravelAllowanceDocument(db: PrismaClient, requestId: string, type: "SOLICITACAO" | "AUTORIZACAO" | "PRESTACAO" | "HISTORICO", context?: AppContext) {
  const request = await db.hrPortalRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (!["DIARIA", "DIARIA_POC"].includes(request.kind)) throw new Error("Documento disponível para diárias.");
  assertTravelAllowanceAccess(request.payload, context, "issueReports");
  const payload = request.payload as { input: z.infer<typeof inputSchema>; policy: z.infer<typeof travelAllowancePolicySchema>; assessment: ReturnType<typeof calculateTravelAllowance>; contract: { registration: string; employee: { name: string; person: { cpf: string } }; workLocation: string } };
  const rows = [["Servidor", payload.contract.employee.name], ["Matrícula", payload.contract.registration], ["CPF", payload.contract.employee.person.cpf], ["Local", payload.contract.workLocation], ["Destino", payload.input.destination], ["Saída", payload.input.departureAt], ["Retorno", payload.input.returnAt], ["Finalidade", payload.input.purpose], ["Placa", payload.input.vehiclePlate], ["Quantidade", payload.assessment.quantity], ["Unitário / moeda", `${payload.assessment.unitValue} ${payload.assessment.currency}`], ["Total BRL", payload.assessment.amountBRL], ["Situação", request.status], ["Fundamento", payload.policy.legalReference]];
  if (type === "AUTORIZACAO") {
    if (request.status !== "DEFERIDA") throw new Error("Autorização exige deferimento da diária.");
    const event = await db.hrIntegrationEvent.findUniqueOrThrow({ where: { sourceKey: `DIARIA:DECISAO:${request.id}` } });
    const decision = (event.payload as { input: { authorizationNumber: string; decision: string } }).input;
    rows.push(["Autorização", decision.authorizationNumber], ["Decisão", decision.decision], ["Responsável ID", request.decidedBy || ""], ["Data da decisão", request.decidedAt?.toISOString() || ""]);
  }
  if (type === "PRESTACAO") {
    const event = await db.hrIntegrationEvent.findUniqueOrThrow({ where: { sourceKey: `DIARIA:PRESTACAO:${request.id}` } });
    const report = event.payload as { input: { activities: string; reportDate: string; returnedAmount: string; documentId?: string; restitutionRevenueId?: string }; spentAmount: string };
    rows.push(["Atividades", report.input.activities], ["Data da prestação", report.input.reportDate], ["Restituição BRL", report.input.returnedAmount], ["Valor utilizado BRL", report.spentAmount], ["Relatório GED", report.input.documentId ?? ""], ["Referências de devolução", report.input.restitutionRevenueId ?? ""]);
  }
  if (type === "HISTORICO") {
    const events = await db.hrIntegrationEvent.findMany({ where: { eventType: { startsWith: "DIARIA_" }, OR: [{ payload: { path: ["requestId"], equals: request.id } }, { payload: { path: ["input", "requestId"], equals: request.id } }] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    for (const event of events) {
      const memory = event.payload as Prisma.JsonObject;
      const input = memory.input && typeof memory.input === "object" && !Array.isArray(memory.input) ? memory.input as Prisma.JsonObject : {};
      rows.push(["Evento", `${event.eventType} · ${event.status} · ${event.id}`], ["Registrado em", event.createdAt.toISOString()], ["Competência", String(input.date ?? input.reportDate ?? memory.date ?? "")], ["Responsável", String(memory.actorId ?? "")], ["Fundamento", String(input.reason ?? input.activities ?? memory.reason ?? "")], ["Documento GED", String(input.documentId ?? memory.documentId ?? "")]);
      if (event.eventType === "DIARIA_RESTITUICAO_DESPESA") rows.push(["Devolução do corrente", `DESPESA:${event.id} · BRL ${String(input.amount ?? "")} · ${event.status}`], ["Pagamento original", String(memory.originalPaymentId ?? "")], ["Partidas da recomposição", JSON.stringify(memory.transactionIds ?? [])]);
      if (event.eventType === "DIARIA_RESTITUICAO_RECEBIDA") rows.push(["Receita de exercício anterior", `${String(memory.revenueId ?? "")} · BRL ${String(input.amount ?? "")} · ${event.status}`]);
      if (event.eventType === "DIARIA_PRESTACAO_REGISTRADA") rows.push(["Valor utilizado BRL", String(memory.spentAmount ?? "")], ["Devoluções na prestação", String(input.restitutionRevenueId ?? "")]);
      if (event.eventType === "DIARIA_PRESTACAO_REABERTA") rows.push(["Prestação preservada", String(memory.previousReportId ?? "")]);
      if (["DIARIA_RESTITUICAO_DESPESA_ESTORNADA", "DIARIA_RESTITUICAO_ESTORNADA"].includes(event.eventType)) rows.push(["Restituição estornada", String(memory.refundId ?? memory.revenueId ?? "")]);
    }
  }
  return { title: `Diárias — ${type}`, headers: ["Campo", "Valor"], rows };
}
