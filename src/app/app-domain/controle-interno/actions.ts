"use server";

import { C7OperationError, createInternalControlFinding, createInternalControlPlan, resolveInternalControlFinding, transitionInternalControlPlan, recordInternalControlOpinion } from "@/lib/c7/operations-service";
import { canViewModule, getTenantContextForModule, getTenantContextForModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { publishControlChecklist, answerControlChecklist, runControlChecklistDiagnostics, type ControlChecklistGroup } from "@/lib/c7/control-checklists";
import { sendControlNotice, respondControlNotice, reviewControlNoticeResponse } from "@/lib/c7/control-notifications";
import { scheduleControlObligation, completeControlObligation, runControlAgendaAlerts } from "@/lib/c7/control-agenda";
import { runMunicipalControlDiagnostics } from "@/lib/c7/municipal-diagnostics";
import { FiscalIndexError } from "@/lib/financeiro/fiscal-indices";

type Result = { error?: string };
const date = (value?: string) => {
  if (!value) return undefined;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new C7OperationError("Data inválida.");
  return parsed;
};
const controlActor = (context: AppContext) => ({ usuarioId: context.user.id, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds });

export async function runMunicipalDiagnosticsAction(input: { planId: string; financialYearId: string; fiscalThrough: string; idempotencyKey: string }): Promise<Result> {
  try {
    const context = await getTenantContextForModuleOperation("ADMINISTRACAO", "update");
    const cut = date(input.fiscalThrough);
    if (!cut) throw new C7OperationError("Informe o corte fiscal.");
    cut.setUTCHours(23, 59, 59, 999);
    const modules = await context.prisma.configuracaoModulo.findMany({ where: { codigo: { in: ["FINANCEIRO", "COMPRAS", "TRIBUTACAO"] }, ativo: true }, select: { codigo: true } });
    const enabled = (code: string) => modules.some(module => module.codigo === code) && canViewModule(context.user, code);
    await runMunicipalControlDiagnostics(context.prisma, { ...controlActor(context), sourcePermissions: { financial: enabled("FINANCEIRO"), procurement: enabled("COMPRAS"), tax: enabled("TRIBUTACAO") } }, { ...input, fiscalThrough: cut });
    revalidatePath("/controle-interno");
    return {};
  } catch (error) { return { error: error instanceof C7OperationError || error instanceof FiscalIndexError ? error.message : "Não foi possível executar os diagnósticos municipais." }; }
}

export async function createControlPlanAction(input: { title: string; reference: string; dueAt?: string; budgetUnitId: string }): Promise<Result> {
  try {
    const context = await getTenantContextForModuleOperation("ADMINISTRACAO", "create");
    if (!input.budgetUnitId?.trim()) throw new C7OperationError("Selecione a unidade gestora do plano.");
    await createInternalControlPlan(context.prisma, controlActor(context), { ...input, dueAt: date(input.dueAt) });
    revalidatePath("/controle-interno");
    revalidatePath("/indicadores");
    return {};
  } catch (error) { return { error: error instanceof C7OperationError ? error.message : "Não foi possível criar o plano." }; }
}

export async function createControlFindingAction(input: { planId: string; title: string; description: string; responsibleId?: string; evidenceDocumentId?: string; dueAt?: string }): Promise<Result> {
  try {
    const context = await getTenantContextForModuleOperation("ADMINISTRACAO", "create");
    await createInternalControlFinding(context.prisma, controlActor(context), { ...input, dueAt: date(input.dueAt) });
    revalidatePath("/controle-interno");
    revalidatePath("/indicadores");
    return {};
  } catch (error) { return { error: error instanceof C7OperationError ? error.message : "Não foi possível registrar o apontamento." }; }
}

export async function resolveControlFindingAction(id: string, reason: string): Promise<Result> {
  try {
    const context = await getTenantContextForModuleOperation("ADMINISTRACAO", "update");
    await resolveInternalControlFinding(context.prisma, controlActor(context), id, reason);
    revalidatePath("/controle-interno");
    revalidatePath("/indicadores");
    return {};
  } catch (error) { return { error: error instanceof C7OperationError ? error.message : "Não foi possível resolver o apontamento." }; }
}

export async function transitionControlPlanAction(input: { planId: string; status: "CONCLUIDO" | "ABERTO"; reason: string }): Promise<Result> {
  try {
    const context = await getTenantContextForModuleOperation("ADMINISTRACAO", "update");
    await transitionInternalControlPlan(context.prisma, controlActor(context), input);
    revalidatePath("/controle-interno");
    revalidatePath("/indicadores");
    return {};
  } catch (error) { return { error: error instanceof C7OperationError ? error.message : "Não foi possível registrar a decisão do plano." }; }
}

export async function recordControlOpinionAction(input: { findingId: string; opinion: string; correctiveAction: string; recruitment: boolean; employeeId?: string }): Promise<Result> {
  try {
    const context = await getTenantContextForModuleOperation("ADMINISTRACAO", "update");
    await recordInternalControlOpinion(context.prisma, controlActor(context), input);
    revalidatePath("/controle-interno");
    revalidatePath("/indicadores");
    return {};
  } catch (error) { return { error: error instanceof C7OperationError ? error.message : "Não foi possível registrar o parecer." }; }
}

export async function publishControlChecklistAction(input: { planId: string; title: string; category: string; lines: string; groups?: ControlChecklistGroup[]; copiedFromId?: string; selectedSourceNumbers?: number[] }): Promise<Result> {
  try {
    const context = await getTenantContextForModuleOperation("ADMINISTRACAO", "create");
    const groups = new Map<string, ControlChecklistGroup>();
    for (const line of input.lines.split(/\r?\n/).filter(line => line.trim())) {
      const parts = line.split("|").map(part => part.trim());
      if (![5, 6].includes(parts.length)) throw new C7OperationError("Cada linha exige grupo | número | pergunta | respostas separadas por ; | resposta irregular; regra é opcional no sexto campo.");
      const [name, number, question, choices, irregularResponse, diagnosticRule] = parts;
      if (diagnosticRule && diagnosticRule !== "BANK_ACCOUNT_SOURCE") throw new C7OperationError("Regra de diagnóstico desconhecida.");
      const responses = choices.split(";").map(choice => choice.trim());
      const group = groups.get(name) ?? { name, responses, irregularResponse, items: [] };
      if (JSON.stringify(group.responses) !== JSON.stringify(responses) || group.irregularResponse !== irregularResponse) throw new C7OperationError("Itens do mesmo grupo devem compartilhar as respostas configuradas.");
      group.items.push({ number: Number(number), question, ...(diagnosticRule ? { diagnosticRule: "BANK_ACCOUNT_SOURCE" as const } : {}) });
      groups.set(name, group);
    }
    await publishControlChecklist(context.prisma, controlActor(context), { ...input, groups: input.groups ?? [...groups.values()] });
    revalidatePath("/controle-interno");
    return {};
  } catch (error) { return { error: error instanceof C7OperationError ? error.message : "Não foi possível publicar o checklist." }; }
}

export async function answerControlChecklistAction(input: { checklistId: string; number: number; response: string; reason: string }): Promise<Result> {
  try {
    const context = await getTenantContextForModuleOperation("ADMINISTRACAO", "update");
    await answerControlChecklist(context.prisma, controlActor(context), input);
    revalidatePath("/controle-interno");
    return {};
  } catch (error) { return { error: error instanceof C7OperationError ? error.message : "Não foi possível registrar a resposta." }; }
}

export async function runControlChecklistDiagnosticsAction(checklistId: string): Promise<Result> {
  try {
    const context = await getTenantContextForModuleOperation("ADMINISTRACAO", "update");
    await getTenantContextForModule("FINANCEIRO");
    await runControlChecklistDiagnostics(context.prisma, controlActor(context), checklistId);
    revalidatePath("/controle-interno");
    return {};
  } catch (error) { return { error: error instanceof C7OperationError ? error.message : "Não foi possível executar o diagnóstico." }; }
}

export async function sendControlNoticeAction(input: { planId: string; findingId?: string; recipientId: string; title: string; message: string; dueAt: string; documentIds: string[]; idempotencyKey: string }): Promise<Result> {
  try {
    const context = await getTenantContextForModuleOperation("ADMINISTRACAO", "create");
    await sendControlNotice(context.prisma, controlActor(context), { ...input, dueAt: date(input.dueAt) ?? new Date(NaN) });
    revalidatePath("/controle-interno");
    return {};
  } catch (error) { return { error: error instanceof C7OperationError ? error.message : "Não foi possível enviar a notificação." }; }
}

export async function respondControlNoticeAction(input: { noticeId: string; response: string; documentIds: string[] }): Promise<Result> {
  try {
    const context = await getTenantContextForModule("ADMINISTRACAO");
    await respondControlNotice(context.prisma, controlActor(context), input);
    revalidatePath("/controle-interno");
    return {};
  } catch (error) { return { error: error instanceof C7OperationError ? error.message : "Não foi possível registrar a resposta." }; }
}

export async function reviewControlNoticeResponseAction(input: { noticeId: string; accepted: boolean; reason: string }): Promise<Result> {
  try {
    const context = await getTenantContextForModuleOperation("ADMINISTRACAO", "update");
    await reviewControlNoticeResponse(context.prisma, controlActor(context), input);
    revalidatePath("/controle-interno");
    return {};
  } catch (error) { return { error: error instanceof C7OperationError ? error.message : "Não foi possível analisar a resposta." }; }
}

export async function scheduleControlObligationAction(input: { planId: string; title: string; description: string; dueAt: string; criticality: "BAIXA" | "MEDIA" | "ALTA"; alertDays: number; expirationDays: number; viewerIds: string[]; closerIds: string[]; costCenterId?: string; idempotencyKey: string }): Promise<Result> {
  try {
    const context = await getTenantContextForModuleOperation("ADMINISTRACAO", "create");
    await scheduleControlObligation(context.prisma, controlActor(context), { ...input, dueAt: date(input.dueAt) ?? new Date(NaN) });
    revalidatePath("/controle-interno");
    return {};
  } catch (error) { return { error: error instanceof C7OperationError ? error.message : "Não foi possível agendar a obrigação." }; }
}

export async function completeControlObligationAction(input: { obligationId: string; reason: string }): Promise<Result> {
  try {
    const context = await getTenantContextForModule("ADMINISTRACAO");
    await completeControlObligation(context.prisma, controlActor(context), input);
    revalidatePath("/controle-interno");
    return {};
  } catch (error) { return { error: error instanceof C7OperationError ? error.message : "Não foi possível baixar a obrigação." }; }
}

export async function runControlAgendaAlertsAction(planId: string): Promise<Result> {
  try {
    const context = await getTenantContextForModuleOperation("ADMINISTRACAO", "create");
    await runControlAgendaAlerts(context.prisma, controlActor(context), planId);
    revalidatePath("/controle-interno");
    return {};
  } catch (error) { return { error: error instanceof C7OperationError ? error.message : "Não foi possível processar os alertas." }; }
}
