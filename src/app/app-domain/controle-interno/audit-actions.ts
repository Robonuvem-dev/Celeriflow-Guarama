"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { C7OperationError } from "@/lib/c7/operations-service";
import { scheduleControlAudit, sendControlAudit, respondControlAudit, reviewControlAudit, transitionControlAudit } from "@/lib/c7/control-audits";
import { databaseConnection } from "@/db/client";

type Result = { error?: string };
type Schedule = Parameters<typeof scheduleControlAudit>[2];
type Command = { type: "SEND"; input: Parameters<typeof sendControlAudit>[2] } | { type: "RESPOND"; input: Parameters<typeof respondControlAudit>[2] } | { type: "REVIEW"; input: Parameters<typeof reviewControlAudit>[2] } | { type: "TRANSITION"; input: Parameters<typeof transitionControlAudit>[2] };
const date = (value: string) => {
  const parsed = new Date(`${value}T23:59:59.999Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new C7OperationError("Data da auditoria inválida.");
  return parsed;
};

export async function scheduleControlAuditAction(input: Omit<Schedule, "startAt" | "endAt" | "responseDueAt"> & { startAt: string; endAt: string; responseDueAt: string }): Promise<Result> {
  try {
    const context = await getTenantContextForModuleOperation("ADMINISTRACAO", "create");
    await scheduleControlAudit(databaseConnection, { usuarioId: context.user.id, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, { ...input, startAt: date(input.startAt), endAt: date(input.endAt), responseDueAt: date(input.responseDueAt) });
    revalidatePath("/controle-interno"); return {};
  } catch (error) { return { error: error instanceof C7OperationError ? error.message : "Não foi possível agendar a auditoria." }; }
}

export async function controlAuditCommandAction(command: Command): Promise<Result> {
  try {
    const context = await getTenantContextForModuleOperation("ADMINISTRACAO", "update");
    const actor = { usuarioId: context.user.id, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
    switch (command.type) {
      case "SEND": await sendControlAudit(databaseConnection, actor, command.input); break;
      case "RESPOND": await respondControlAudit(databaseConnection, actor, command.input); break;
      case "REVIEW": await reviewControlAudit(databaseConnection, actor, command.input); break;
      case "TRANSITION": await transitionControlAudit(databaseConnection, actor, command.input); break;
      default: throw new C7OperationError("Comando da auditoria inválido.");
    }
    revalidatePath("/controle-interno"); return {};
  } catch (error) { return { error: error instanceof C7OperationError ? error.message : "Não foi possível registrar a operação da auditoria." }; }
}
