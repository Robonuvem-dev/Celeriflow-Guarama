"use server";

import { and, eq, inArray, like, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { processes, processMovements, processEvents } from "@/db/schema/processes";
import { departments } from "@/db/schema/administration";
import { getProtocolContextForOperation, protocolScopeCondition } from "@/lib/protocols/access";
import { NotificationDispatcher } from "@/lib/notifications/notification-dispatcher";

export async function dispatchRemessaAction(payload: {
  toDepartmentId: string;
  processIds: string[];
  notes?: string;
}): Promise<{ error?: string | null; remessaNumber?: string }> {
  try {
    const context = await getProtocolContextForOperation("update");
    if (!context.user.departmentId || !context.user.employeeId) {
      return { error: "Usuário precisa estar vinculado a um setor e ser servidor ativo." };
    }
    if (!payload.toDepartmentId) {
      return { error: "Informe o setor de destino." };
    }
    if (!payload.processIds || payload.processIds.length === 0) {
      return { error: "Selecione ao menos um processo para compor a remessa." };
    }
    if (payload.toDepartmentId === context.user.departmentId) {
      return { error: "O setor de destino deve ser diferente do setor de origem." };
    }

    const year = new Date().getFullYear();
    const timestampSeq = Date.now().toString().slice(-4);
    const remessaNumber = `REM-${year}-${timestampSeq}`;
    const remessaPrefix = `[Remessa: ${remessaNumber}]`;
    const fullReason = payload.notes ? `${remessaPrefix} ${payload.notes}` : `${remessaPrefix} Encaminhamento em lote`;

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      // Validar processos elegíveis
      const eligibleProcesses = await tx
        .select({ id: processes.id, protocolNumber: processes.protocolNumber })
        .from(processes)
        .where(
          and(
            inArray(processes.id, payload.processIds),
            eq(processes.currentDepartmentId, context.user.departmentId!),
            protocolScopeCondition(context)
          )
        );

      if (eligibleProcesses.length === 0) {
        throw new Error("Nenhum dos processos selecionados está disponível no seu setor para envio.");
      }

      for (const proc of eligibleProcesses) {
        // Criar movimentação para a remessa
        await tx.insert(processMovements).values({
          processId: proc.id,
          fromDepartmentId: context.user.departmentId,
          toDepartmentId: payload.toDepartmentId,
          employeeId: context.user.employeeId,
          reason: fullReason,
          status: "AWAITING_RECEIPT",
          movedAt: new Date(),
        });

        // Atualizar status do processo
        await tx
          .update(processes)
          .set({
            status: "Aguardando Recebimento",
            updatedAt: new Date(),
          })
          .where(eq(processes.id, proc.id));

        // Registrar evento na linha do tempo
        await tx.insert(processEvents).values({
          processId: proc.id,
          eventType: "FORWARDED",
          description: `Processo incluído na Remessa ${remessaNumber} para o setor de destino`,
          departmentId: context.user.departmentId,
          employeeId: context.user.employeeId,
          metadata: JSON.stringify({
            remessaNumber,
            toDepartmentId: payload.toDepartmentId,
            notes: payload.notes || null,
          }),
        });
      }
    });

    revalidatePath("/protocolos/remessas");
    revalidatePath("/protocolos/processos");
    return { error: null, remessaNumber };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Falha ao despachar remessa." };
  }
}

// 19.66: Confirmação de recebimento por remessa
export async function receiveRemessaAction(remessaNumber: string, notes?: string): Promise<{ error?: string | null }> {
  try {
    const context = await getProtocolContextForOperation("update");
    if (!context.user.departmentId || !context.user.employeeId) {
      return { error: "Usuário precisa estar vinculado a um setor e ser servidor ativo." };
    }
    if (!remessaNumber) {
      return { error: "Informe o número da remessa." };
    }

    const remessaPrefix = `[Remessa: ${remessaNumber}]%`;

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const pendingMovements = await tx
        .select({
          id: processMovements.id,
          processId: processMovements.processId,
        })
        .from(processMovements)
        .where(
          and(
            like(processMovements.reason, remessaPrefix),
            eq(processMovements.toDepartmentId, context.user.departmentId!),
            eq(processMovements.status, "AWAITING_RECEIPT")
          )
        );

      if (pendingMovements.length === 0) {
        throw new Error(`Nenhum processo pendente de recebimento encontrado para a remessa ${remessaNumber} neste setor.`);
      }

      for (const mov of pendingMovements) {
        await tx
          .update(processMovements)
          .set({
            status: "RECEIVED",
            receivedAt: new Date(),
            receivedByEmployeeId: context.user.employeeId,
            updatedAt: new Date(),
          })
          .where(eq(processMovements.id, mov.id));

        await tx
          .update(processes)
          .set({
            currentDepartmentId: context.user.departmentId,
            status: "Aberto",
            updatedAt: new Date(),
          })
          .where(eq(processes.id, mov.processId));

        await tx.insert(processEvents).values({
          processId: mov.processId,
          eventType: "RECEIVED",
          description: `Recebimento confirmado via remessa ${remessaNumber}`,
          departmentId: context.user.departmentId,
          employeeId: context.user.employeeId,
          metadata: JSON.stringify({ remessaNumber, notes: notes || null }),
        });
      }
    });

    revalidatePath("/protocolos/remessas");
    revalidatePath("/protocolos/processos");
    return { error: null };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Falha ao receber remessa." };
  }
}

// 19.63: Efetuar encerramento de remessa com diversos processos simultaneamente
export async function closeRemessaAction(remessaNumber: string, reason: string): Promise<{ error?: string | null }> {
  try {
    const context = await getProtocolContextForOperation("update");
    if (!context.user.departmentId || !context.user.employeeId) {
      return { error: "Usuário precisa estar vinculado a um setor e ser servidor ativo." };
    }
    if (!remessaNumber) {
      return { error: "Informe o número da remessa a encerrar." };
    }
    if (!reason || reason.trim().length < 5) {
      return { error: "Informe o motivo do encerramento da remessa (mínimo 5 caracteres)." };
    }

    const remessaPrefix = `[Remessa: ${remessaNumber}]%`;

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const movements = await tx
        .select({
          id: processMovements.id,
          processId: processMovements.processId,
        })
        .from(processMovements)
        .where(
          and(
            like(processMovements.reason, remessaPrefix),
            eq(processMovements.toDepartmentId, context.user.departmentId!)
          )
        );

      if (movements.length === 0) {
        throw new Error(`Nenhum processo vinculado à remessa ${remessaNumber} encontrado no setor.`);
      }

      for (const mov of movements) {
        await tx.insert(processEvents).values({
          processId: mov.processId,
          eventType: "REMESSA_CLOSED",
          description: `Remessa ${remessaNumber} encerrada simultaneamente: ${reason}`,
          departmentId: context.user.departmentId,
          employeeId: context.user.employeeId,
          metadata: JSON.stringify({ remessaNumber, reason }),
        });
      }
    });

    revalidatePath("/protocolos/remessas");
    revalidatePath("/protocolos/processos");
    return { error: null };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Falha ao encerrar remessa." };
  }
}

// 19.64: Envio de processos cadastrados unitariamente ao setor
export async function dispatchSingleProcessAction(payload: {
  processId: string;
  toDepartmentId: string;
  notes?: string;
}): Promise<{ error?: string | null }> {
  try {
    const context = await getProtocolContextForOperation("update");
    if (!context.user.departmentId || !context.user.employeeId) {
      return { error: "Usuário precisa estar vinculado a um setor e ser servidor ativo." };
    }
    if (!payload.processId || !payload.toDepartmentId) {
      return { error: "Processo e setor de destino são obrigatórios." };
    }

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [proc] = await tx
        .select({ id: processes.id, protocolNumber: processes.protocolNumber })
        .from(processes)
        .where(
          and(
            eq(processes.id, payload.processId),
            eq(processes.currentDepartmentId, context.user.departmentId!),
            protocolScopeCondition(context)
          )
        )
        .limit(1);

      if (!proc) {
        throw new Error("Processo não encontrado no seu setor.");
      }

      await tx.insert(processMovements).values({
        processId: proc.id,
        fromDepartmentId: context.user.departmentId,
        toDepartmentId: payload.toDepartmentId,
        employeeId: context.user.employeeId,
        reason: payload.notes || "Encaminhamento unitário de processo",
        status: "AWAITING_RECEIPT",
        movedAt: new Date(),
      });

      await tx
        .update(processes)
        .set({
          status: "Aguardando Recebimento",
          updatedAt: new Date(),
        })
        .where(eq(processes.id, proc.id));

      await tx.insert(processEvents).values({
        processId: proc.id,
        eventType: "FORWARDED",
        description: `Processo encaminhado unitariamente ao setor de destino`,
        departmentId: context.user.departmentId,
        employeeId: context.user.employeeId,
        metadata: JSON.stringify({ toDepartmentId: payload.toDepartmentId, notes: payload.notes || null }),
      });
    });

    revalidatePath("/protocolos/remessas");
    revalidatePath("/protocolos/processos");
    return { error: null };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Falha ao encaminhar processo." };
  }
}
