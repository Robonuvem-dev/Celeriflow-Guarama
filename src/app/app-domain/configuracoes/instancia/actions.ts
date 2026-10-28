"use server";

import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { parseInstanceConfigurationValues } from "@/lib/platform/instance-configuration";
import { databaseConnection, db } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { findOperationalInstance, saveInstanceParameterChanges } from "@/db/repositories/platform/instance-configuration";
import { revalidatePath } from "next/cache";
import { z } from "zod";

type ActionResult = { error?: string; message?: string };

const saveInstanceConfigurationSchema = z.object({
  instanceId: z.string().min(1),
  values: z.unknown(),
}).strict();

export async function saveInstanceConfiguration(rawInput: unknown): Promise<ActionResult> {
  try {
    const input = saveInstanceConfigurationSchema.parse(rawInput);
    const values = parseInstanceConfigurationValues(input.values);
    const context = await getTenantContextForSystemAdministration();
    const instance = await findOperationalInstance(context.database ?? db);

    if (!instance || instance.id !== input.instanceId) {
      throw new Error("A instância operacional selecionada não está disponível.");
    }

    const currentValues = new Map(instance.parametros.map((parameter) => [parameter.chave, parameter.valor]));
    const changes = Object.entries(values).filter(([key, value]) => currentValues.get(key) !== value);

    if (changes.length === 0) {
      return { message: "Nenhuma configuração foi alterada." };
    }

    await withDatabaseTransaction(databaseConnection, tx => saveInstanceParameterChanges(tx, instance.id, changes, context.user.id));

    revalidatePath("/configuracoes");
    revalidatePath("/configuracoes/instancia");
    revalidatePath("/configuracoes/auditoria");
    return { message: "Parâmetros operacionais salvos e registrados na auditoria." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar as configurações." };
  }
}
