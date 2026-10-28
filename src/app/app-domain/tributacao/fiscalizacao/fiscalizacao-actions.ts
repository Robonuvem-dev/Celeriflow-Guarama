"use server";

import { getTenantContextForModule, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { runTaxAuditCrossCheck, issueTaxInfractionNotice, type TaxAuditCrossCheckResult } from "@/lib/tributacao/inteligencia-tributaria-engine";
import { db } from "@/db/client";
import { readTaxAuditCrossChecks } from "@/db/repositories/taxation/audit-cross-checks";
import type { TaxAuditCrossCheckRecord } from "@/lib/contracts/taxation-registry";
import { revalidatePath } from "next/cache";
import { z } from "zod";

type ActionResult<T = unknown> = { error?: string; data?: T };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const auditSchema = z.object({
  cnpjCpfContribuinte: z.string().min(1, "Informe o CNPJ/CPF."),
  razaoSocial: z.string().min(1, "Informe a Razão Social."),
  origemCruzamento: z.enum(["DEISS_BANCOS", "CARTORIO_DOI", "CARTORIO_ITBI"]).default("DEISS_BANCOS"),
  valorDeclarado: z.number().nonnegative(),
  valorApuradoBancos: z.number().nonnegative(),
});

export async function runTaxAuditAction(input: z.infer<typeof auditSchema>): Promise<ActionResult<TaxAuditCrossCheckResult>> {
  const parsed = auditSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create");
    const result = await runTaxAuditCrossCheck(context.database ?? db, parsed.data);

    revalidatePath("/tributacao/fiscalizacao");
    return { data: result };
  } catch (error) {
    return { error: getErrorMessage(error, "Erro ao executar cruzamento fiscal.") };
  }
}

export async function issueInfractionNoticeAction(crossCheckId: string): Promise<ActionResult<{ record: TaxAuditCrossCheckRecord; numeroAutoInfracao: string }>> {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    const result = await issueTaxInfractionNotice(context.database ?? db, crossCheckId);

    revalidatePath("/tributacao/fiscalizacao");
    return { data: result };
  } catch (error) {
    return { error: getErrorMessage(error, "Erro ao emitir Auto de Infração.") };
  }
}

export async function getTaxAuditRecordsAction(): Promise<ActionResult<TaxAuditCrossCheckRecord[]>> {
  try {
    const context = await getTenantContextForModule("TRIBUTACAO");
    const records = await readTaxAuditCrossChecks(context.database ?? db);
    return { data: records };
  } catch (error) {
    return { error: getErrorMessage(error, "Erro ao carregar registros de malha fina.") };
  }
}
