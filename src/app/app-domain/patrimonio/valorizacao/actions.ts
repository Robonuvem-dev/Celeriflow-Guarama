"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModule, getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { reconcileStockValuation } from "@/lib/patrimonio/stock-valuation";
import { z } from "zod";
import { assertCostScope } from "@/lib/financeiro/cost-ledger";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { deleteUploadedDocument, uploadFile, validateUpload } from "@/lib/platform/blob";

export async function ingestStockValuationDocumentAction(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("PATRIMONIO", "update");
  await getTenantContextForModuleOperation("FINANCEIRO", "update");
  await getTenantContextForModuleOperation("DOCUMENTOS", "create");
  const input = z.object({ financialYearId: z.string().min(1), budgetUnitId: z.string().min(1), title: z.string().trim().min(5).max(200), documentClassCode: z.string().min(1) }).parse({ financialYearId: form.get("financialYearId"), budgetUnitId: form.get("budgetUnitId"), title: form.get("title"), documentClassCode: form.get("documentClassCode") });
  const actor = { usuarioId: context.user.id, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
  const year = await context.prisma.$transaction(tx => assertCostScope(tx, actor, input.financialYearId, input.budgetUnitId));
  if (!await context.prisma.usuario.count({ where: { id: actor.usuarioId, ativo: true, unidadesGestoras: { some: { budgetUnitId: input.budgetUnitId } } } })) throw new Error("Responsável sem vínculo ativo com a UG do estoque.");
  await context.prisma.documentClass.findFirstOrThrow({ where: { code: input.documentClassCode, isActive: true, OR: [{ code: { startsWith: "PATRIMONIO" } }, { code: { startsWith: "ALMOXARIFADO" } }, { code: { startsWith: "ESTOQUE" } }] } });
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new Error("Anexe a memória documental da conciliação.");
  validateUpload(file);
  const blob = await uploadFile(file);
  try {
    await ingestGedDocument(context.prisma, { title: input.title, documentType: `ESTOQUE:${year.governmentEntityId}:${input.budgetUnitId}`, documentClassCode: input.documentClassCode, fileUrl: blob.url, content: new Uint8Array(await file.arrayBuffer()), actorUsuarioId: actor.usuarioId, afterCreate: async tx => { const current = await assertCostScope(tx, actor, input.financialYearId, input.budgetUnitId); if (current.governmentEntityId !== year.governmentEntityId) throw new Error("Escopo alterado durante o ingresso documental."); } });
  } catch (error) { await deleteUploadedDocument(blob).catch(() => undefined); throw error; }
  revalidatePath("/patrimonio/valorizacao");
}

export async function reconcileStockValuationAction(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("PATRIMONIO", "update");
  await getTenantContextForModuleOperation("FINANCEIRO", "update");
  await getTenantContextForModule("DOCUMENTOS");
  const input = z.object({ stockId: z.string().min(1), financialYearId: z.string().min(1), budgetUnitId: z.string().min(1), quantity: z.string().regex(/^\d+(?:\.\d{1,6})?$/), amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/), inventoryAccountId: z.string().min(1), consumptionAccountId: z.string().min(1), documentVersionId: z.string().min(1), reason: z.string().trim().min(10).max(4000) }).parse(Object.fromEntries(form));
  await reconcileStockValuation(context.prisma, { usuarioId: context.user.id, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, input);
  revalidatePath("/patrimonio/valorizacao");
  revalidatePath("/patrimonio/materiais");
}
