import type { Prisma, PrismaClient } from "@prisma/client";
import { C7OperationError } from "./operations-service";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { createHash } from "node:crypto";

type Actor = { usuarioId: string; allowedBudgetUnitIds?: string[] };
export type ControlChecklistGroup = { name: string; responses: string[]; irregularResponse: string; items: Array<{ number: number; question: string; diagnosticRule?: "BANK_ACCOUNT_SOURCE" }> };
type Checklist = { title: string; category: string; groups: ControlChecklistGroup[] };

async function openPlan(tx: Prisma.TransactionClient, actor: Actor, planId: string) {
  await tx.$queryRaw`SELECT id FROM "InternalControlPlan" WHERE id = ${planId} FOR UPDATE`;
  const plan = await tx.internalControlPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.status !== "ABERTO") throw new C7OperationError("Checklist exige plano de controle aberto.");
  if (actor.allowedBudgetUnitIds && (!plan.budgetUnitId || !actor.allowedBudgetUnitIds.includes(plan.budgetUnitId))) throw new C7OperationError("Plano fora das unidades gestoras autorizadas.");
  return plan;
}

export async function publishControlChecklist(db: PrismaClient, actor: Actor, input: { planId: string; title: string; category: string; groups: ControlChecklistGroup[]; copiedFromId?: string; selectedSourceNumbers?: number[] }) {
  const title = input.title.trim();
  const category = input.category.trim();
  if (!title || !category || !Array.isArray(input.groups) || !input.groups.length) throw new C7OperationError("Informe título, categoria e grupos do checklist.");
  const numbers = new Set<number>();
  const names = new Set<string>();
  const groups = input.groups.map(group => {
    if (!group || typeof group.name !== "string" || !Array.isArray(group.responses) || group.responses.some(response => typeof response !== "string") || typeof group.irregularResponse !== "string" || !Array.isArray(group.items)) throw new C7OperationError("Estrutura do grupo inválida.");
    const name = group.name.trim();
    const responses = group.responses.map(response => response.trim());
    const irregularResponse = group.irregularResponse.trim();
    if (!name || names.has(name) || responses.length < 2 || responses.some(response => !response) || new Set(responses).size !== responses.length || !responses.includes(irregularResponse) || !group.items.length) throw new C7OperationError("Grupos exigem nome único, respostas distintas, resposta irregular e itens.");
    names.add(name);
    const items = group.items.map(item => {
      if (!item || typeof item.question !== "string") throw new C7OperationError("Estrutura do item inválida.");
      const question = item.question.trim();
      if (!Number.isSafeInteger(item.number) || item.number < 1 || numbers.has(item.number) || !question) throw new C7OperationError("Itens exigem número inteiro positivo único e pergunta.");
      if (item.diagnosticRule && (item.diagnosticRule !== "BANK_ACCOUNT_SOURCE" || responses[0] === irregularResponse)) throw new C7OperationError("Diagnóstico exige regra válida e primeira resposta regular distinta da irregular.");
      numbers.add(item.number);
      return { number: item.number, question, ...(item.diagnosticRule ? { diagnosticRule: item.diagnosticRule } : {}) };
    });
    return { name, responses, irregularResponse, items };
  });
  return db.$transaction(async tx => {
    const target = await openPlan(tx, actor, input.planId);
    let provenance: Prisma.InputJsonObject | undefined;
    if (input.copiedFromId) {
      const source = await tx.internalControlEvent.findUnique({ where: { id: input.copiedFromId }, include: { plan: true } });
      const original = source?.eventType === "CHECKLIST_PUBLISHED" ? readControlChecklist(source.snapshot) : null;
      if (!source?.plan.budgetUnitId || !target.budgetUnitId || !original || (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(source.plan.budgetUnitId))) throw new C7OperationError("Edição de origem não está disponível no escopo autorizado.");
      const units = await tx.planningEntityUnit.findMany({ where: { budgetUnitId: { in: [source.plan.budgetUnitId, target.budgetUnitId] } } });
      if (!units.length || !units.some(unit => unit.budgetUnitId === source.plan.budgetUnitId) || !units.some(unit => unit.budgetUnitId === target.budgetUnitId) || new Set(units.map(unit => unit.governmentEntityId)).size !== 1) throw new C7OperationError("A cópia deve permanecer na mesma entidade.");
      const selected = input.selectedSourceNumbers;
      if (!selected?.length || new Set(selected).size !== selected.length || selected.some(number => !original.groups.some(group => group.items.some(item => item.number === number)))) throw new C7OperationError("Seleção de itens de origem inválida.");
      provenance = { sourceEditionId: source.id, sourcePlanId: source.planId, sourceSnapshotHash: createHash("sha256").update(JSON.stringify(source.snapshot)).digest("hex"), selectedSourceNumbers: [...selected].sort((a, b) => a - b) };
    } else if (input.selectedSourceNumbers?.length) throw new C7OperationError("Itens de origem exigem edição de origem.");
    const event = await tx.internalControlEvent.create({ data: { planId: input.planId, eventType: "CHECKLIST_PUBLISHED", actorId: actor.usuarioId, reason: title, snapshot: { title, category, groups, ...(provenance ? { provenance } : {}) } } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "INTERNAL_CONTROL_CHECKLIST", targetId: event.id });
    return event;
  });
}

export function readControlChecklist(snapshot: unknown): Checklist | null {
  if (!snapshot || typeof snapshot !== "object" || !("title" in snapshot) || !("category" in snapshot) || !("groups" in snapshot) || typeof snapshot.title !== "string" || typeof snapshot.category !== "string" || !Array.isArray(snapshot.groups)) return null;
  const groups: ControlChecklistGroup[] = [];
  for (const value of snapshot.groups) {
    if (!value || typeof value !== "object" || typeof value.name !== "string" || typeof value.irregularResponse !== "string" || !Array.isArray(value.responses) || !value.responses.every((response: unknown) => typeof response === "string") || !Array.isArray(value.items)) return null;
    const items: ControlChecklistGroup["items"] = [];
    for (const item of value.items) {
      if (!item || typeof item !== "object" || !Number.isSafeInteger(item.number) || typeof item.question !== "string") return null;
      if (item.diagnosticRule && item.diagnosticRule !== "BANK_ACCOUNT_SOURCE") return null;
      items.push({ number: item.number, question: item.question, ...(item.diagnosticRule ? { diagnosticRule: item.diagnosticRule } : {}) });
    }
    groups.push({ name: value.name, responses: value.responses, irregularResponse: value.irregularResponse, items });
  }
  return { title: snapshot.title, category: snapshot.category, groups };
}

export async function answerControlChecklist(db: PrismaClient, actor: Actor, input: { checklistId: string; number: number; response: string; reason: string }) {
  if (!input.reason.trim()) throw new C7OperationError("Fundamente a resposta do checklist.");
  return db.$transaction(tx => recordAnswer(tx, actor, input));
}

async function recordAnswer(tx: Prisma.TransactionClient, actor: Actor, input: { checklistId: string; number: number; response: string; reason: string }, diagnostic?: { rule: string; sourceIds: string[]; irregularSourceIds: string[] }) {
    const checklist = await tx.internalControlEvent.findUniqueOrThrow({ where: { id: input.checklistId } });
    if (checklist.eventType !== "CHECKLIST_PUBLISHED") throw new C7OperationError("Checklist publicado não encontrado.");
    await openPlan(tx, actor, checklist.planId);
    const template = readControlChecklist(checklist.snapshot);
    const group = template?.groups.find(group => group.items.some(item => item.number === input.number));
    const item = group?.items.find(item => item.number === input.number);
    if (!group || !item || !group.responses.includes(input.response)) throw new C7OperationError("Item ou resposta não pertence à edição publicada.");
    if (item.diagnosticRule && !diagnostic) throw new C7OperationError("O item configurado com regra deve ser respondido pelo diagnóstico automático.");
    const previous = await tx.internalControlEvent.findFirst({ where: { planId: checklist.planId, eventType: "CHECKLIST_ANSWERED", snapshot: { path: ["answerKey"], equals: `${checklist.id}:${input.number}` } } });
    if (previous) {
      const data = previous.snapshot as Prisma.JsonObject;
      if (data.response !== input.response || previous.reason !== input.reason.trim()) throw new C7OperationError("Item já respondido com outros dados; publique nova edição para nova avaliação.");
      return previous;
    }
    const irregular = input.response === group.irregularResponse;
    const finding = irregular ? await tx.internalControlFinding.create({ data: { planId: checklist.planId, title: `${input.number}. ${item.question}`, description: input.reason.trim(), status: "PENDENTE" } }) : null;
    const event = await tx.internalControlEvent.create({ data: { planId: checklist.planId, findingId: finding?.id, eventType: "CHECKLIST_ANSWERED", actorId: actor.usuarioId, reason: input.reason.trim(), snapshot: { checklistId: checklist.id, answerKey: `${checklist.id}:${input.number}`, category: template!.category, group: group.name, number: input.number, question: item.question, response: input.response, irregular, findingId: finding?.id ?? null, ...(diagnostic ? { diagnostic } : {}) } } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "INTERNAL_CONTROL_EVENT", targetId: event.id });
    return event;
}

export async function runControlChecklistDiagnostics(db: PrismaClient, actor: Actor, checklistId: string) {
  return db.$transaction(async tx => {
    const edition = await tx.internalControlEvent.findUniqueOrThrow({ where: { id: checklistId } });
    if (edition.eventType !== "CHECKLIST_PUBLISHED") throw new C7OperationError("Checklist publicado não encontrado.");
    const plan = await openPlan(tx, actor, edition.planId);
    if (!plan.budgetUnitId) throw new C7OperationError("Diagnóstico exige UG conciliada do plano.");
    const template = readControlChecklist(edition.snapshot);
    if (!template) throw new C7OperationError("Edição de checklist inválida.");
    const items = template.groups.flatMap(group => group.items.filter(item => item.diagnosticRule).map(item => ({ group, item })));
    if (!items.length) throw new C7OperationError("A edição não possui regras de diagnóstico configuradas.");
    const accounts = await tx.bankAccount.findMany({ where: { budgetUnitId: plan.budgetUnitId, isActive: true }, select: { id: true, resourceSourceId: true }, orderBy: { id: "asc" } });
    if (!accounts.length) throw new C7OperationError("Sem contas bancárias ativas na UG para avaliar; nenhum resultado regular foi inferido.");
    const missing = accounts.filter(account => !account.resourceSourceId).map(account => account.id);
    const results = [];
    for (const { group, item } of items) {
      results.push(await recordAnswer(tx, actor, { checklistId, number: item.number, response: missing.length ? group.irregularResponse : group.responses[0], reason: `Fonte das contas bancárias ativas da UG: ${accounts.length} avaliadas; ${missing.length} sem fonte. Contas: ${accounts.map(account => account.id).join(", ")}. Sem fonte: ${missing.join(", ") || "nenhuma"}.` }, { rule: "BANK_ACCOUNT_SOURCE", sourceIds: accounts.map(account => account.id), irregularSourceIds: missing }));
    }
    return results;
  });
}
