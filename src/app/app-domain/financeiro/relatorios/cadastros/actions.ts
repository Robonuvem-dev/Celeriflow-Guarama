"use server";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { instanceParameters } from "@/db/schema/instance-configuration";
import { findOperationalInstance } from "@/db/repositories/platform/instance-configuration";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { reportPresetSchema } from "@/lib/financeiro/report-preset";

export async function saveFinancialReportPreset(form: FormData): Promise<void> {
  const id = String(form.get("id") || "");
  const context = await getTenantContextForModuleOperation("FINANCEIRO", id ? "update" : "create");
  const preset = reportPresetSchema.parse({ id: id || randomUUID(), name: form.get("name"), purpose: form.get("purpose") || "", reportType: form.get("reportType"), format: form.get("format"), active: form.get("active") === "on" });
  const instance = await findOperationalInstance(context.database ?? db);
  if (!instance) throw new Error("Configure a instância municipal antes de cadastrar relatórios.");
  const key = `FINANCIAL_REPORT_PRESET:${preset.id}`;
  await withDatabaseTransaction(databaseConnection, async tx => {
    if (id) {
      const [updated] = await tx.update(instanceParameters).set({ valor: preset, updatedAt: new Date() }).where(and(eq(instanceParameters.configuracaoInstanciaId, instance.id), eq(instanceParameters.chave, key))).returning({ id: instanceParameters.id });
      if (!updated) throw new Error("Relatório não encontrado.");
    } else await tx.insert(instanceParameters).values({ configuracaoInstanciaId: instance.id, chave: key, valor: preset });
    await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "FinancialReportPreset", targetId: `${instance.id}:${preset.id}` });
  });
  revalidatePath("/financeiro/relatorios/cadastros");
}
