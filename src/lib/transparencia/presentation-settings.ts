import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { MUNICIPALITY_NAME, MUNICIPALITY_INSTITUTION_NAME } from "@/lib/municipality-identity";
import { transparencySources } from "./query-contract";
export const transparencySettingsSchema = z.object({
  initialYear: z.number().int().min(1900).max(2200), availableYears: z.array(z.number().int().min(1900).max(2200)).min(1).max(100), defaultSource: z.enum(transparencySources),
  countAccess: z.boolean(), nativePersonnelPublication: z.boolean().default(false), openingHours: z.string().max(500), radarUrl: z.string().url(),
  entities: z.array(z.object({ key: z.enum(["prefeitura", "camara"]), name: z.string().min(3).max(250), enabled: z.boolean(), nativeIds: z.array(z.string().min(1)), externalCode: z.number().int().positive().nullable() }).strict()).length(2),
  queries: z.record(z.string(), z.object({ enabled: z.boolean(), title: z.string().max(200).optional(), hint: z.string().max(4000).optional(), order: z.number().int().min(0).max(1000).optional() }).strict()),
  customQueries:z.array(z.object({slug:z.string().regex(/^doc-[a-z0-9-]{2,60}$/),title:z.string().min(3).max(200),group:z.string().min(3).max(200),description:z.string().max(4000),enabled:z.boolean()}).strict()).max(100).default([]),
  citizenService:z.object({unit:z.string().max(250),address:z.string().max(500),phone:z.string().max(100),email:z.union([z.email(),z.literal("")]),openingHours:z.string().max(500),responsibleAuthority:z.string().max(250),appealAuthority:z.string().max(250),localLaiNormUrl:z.union([z.url(),z.literal("")]),ticketChannelId:z.string().nullable(),ombudsmanChannelId:z.string().nullable(),departmentId:z.string().nullable()}).strict().default({unit:"",address:"",phone:"",email:"",openingHours:"",responsibleAuthority:"",appealAuthority:"",localLaiNormUrl:"",ticketChannelId:null,ombudsmanChannelId:null,departmentId:null}),
  availabilityDeclarations:z.array(z.object({collectionSlug:z.string().min(1),entity:z.enum(["prefeitura","camara"]),year:z.number().int().min(1900).max(2200),source:z.enum(transparencySources),filterType:z.string().max(200).default(""),status:z.enum(["NOT_ADOPTED","NOT_PUBLISHED"]),reason:z.string().trim().min(20).max(4000),documentPublicKey:z.string().min(1).max(100)}).strict()).max(500).default([]),
  popup: z.object({ title: z.string().max(200), text: z.string().max(4000), imageUrl: z.string().url().nullable(), startsAt: z.iso.datetime().nullable(), endsAt: z.iso.datetime().nullable(), enabled: z.boolean(),entities:z.array(z.enum(["prefeitura","camara","consolidado"])).default(["prefeitura","camara","consolidado"]),frequency:z.enum(["VISIT","SESSION","DAILY"]).default("VISIT") }).strict(),
}).strict().refine(value => value.entities.some(entity=>entity.enabled)&&new Set(value.customQueries.map(query=>query.slug)).size===value.customQueries.length&&new Set(value.entities.map(entity => entity.key)).size === 2 && new Set(value.availableYears).size === value.availableYears.length && value.availableYears.every(year => year >= value.initialYear) && new Set(value.entities.flatMap(entity=>entity.nativeIds)).size===value.entities.reduce((sum,entity)=>sum+entity.nativeIds.length,0)&&(!value.popup.startsAt||!value.popup.endsAt||value.popup.endsAt>=value.popup.startsAt), "Entidades, consultas, vínculos nativos, anos ou vigência de aviso inconsistentes.");
export type TransparencySettings = z.infer<typeof transparencySettingsSchema>;
export const transparencySettingsKey = "TRANSPARENCY_PUBLIC_PRESENTATION";
export function defaultTransparencySettings(): TransparencySettings {
   // Câmara: código confirmado em camaraibema.pr.gov.br/portal-da-transparencia/,
   // link oficial "Informações a partir de 2023" aponta para ?entidade=2.
   return transparencySettingsSchema.parse({ initialYear: 2025, availableYears: [2026, 2025], defaultSource: "API_IBEMA", countAccess: false, nativePersonnelPublication: false, openingHours: "", radarUrl: "https://pntp.atricon.org.br/consultar/", entities: [{ key: "prefeitura", name: MUNICIPALITY_INSTITUTION_NAME, enabled: true, nativeIds: [], externalCode: 1 }, { key: "camara", name: `Câmara Municipal de ${MUNICIPALITY_NAME}`, enabled: true, nativeIds: [], externalCode: 2 }], queries: {},customQueries:[], popup: { title: "", text: "", imageUrl: null, startsAt: null, endsAt: null, enabled: false } });
}
export async function getTransparencySettings(db: Pick<PrismaClient, "configuracaoParametroInstancia">) {
  const parameter = await db.configuracaoParametroInstancia.findFirst({ where: { chave: transparencySettingsKey }, orderBy: { createdAt: "asc" }, select: { valor: true } });
  if (!parameter) return defaultTransparencySettings();
  return transparencySettingsSchema.parse(parameter.valor);
}
