import { z } from "zod";
import { cache } from "react";
import type { PrismaClient } from "@prisma/client";
import type { DiscoverySection } from "./discovery";

const publicUrl = z.string().url().refine(value => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}, "Informe uma URL pública HTTP ou HTTPS.");
const destination = z.string().max(2000).refine(value =>
  /^\/portal(?:\/|$)/.test(value) && !/[\\\s]/.test(value) || publicUrl.safeParse(value).success,
"Use uma rota /portal/... ou uma URL pública HTTP/HTTPS.");

export const discoverySettingsSchema = z.object({
  title: z.string().trim().min(3).max(120).default("Portal da Transparência"),
  intro: z.string().trim().min(10).max(600).default("Acompanhe como os recursos públicos são arrecadados e utilizados. Escolha um assunto ou use a busca para encontrar o caminho até a informação."),
  publicOrigin: z.union([publicUrl, z.literal("")]).default(""),
  feedbackEnabled: z.boolean().default(true),
  shortcuts: z.array(z.string().min(1).max(100)).max(8).default(["receitas", "despesas", "licitacoes", "contratos", "servidores", "acesso-informacao"]),
  sections: z.array(z.object({
    id: z.string().min(1).max(100), title: z.string().trim().min(3).max(150),
    description: z.string().max(600), legalBasis: z.string().max(500).default(""),
    order: z.number().int().min(0).max(1000), enabled: z.boolean(),
  }).strict()).max(30).default([]),
  items: z.array(z.object({
    id: z.string().min(1).max(100), keywords: z.string().max(500),
  }).strict()).max(200).default([]),
  links: z.array(z.object({
    id: z.string().regex(/^link-[a-z0-9-]{2,60}$/), sectionId: z.string().min(1).max(100),
    title: z.string().trim().min(3).max(200), description: z.string().trim().min(5).max(600),
    href: destination, enabled: z.boolean(), order: z.number().int().min(0).max(1000),
    responsible: z.string().trim().min(3).max(200), reviewedAt: z.iso.date(),
  }).strict()).max(100).default([]),
}).strict().superRefine((value, ctx) => {
  for (const field of ["sections", "items", "links"] as const) {
    if (new Set(value[field].map(item => item.id)).size !== value[field].length) ctx.addIssue({ code: "custom", path: [field], message: "Identificadores duplicados." });
  }
  if (new Set(value.shortcuts).size !== value.shortcuts.length) ctx.addIssue({ code: "custom", path: ["shortcuts"], message: "Atalhos duplicados." });
});

export type DiscoverySettings = z.infer<typeof discoverySettingsSchema>;
export const discoverySettingsKey = "TRANSPARENCY_DISCOVERY_PRESENTATION";

// Deduplicate metadata/page reads in one server render without retaining stale publication settings across requests.
const readDiscoverySettings = cache(async (db: Pick<PrismaClient, "configuracaoParametroInstancia">) => {
  const parameter = await db.configuracaoParametroInstancia.findFirst({ where: { chave: discoverySettingsKey }, orderBy: { createdAt: "asc" }, select: { valor: true } });
  return discoverySettingsSchema.parse(parameter?.valor || {});
});

export async function getDiscoverySettings(db: Pick<PrismaClient, "configuracaoParametroInstancia">) {
  return readDiscoverySettings(db);
}

export function applyDiscoverySettings(sections: DiscoverySection[], settings: DiscoverySettings): DiscoverySection[] {
  return sections.map((section, index) => {
    const override = settings.sections.find(item => item.id === section.id);
    const items = section.items.map(item => ({ ...item, keywords: [...(item.keywords || []), settings.items.find(row => row.id === item.id)?.keywords || ""] }));
    const links = settings.links.filter(item => item.enabled && item.sectionId === section.id).sort((a, b) => a.order - b.order).map(item => ({ ...item, icon: "document", external: /^https?:\/\//i.test(item.href) }));
    return { ...section, title: override?.title || section.title, description: override?.description ?? section.description, legalBasis: override?.legalBasis || "", items: [...items, ...links], enabled: override?.enabled !== false, order: override?.order ?? index * 10 };
  }).filter(section => section.enabled && section.items.length).sort((a, b) => a.order - b.order);
}

export function publicPortalOrigin(settings: DiscoverySettings) {
  const configured = settings.publicOrigin || process.env.NEXT_PUBLIC_PORTAL_URL || process.env.CELERIFLOW_PUBLIC_BASE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://celeriflow.com.br");
  return new URL(publicUrl.parse(/^https?:\/\//i.test(configured) ? configured : `https://${configured}`)).origin;
}
