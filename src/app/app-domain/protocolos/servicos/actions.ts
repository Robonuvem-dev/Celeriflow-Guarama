"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProtocolContextForOperation } from "@/lib/protocols/access";
import { saveDigitalService } from "@/lib/portal-cidadao/catalog";
import { programPortalRequests, finishPortalSchedule } from "@/lib/portal-cidadao/scheduling";
import { portalServiceTemplates } from "@/lib/portal-cidadao/service-templates";

function refresh() { revalidatePath("/portal/servicos"); revalidatePath("/portal/minha-area", "layout"); revalidatePath("/app-domain/protocolos/servicos", "layout"); }

export async function prepareServiceTemplatesAction(): Promise<{ error: string | null }> {
  try { const context = await getProtocolContextForOperation("update"); if (!context.protocolAccess.isAdmin) throw new Error("Modelos exigem administração."); for (const template of portalServiceTemplates) if (!await context.prisma.portalServiceConfiguration.findUnique({ where: { slug: template.slug }, select: { id: true } })) await saveDigitalService(context.prisma, context.user.id, template); refresh(); return { error: null }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível preparar os modelos." }; }
}

export async function saveDigitalServiceAction(raw: unknown): Promise<{ error: string | null }> {
  try {
    const context = await getProtocolContextForOperation("update");
    if (!context.protocolAccess.isAdmin) throw new Error("A publicação do catálogo exige administração.");
    await saveDigitalService(context.prisma, context.user.id, raw); refresh(); return { error: null };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar." }; }
}

export async function programServiceRequestsAction(raw: unknown, previousId?: string): Promise<{ error: string | null }> {
  try { await programPortalRequests(await getProtocolContextForOperation("update"), raw, previousId); refresh(); return { error: null }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível programar." }; }
}

export async function finishServiceScheduleAction(id: string, raw: unknown): Promise<{ error: string | null }> {
  try { await finishPortalSchedule(await getProtocolContextForOperation("update"), id, raw); refresh(); return { error: null }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar." }; }
}

export async function saveServiceNoticeAction(raw: unknown): Promise<{ error: string | null }> {
  try {
    const context = await getProtocolContextForOperation("update");
    if (!context.protocolAccess.isAdmin) throw new Error("Avisos exigem administração.");
    const input = z.object({ title: z.string().trim().min(3).max(160), text: z.string().trim().min(5).max(4000), audience: z.enum(["PUBLICO", "LOGADO"]), popup: z.boolean(), startsAt: z.iso.datetime(), endsAt: z.iso.datetime() }).strict().refine((value) => new Date(value.endsAt) > new Date(value.startsAt), "Vigência inválida.").parse(raw);
    await context.prisma.portalServiceNotice.create({ data: { ...input, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), createdById: context.user.id } }); refresh(); return { error: null };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível publicar o aviso." }; }
}
