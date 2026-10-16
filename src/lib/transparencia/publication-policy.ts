import { z } from "zod";
import { getTransparencyCollection } from "./consultation-catalog";
import type { TransparencySettings } from "./presentation-settings";

export const publicationMetadataSchema = z.object({
  title: z.string().trim().min(3).max(250),
  collectionSlug: z.string().refine(value => Boolean(getTransparencyCollection(value))||/^doc-[a-z0-9-]{2,60}$/.test(value), "Consulta desconhecida."),
  entity: z.enum(["prefeitura", "camara"]),
  year: z.coerce.number().int().min(1900).max(2200),
  group: z.string().trim().min(2).max(200),
  referencePeriod: z.string().trim().min(1).max(200),
  version:z.coerce.number().int().min(1).max(10000).default(1),
  documentKind:z.enum(["OUTRO","PCA_CONTRATACOES","PCA_CONTAS","PPA","LDO","LOA","RGF","RREO","DCASP","PMS","PAS","RAG","RDQA","ATA","SIGILO","DESCLASSIFICACAO"]).default("OUTRO"),
  legalStage:z.enum(["REFERENCIA","APRESENTADO","EM_TRAMITACAO","ANALISE_TECNICA","JULGADO","VIGENTE","NAO_APLICAVEL"]).default("REFERENCIA"),
});

export function verifiedPublicationBytes(bytes: Uint8Array, expectedHash: string, hash: (bytes: Uint8Array) => string) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || hash(bytes) !== expectedHash) throw new Error("Arquivo não corresponde ao conteúdo publicado.");
  return bytes;
}

export const publicTransparencyPath = "/portal/portaldatransparencia";
export function isTransparencyCollectionEnabled(slug:string,settings:TransparencySettings){
 return settings.queries[slug]?.enabled!==false&&Boolean(getTransparencyCollection(slug)||settings.customQueries.some(query=>query.slug===slug&&query.enabled));
}

export function isPublicationPublic(entry:{status:string;collectionSlug:string;year:number;entity:string}|null,settings:TransparencySettings){
 return Boolean(entry&&entry.status==="PUBLISHED"&&isTransparencyCollectionEnabled(entry.collectionSlug,settings)&&settings.availableYears.includes(entry.year)&&settings.entities.some(entity=>entity.key===entry.entity&&entity.enabled));
}
