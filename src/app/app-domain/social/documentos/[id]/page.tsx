import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { socialIssuedDocuments } from "@/db/schema/social-operation-models";
import { findSocialInstitution } from "@/db/repositories/social/queries";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { assertSocialUnitAccess, resolveSocialAccess } from "@/lib/social/access-policy";
import PrintSocialDocumentButton from "../../requisicoes/[id]/comprovante/PrintSocialDocumentButton";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
export default async function SocialDocumentPage({params}:{params:Promise<{id:string}>}){
  const context=await getTenantContextForModuleOperation("SOCIAL","issueReports"),access=await resolveSocialAccess(context),database=context.database??db;
  const [record]=await database.select().from(socialIssuedDocuments).where(eq(socialIssuedDocuments.id,(await params).id));if(!record)notFound();assertSocialUnitAccess(access,record.unitId);
  const institution=await findSocialInstitution(database);
  await insertAuditEvent(database,{actorUsuarioId:context.user.id,eventType:auditEventTypes.reportIssued,targetType:"SocialIssuedDocument",targetId:record.id});
  return <main className="mx-auto max-w-4xl space-y-4 bg-white p-6 text-slate-900"><PrintSocialDocumentButton/><header className="border-b-2 border-slate-800 pb-3 text-center"><h1 className="text-lg font-bold">{institution?.name||institution?.legalName||"Administração Municipal"}</h1><p className="text-sm">Assistência Social — {[institution?.city,institution?.state].filter(Boolean).join("/")}</p><h2 className="mt-3 font-semibold">{record.model.title}</h2><p className="text-xs">Documento {record.id} · Modelo CelerFlow {record.model.version} · {record.status==="ISSUED"?"Emitido":"Em elaboração"}</p></header>{record.model.sections.map(section=><section key={section.title} className="space-y-2"><h3 className="border-b text-xs font-bold uppercase">{section.title}</h3><dl className="grid gap-3 sm:grid-cols-2">{section.fields.map(field=><div key={field.key} className={field.multiline?"sm:col-span-2":""}><dt className="text-xs font-semibold">{field.label}</dt><dd className="whitespace-pre-wrap break-words border-b py-1 text-sm">{field.type==="date"&&record.values[field.key]?record.values[field.key].split("-").reverse().join("/"):record.values[field.key]||"—"}</dd></div>)}</dl></section>)}<footer className="grid gap-8 pt-10 text-center sm:grid-cols-2">{record.model.signatures.map(signature=><p key={signature} className="border-t pt-2 text-xs">{signature}</p>)}</footer></main>;
}
