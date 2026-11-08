"use server";

import { revalidatePath } from "next/cache";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { saveProcurementAuxiliaryRecord } from "@/db/repositories/procurement/auxiliary-catalogs";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
import { instanceParameters } from "@/db/schema/instance-configuration";
import { and, eq } from "drizzle-orm";

export async function saveConsorcio(formData: FormData) {
  try {
    const id = (formData.get("id") as string) || null;
    const context = await getTenantContextForModuleOperation("COMPRAS", id ? "update" : "create");

    const code = (formData.get("code") as string)?.trim() || (formData.get("numeroConsorcio") as string)?.trim() || "";
    const name = (formData.get("name") as string)?.trim() || (formData.get("designacao") as string)?.trim() || "";
    const exercicio = (formData.get("exercicio") as string)?.trim() || new Date().getFullYear().toString();
    const numeroConsorcio = (formData.get("numeroConsorcio") as string)?.trim() || code;
    const cnpj = (formData.get("cnpj") as string)?.trim() || "";
    const dataCadastro = (formData.get("dataCadastro") as string)?.trim() || "";
    const dataEncerramento = (formData.get("dataEncerramento") as string)?.trim() || "";
    const ramo = (formData.get("ramo") as string)?.trim() || (formData.get("ramoAtividade") as string)?.trim() || "";
    const liderConsorcioId = (formData.get("liderConsorcioId") as string)?.trim() || "";
    const percentualLider = (formData.get("percentualLider") as string)?.trim() || "";
    const fornecedores = (formData.get("fornecedores") as string)?.trim() || "";
    const emailTelefone = (formData.get("emailTelefone") as string)?.trim() || "";
    const registroOrgao = (formData.get("registroOrgao") as string)?.trim() || "";

    if (!code || !name) {
      return { success: false, error: "Identificador/número e nome do consórcio são obrigatórios." };
    }

    if (!dataCadastro) {
      return { success: false, error: "Data de cadastro é obrigatória." };
    }

    const payload = {
      code,
      name,
      fields: {
        exercicio,
        numeroConsorcio,
        anoNumero: `${exercicio}/${numeroConsorcio}`,
        cnpj,
        dataCadastro,
        dataEncerramento,
        ramo,
        ramoAtividade: ramo,
        liderConsorcioId,
        percentualLider,
        fornecedores,
        designacao: name,
        emailTelefone,
        registroOrgao,
      },
    };

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const targetId = await saveProcurementAuxiliaryRecord(tx, "consorcios-empresas", id, payload);
      await insertAuditEvent(tx, {
        actorUsuarioId: context.user.id,
        eventType: auditEventTypes.instanceConfigurationChanged,
        targetType: "CONSORCIO_EMPRESAS",
        targetId,
      });
    });

    revalidatePath("/compras/contratos/consorcios");
    revalidatePath("/compras/contratos");
    return { success: true };
  } catch (error) {
    console.error("Erro ao salvar consórcio:", error);
    return { success: false, error: error instanceof Error ? error.message : "Erro ao salvar consórcio." };
  }
}

export async function deleteConsorcio(id: string) {
  try {
    const context = await getTenantContextForModuleOperation("COMPRAS", "delete");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx
        .delete(instanceParameters)
        .where(eq(instanceParameters.chave, `COMPRAS_CADASTRO:consorcios-empresas:${id}`));
      await insertAuditEvent(tx, {
        actorUsuarioId: context.user.id,
        eventType: auditEventTypes.instanceConfigurationChanged,
        targetType: "CONSORCIO_EMPRESAS",
        targetId: id,
      });
    });

    revalidatePath("/compras/contratos/consorcios");
    revalidatePath("/compras/contratos");
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir consórcio:", error);
    return { success: false, error: error instanceof Error ? error.message : "Erro ao excluir consórcio." };
  }
}
