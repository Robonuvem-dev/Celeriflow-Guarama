"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { getTransparencySettings, transparencySettingsKey, transparencySettingsSchema } from "@/lib/transparencia/presentation-settings";
import { transparencyCatalog } from "@/lib/transparencia/consultation-catalog";
import { getFile, deleteUploadedDocument } from "@/lib/platform/blob";
import { createHash } from "node:crypto";
import { verifiedPublicationBytes, publicTransparencyPath, publicationMetadataSchema,isTransparencyCollectionEnabled } from "@/lib/transparencia/publication-policy";
import {z} from "zod";
import {runTransparencyConsultation} from "@/lib/transparencia/consultation-service";
import {parseTransparencyQuery} from "@/lib/transparencia/query-contract";
import {renderTransparencyFile} from "@/lib/transparencia/export-files";
import {uploadGeneratedFinancialFile} from "@/lib/platform/blob";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { transparencyPublications } from "@/db/schema/transparency";
import { systemInstances, instanceParameters } from "@/db/schema/instance-configuration";
import { governmentEntities } from "@/db/schema/master-data";
import { departments } from "@/db/schema/administration";
import { supportChannels } from "@/db/schema/attendance-portals";
import { financialAuditLogs } from "@/db/schema/finance-identity";

async function publication(id: string) {
  const [row] = await db.select().from(transparencyPublications).where(eq(transparencyPublications.id, id)).limit(1);
  if (!row) throw new Error("Publicação não encontrada.");
  return row;
}

async function saveSettingsParameter(value: unknown) {
  const [instance] = await db.select({ id: systemInstances.id }).from(systemInstances).orderBy(asc(systemInstances.createdAt)).limit(1);
  if (!instance) throw new Error("Instância não configurada.");
  await db.insert(instanceParameters).values({ configuracaoInstanciaId: instance.id, chave: transparencySettingsKey, valor: value }).onConflictDoUpdate({ target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave], set: { valor: value } });
}

export async function saveTransparencySettings(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("TRANSPARENCIA", "update");
  const current = await getTransparencySettings(db);
  const settings = transparencySettingsSchema.parse({ ...current,
    initialYear: Number(form.get("initialYear")), availableYears: String(form.get("availableYears")).split(",").map(value => Number(value.trim())),
    defaultSource: form.get("defaultSource"), openingHours: String(form.get("openingHours") || ""),countAccess:form.has("countAccess"),nativePersonnelPublication:form.has("nativePersonnelPublication"),radarUrl:String(form.get("radarUrl")||current.radarUrl),
    citizenService:{...current.citizenService,...Object.fromEntries(["unit","address","phone","email","openingHours","responsibleAuthority","appealAuthority","localLaiNormUrl"].map(key=>[key,String(form.get(`citizen.${key}`)||"")])),ticketChannelId:form.get("citizen.ticketChannelId")?String(form.get("citizen.ticketChannelId")):null,ombudsmanChannelId:form.get("citizen.ombudsmanChannelId")?String(form.get("citizen.ombudsmanChannelId")):null,departmentId:form.get("citizen.departmentId")?String(form.get("citizen.departmentId")):null},
    entities: current.entities.map(entity => ({ ...entity, name: String(form.get(`${entity.key}.name`)), enabled: form.has(`${entity.key}.enabled`), nativeIds: String(form.get(`${entity.key}.nativeIds`) || "").split(",").map(value => value.trim()).filter(Boolean), externalCode: form.get(`${entity.key}.externalCode`) ? Number(form.get(`${entity.key}.externalCode`)) : null })),
    queries: Object.fromEntries(transparencyCatalog.map(collection => [collection.slug, { enabled: form.has(`query.${collection.slug}`),title:String(form.get(`title.${collection.slug}`)||collection.title),hint:String(form.get(`hint.${collection.slug}`)||collection.description),order:Number(form.get(`order.${collection.slug}`)||0) }])),
    popup:{enabled:form.has("popup.enabled"),title:String(form.get("popup.title")||""),text:String(form.get("popup.text")||""),imageUrl:form.get("popup.imageUrl")?String(form.get("popup.imageUrl")):null,startsAt:form.get("popup.startsAt")?new Date(String(form.get("popup.startsAt"))).toISOString():null,endsAt:form.get("popup.endsAt")?new Date(String(form.get("popup.endsAt"))).toISOString():null,entities:form.getAll("popup.entities"),frequency:String(form.get("popup.frequency")||current.popup.frequency)},
  });
  const nativeIds=settings.entities.flatMap(entity=>entity.nativeIds);
  if(nativeIds.length&&(await db.select({total:count()}).from(governmentEntities).where(inArray(governmentEntities.id,nativeIds)))[0].total!==nativeIds.length)throw new Error("Uma entidade nativa informada não existe. Utilize os IDs do cadastro de entidades.");
  for(const channelId of [settings.citizenService.ticketChannelId,settings.citizenService.ombudsmanChannelId])if(channelId&&!(await db.select({id:supportChannels.id}).from(supportChannels).where(and(eq(supportChannels.id,channelId),eq(supportChannels.isActive,true))).limit(1)).length)throw new Error("Canal de Atendimento não encontrado/ativo.");
  if(settings.citizenService.departmentId&&!(await db.select({id:departments.id}).from(departments).where(eq(departments.id,settings.citizenService.departmentId)).limit(1)).length)throw new Error("Departamento responsável não encontrado.");
  await saveSettingsParameter(settings);
  await db.insert(financialAuditLogs).values({action:"CONFIGURE_TRANSPARENCY_PORTAL",entityType:"ConfiguracaoParametroInstancia",entityId:transparencySettingsKey,authorUsuarioId:context.user.id,payload:{availableYears:settings.availableYears,countAccess:settings.countAccess}});
  revalidatePath("/transparencia/publicacoes"); revalidatePath(publicTransparencyPath);
}

export async function changePublicationStatus(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("TRANSPARENCIA", "update");
  const id = String(form.get("id") || ""), status = String(form.get("status"));
  if (!["PUBLISHED", "WITHDRAWN"].includes(status)) throw new Error("Estado de publicação inválido.");
  const entry = await publication(id);
  if (status === "PUBLISHED") {
    if (entry.status !== "DRAFT") throw new Error("Só rascunhos podem ser publicados. Para nova versão, faça um novo upload.");
    if(entry.linkUrl){const url=new URL(entry.linkUrl);if(!["http:","https:"].includes(url.protocol))throw new Error("Link inválido.");}
    else {if (!entry.fileUrl || !entry.sha256) throw new Error("Publicação sem arquivo confirmado.");
    const file = await getFile(entry.fileUrl);
    if (!file || file.blob.pathname !== entry.filePathname) throw new Error("Arquivo indisponível.");
    verifiedPublicationBytes(new Uint8Array(await new Response(file.stream).arrayBuffer()), entry.sha256, bytes => createHash("sha256").update(bytes).digest("hex"));}
  } else if (entry.status !== "PUBLISHED") throw new Error("Só publicações disponíveis podem ser retiradas.");
  await withDatabaseTransaction(databaseConnection,async tx=>{const changed = await tx.update(transparencyPublications).set({ status, ...(status === "PUBLISHED" ? { publishedAt: new Date() } : { withdrawnAt: new Date() }) }).where(and(eq(transparencyPublications.id,id),eq(transparencyPublications.status,entry.status))).returning({id:transparencyPublications.id});
  if (changed.length !== 1) throw new Error("Publicação alterada por outro usuário. Atualize a página.");
  await tx.insert(financialAuditLogs).values({action:status==="PUBLISHED"?"PUBLISH_TRANSPARENCY_DOCUMENT":"WITHDRAW_TRANSPARENCY_DOCUMENT",entityType:"TransparencyPublication",entityId:id,authorUsuarioId:context.user.id,payload:{status,sha256:entry.sha256}});},{timeoutMs:5_000});
  revalidatePath("/transparencia/publicacoes"); revalidatePath(publicTransparencyPath);
}

export async function editPublicationMetadata(form:FormData):Promise<void>{
 const context=await getTenantContextForModuleOperation("TRANSPARENCIA","update"),id=String(form.get("id")||"");
 const metadata=publicationMetadataSchema.parse(Object.fromEntries(["title","collectionSlug","entity","year","group","referencePeriod"].map(key=>[key,form.get(key)])));
  const current=await publication(id);
 if(current.status==="WITHDRAWN")throw new Error("Registro retirado é preservado; envie nova versão.");
  const settings=await getTransparencySettings(db);if(!settings.availableYears.includes(metadata.year))throw new Error("Exercício não configurado.");
  await withDatabaseTransaction(databaseConnection,async tx=>{const changed=await tx.update(transparencyPublications).set({...metadata,documentKind:current.documentKind,legalStage:current.legalStage,version:current.version,order:Math.max(0,Math.min(10000,Number(form.get("order"))||0))}).where(and(eq(transparencyPublications.id,id),eq(transparencyPublications.updatedAt,current.updatedAt))).returning({id:transparencyPublications.id});if(changed.length!==1)throw new Error("Registro alterado simultaneamente.");await tx.insert(financialAuditLogs).values({action:"EDIT_TRANSPARENCY_METADATA",entityType:"TransparencyPublication",entityId:id,authorUsuarioId:context.user.id,payload:{before:{title:current.title,group:current.group,year:current.year},after:{...metadata,documentKind:current.documentKind,legalStage:current.legalStage,version:current.version}}});},{timeoutMs:5_000});
 revalidatePath("/transparencia/publicacoes");revalidatePath(publicTransparencyPath);
}
export async function deletePublicationDraft(form:FormData):Promise<void>{
 const context=await getTenantContextForModuleOperation("TRANSPARENCIA","delete"),id=String(form.get("id")||"");
  const entry=await publication(id);if(entry.status!=="DRAFT")throw new Error("Só rascunhos podem ser excluídos.");
  await withDatabaseTransaction(databaseConnection,async tx=>{const deleted=await tx.delete(transparencyPublications).where(and(eq(transparencyPublications.id,id),eq(transparencyPublications.status,"DRAFT"))).returning({id:transparencyPublications.id});if(deleted.length!==1)throw new Error("Rascunho alterado por outro usuário. Atualize a página.");await tx.insert(financialAuditLogs).values({action:"DELETE_TRANSPARENCY_DRAFT",entityType:"TransparencyPublication",entityId:id,authorUsuarioId:context.user.id,payload:{sha256:entry.sha256}});},{timeoutMs:5_000});
 if(entry.fileUrl&&entry.filePathname)await deleteUploadedDocument({url:entry.fileUrl,pathname:entry.filePathname});revalidatePath("/transparencia/publicacoes");
}

export async function configureDocumentQuery(form:FormData):Promise<void>{
  const context=await getTenantContextForModuleOperation("TRANSPARENCIA","update"),settings=await getTransparencySettings(db);
 const query=z.object({slug:z.string().regex(/^doc-[a-z0-9-]{2,60}$/),title:z.string().trim().min(3).max(200),group:z.string().trim().min(3).max(200),description:z.string().max(4000),enabled:z.boolean()}).parse({slug:form.get("slug"),title:form.get("title"),group:form.get("group"),description:String(form.get("description")||""),enabled:form.has("enabled")});
 const next=transparencySettingsSchema.parse({...settings,customQueries:[...settings.customQueries.filter(item=>item.slug!==query.slug),query]});
  await saveSettingsParameter(next);
  await db.insert(financialAuditLogs).values({action:"CONFIGURE_DOCUMENT_QUERY",entityType:"TransparencyQuery",entityId:query.slug,authorUsuarioId:context.user.id,payload:query});revalidatePath("/transparencia/publicacoes");revalidatePath(publicTransparencyPath);
}
export async function createExternalPublication(form:FormData):Promise<void>{
  await getTenantContextForModuleOperation("TRANSPARENCIA","create");const settings=await getTransparencySettings(db);
 const metadata=publicationMetadataSchema.parse(Object.fromEntries(["title","collectionSlug","entity","year","group","referencePeriod"].map(key=>[key,form.get(key)]))),linkUrl=z.url().refine(value=>["http:","https:"].includes(new URL(value).protocol)).parse(form.get("linkUrl"));
 if(!settings.availableYears.includes(metadata.year))throw new Error("Exercício não configurado.");
 if(!isTransparencyCollectionEnabled(metadata.collectionSlug,settings))throw new Error("Consulta não configurada/habilitada.");
  await db.insert(transparencyPublications).values({...metadata,source:"DOCUMENTOS",values:{origin:"Link de publicação cadastrado pela gestão; bytes não arquivados no Blob"},linkUrl,contentType:"Link externo"});revalidatePath("/transparencia/publicacoes");
}

export async function registerAvailabilityDeclaration(form:FormData):Promise<void>{
  const context=await getTenantContextForModuleOperation("TRANSPARENCIA","update"),settings=await getTransparencySettings(db);
 const declaration=transparencySettingsSchema.shape.availabilityDeclarations.unwrap().element.parse({collectionSlug:form.get("collectionSlug"),entity:form.get("entity"),year:Number(form.get("year")),source:form.get("source"),filterType:String(form.get("filterType")||""),status:form.get("status"),reason:form.get("reason"),documentPublicKey:form.get("documentPublicKey")});
 if(!isTransparencyCollectionEnabled(declaration.collectionSlug,settings))throw new Error("Consulta não configurada.");
  if(!(await db.select({id:transparencyPublications.id}).from(transparencyPublications).where(and(eq(transparencyPublications.publicKey,declaration.documentPublicKey),eq(transparencyPublications.entity,declaration.entity),eq(transparencyPublications.year,declaration.year),eq(transparencyPublications.status,"PUBLISHED"))).limit(1)).length)throw new Error("Declaração sem documento público disponível.");
 const same=(row:typeof declaration)=>row.collectionSlug===declaration.collectionSlug&&row.entity===declaration.entity&&row.year===declaration.year&&row.source===declaration.source&&row.filterType===declaration.filterType;
 const next=transparencySettingsSchema.parse({...settings,availabilityDeclarations:[...settings.availabilityDeclarations.filter(row=>!same(row)),declaration]});
  await saveSettingsParameter(next);
  await db.insert(financialAuditLogs).values({action:"DECLARE_TRANSPARENCY_AVAILABILITY",entityType:"TransparencyQuery",entityId:declaration.collectionSlug,authorUsuarioId:context.user.id,payload:declaration});revalidatePath("/transparencia/publicacoes");revalidatePath(publicTransparencyPath);
}
export async function clearAvailabilityDeclaration(form:FormData):Promise<void>{
  const context=await getTenantContextForModuleOperation("TRANSPARENCIA","update"),settings=await getTransparencySettings(db);
 const key=transparencySettingsSchema.shape.availabilityDeclarations.unwrap().element.pick({collectionSlug:true,entity:true,year:true,source:true,filterType:true}).parse({collectionSlug:form.get("collectionSlug"),entity:form.get("entity"),year:Number(form.get("year")),source:form.get("source"),filterType:String(form.get("filterType")||"")});
 const next={...settings,availabilityDeclarations:settings.availabilityDeclarations.filter(row=>!(row.collectionSlug===key.collectionSlug&&row.entity===key.entity&&row.year===key.year&&row.source===key.source&&row.filterType===key.filterType))};
  await saveSettingsParameter(next);await db.insert(financialAuditLogs).values({action:"CLEAR_AVAILABILITY_DECLARATION",entityType:"TransparencyQuery",entityId:key.collectionSlug,authorUsuarioId:context.user.id,payload:key});revalidatePath("/transparencia/publicacoes");revalidatePath(publicTransparencyPath);
}
export async function archivePublicConsultationReport(form:FormData):Promise<void>{
  await getTenantContextForModuleOperation("TRANSPARENCIA","create");const slug=String(form.get("collectionSlug")),format=z.enum(["pdf","csv","xlsx","txt","docx","jpeg"]).parse(form.get("format"));
 const query=parseTransparencyQuery(new URLSearchParams({entity:String(form.get("entity")),source:String(form.get("source")),year:String(form.get("year")),...(form.get("from")?{from:String(form.get("from"))}:{}),...(form.get("until")?{until:String(form.get("until"))}:{}),...(form.get("search")?{search:String(form.get("search"))}:{})}));
  const dataset=await runTransparencyConsultation(db,slug,query);if(dataset.status!=="AVAILABLE"||!dataset.complete)throw new Error("Fonte não confirmada para geração preservada.");
 const file=await renderTransparencyFile(dataset.collection,{...dataset,records:dataset.rows},query,format),sha256=createHash("sha256").update(file.bytes).digest("hex"),filename=`${slug}-${query.source}-${query.year}.${format==="jpeg"?"jpeg.zip":format}`;
 const blob=await uploadGeneratedFinancialFile(filename,file.bytes,file.contentType);try{const stored=await getFile(blob.url);if(!stored||createHash("sha256").update(Buffer.from(await new Response(stored.stream).arrayBuffer())).digest("hex")!==sha256)throw new Error("Arquivo gerado não confirmado no Blob.");
  await db.insert(transparencyPublications).values({collectionSlug:slug,entity:query.entity==="camara"?"camara":"prefeitura",year:query.year,title:`${dataset.collection.title} — ${query.source} — ${query.entity}`,group:"Relatórios gerados / consultas",referencePeriod:`${query.from||query.year} a ${query.until||query.year}`,source:query.source==="NATIVO"?"NATIVO":"DOCUMENTOS",values:{origin:dataset.provenance,sourceReference:JSON.stringify(query),artifactKind:"CONSULTATION_REPORT",scope:query.entity,sizeBytes:file.bytes.length,recordCount:dataset.total},fileUrl:blob.url,filePathname:blob.pathname,filename,contentType:file.contentType,sha256});}catch(error){await deleteUploadedDocument(blob);throw error;}
 revalidatePath("/transparencia/publicacoes");
}
export async function classifyPublicDocument(form:FormData):Promise<void>{
 const context=await getTenantContextForModuleOperation("TRANSPARENCIA","update"),id=String(form.get("id")||""),classification=publicationMetadataSchema.pick({documentKind:true,legalStage:true}).parse({documentKind:form.get("documentKind"),legalStage:form.get("legalStage")});
  const reference=z.string().trim().min(10).max(2000).parse(form.get("reference"));const row=await publication(id);if(row.status==="WITHDRAWN")throw new Error("Documento retirado é preservado.");if(classification.legalStage==="JULGADO"&&(row.values as Record<string,unknown>).artifactKind==="CONSULTATION_REPORT")throw new Error("Consulta gerada não é decisão de julgamento de contas.");
  await withDatabaseTransaction(databaseConnection,async tx=>{if(!(await tx.update(transparencyPublications).set(classification).where(eq(transparencyPublications.id,id)).returning({id:transparencyPublications.id})).length)throw new Error("Publicação não encontrada.");await tx.insert(financialAuditLogs).values({action:"CLASSIFY_PUBLIC_DOCUMENT_STAGE",entityType:"TransparencyPublication",entityId:id,authorUsuarioId:context.user.id,payload:{...classification,reference}});},{timeoutMs:5_000});revalidatePath("/transparencia/publicacoes");revalidatePath(publicTransparencyPath);
}
