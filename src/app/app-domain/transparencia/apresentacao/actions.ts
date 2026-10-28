"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { discoverySettingsKey, discoverySettingsSchema, getDiscoverySettings } from "@/lib/transparencia/discovery-settings";
import { getTransparencySettings } from "@/lib/transparencia/presentation-settings";
import { publishedTransparencyCatalog } from "@/lib/transparencia/consultation-service";
import { buildTransparencyDiscovery } from "@/lib/transparencia/discovery";
import { publicTransparencyPath } from "@/lib/transparencia/publication-policy";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { and, asc, eq } from "drizzle-orm";
import { systemInstances as instances, instanceParameters } from "@/db/schema/instance-configuration";
import { financialAuditLogs } from "@/db/schema/finance-identity";

export async function saveDiscoveryPresentation(form: FormData): Promise<{ error?: string; success?: boolean }> {
  try {
    const context = await getTenantContextForModuleOperation("TRANSPARENCIA", "update");
    const current = await getDiscoverySettings(db);
    const version = createHash("sha256").update(JSON.stringify(current)).digest("hex");
    if (form.get("version") !== version) return { error: "A apresentação foi alterada por outra pessoa. Atualize a página antes de salvar." };
    const settings = await getTransparencySettings(db);
    const sections = buildTransparencyDiscovery(publishedTransparencyCatalog(settings), settings);
    const text = (key: string) => String(form.get(key) || "");
    const parsed = discoverySettingsSchema.safeParse({
      title: text("title"), intro: text("intro"), publicOrigin: text("publicOrigin"), feedbackEnabled: form.has("feedbackEnabled"), shortcuts: form.getAll("shortcuts"),
      sections: [...current.sections.filter(row => !sections.some(section => section.id === row.id)), ...sections.map(section => ({ id: section.id, title: text(`section.${section.id}.title`), description: text(`section.${section.id}.description`), legalBasis: text(`section.${section.id}.legalBasis`), enabled: form.has(`section.${section.id}.enabled`), order: Number(form.get(`section.${section.id}.order`)) }))],
      items: [...current.items.filter(row => !sections.some(section => section.items.some(item => item.id === row.id))), ...sections.flatMap(section => section.items.map(item => ({ id: item.id, keywords: text(`item.${item.id}.keywords`) })))],
      links: form.getAll("linkIds").map(value => { const id = String(value); return { id, sectionId: text(`${id}.sectionId`), title: text(`${id}.title`), description: text(`${id}.description`), href: text(`${id}.href`).trim(), enabled: form.has(`${id}.enabled`), order: Number(form.get(`${id}.order`)), responsible: text(`${id}.responsible`), reviewedAt: text(`${id}.reviewedAt`) }; }),
    });
    if (!parsed.success) return { error: parsed.error.issues.slice(0, 3).map(issue => `${issue.path.join(".")}: ${issue.message}`).join(" · ") };
    const knownSections = new Set(sections.map(section => section.id));
    if (parsed.data.links.some(link => !knownSections.has(link.sectionId))) return { error: "Um destino foi associado a uma seção que não está disponível." };
    const [instance] = await db.select({ id: instances.id }).from(instances).orderBy(asc(instances.createdAt)).limit(1);
    if (!instance) throw new Error("Instância não configurada.");
    await withDatabaseTransaction(databaseConnection, async tx => {
      const [row] = await tx.select().from(instanceParameters).where(and(eq(instanceParameters.configuracaoInstanciaId, instance.id), eq(instanceParameters.chave, discoverySettingsKey))).limit(1);
      const latest = discoverySettingsSchema.parse(row?.valor || {});
      if (createHash("sha256").update(JSON.stringify(latest)).digest("hex") !== version) throw new Error("Apresentação alterada simultaneamente. Atualize a página.");
      if (row) {
        const changed = await tx.update(instanceParameters).set({ valor: parsed.data }).where(and(eq(instanceParameters.id, row.id), eq(instanceParameters.updatedAt, row.updatedAt))).returning({ id: instanceParameters.id });
        if (changed.length !== 1) throw new Error("Apresentação alterada simultaneamente. Atualize a página.");
      } else await tx.insert(instanceParameters).values({ configuracaoInstanciaId: instance.id, chave: discoverySettingsKey, valor: parsed.data });
      await tx.insert(financialAuditLogs).values({ action: "CONFIGURE_TRANSPARENCY_DISCOVERY", entityType: "ConfiguracaoParametroInstancia", entityId: discoverySettingsKey, authorUsuarioId: context.user.id, payload: { before: current, after: parsed.data } });
    }, { timeoutMs: 5_000 });
    revalidatePath(publicTransparencyPath, "layout");
    revalidatePath("/transparencia/apresentacao");
    revalidatePath("/sitemap.xml");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar a apresentação." };
  }
}
