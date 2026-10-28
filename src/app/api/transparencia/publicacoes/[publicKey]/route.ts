import { createHash } from "node:crypto";
import { db } from "@/db/client";
import { readPublicationByPublicKey } from "@/db/repositories/transparency/publications";
import { getFile, isInstanceDocumentPath, downloadFilename } from "@/lib/platform/blob";
import { getTransparencySettings } from "@/lib/transparencia/presentation-settings";
import { verifiedPublicationBytes,isPublicationPublic } from "@/lib/transparencia/publication-policy";
import { byteStream } from "@/lib/transparencia/export-files";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { readFrozenControlReportBytes } from "@/lib/c7/circumstantiated-report";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ publicKey: string }> }) {
  const { publicKey } = await params;
  const entry = await readPublicationByPublicKey(db, publicKey);
  const settings = await getTransparencySettings(db);
   const preview=new URL(request.url).searchParams.get("preview")==="1";
   if(preview){try{await getTenantContextForModule("TRANSPARENCIA");}catch{return Response.json({error:"Acesso não autorizado."},{status:403});}}
    if (!entry || !preview && !isPublicationPublic(entry,settings)) return Response.json({ error: "Publicação não disponível." }, { status: 404 });
    if (entry.id.startsWith("control-report:")) {
      try {
        const finalId = entry.id.slice("control-report:".length);
        const file = await readFrozenControlReportBytes(db, finalId);
        if (file.sha256 !== entry.sha256 || entry.publicKey !== `control-report-${finalId}` || !settings.entities.some(entity => entity.key === entry.entity && entity.nativeIds.includes(file.governmentEntityId)) || file.input.year !== entry.year || (file.input.requiresDigitalSignature && file.signatureStatus !== "DIGITALLY_SIGNED")) throw new Error("Publicação divergente do relatório final.");
        if (new URL(request.url).searchParams.get("format") === "SIGNATURE") {
          if (!file.signature) return Response.json({ error: "Sem assinatura A1 destacada." }, { status: 404 });
          return Response.json(file.signature, { headers: { "Content-Disposition": `attachment; filename="controle-${finalId}-assinatura.json"`, "Cache-Control": "no-store" } });
        }
        return new Response(new Uint8Array(file.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="controle-${finalId}.pdf"`, "Cache-Control": "no-store", "X-Content-SHA256": file.sha256, "X-Content-Type-Options": "nosniff" } });
      } catch { return Response.json({ error: "Integridade do documento final não confirmada." }, { status: 503 }); }
    }
   if(entry.linkUrl){const link=new URL(entry.linkUrl);if(!["http:","https:"].includes(link.protocol))return new Response(null,{status:404});return new Response(null,{status:307,headers:{Location:link.toString(),"Cache-Control":"no-store"}});}
  if (!entry.fileUrl || !entry.sha256 || !entry.filePathname || !isInstanceDocumentPath(entry.filePathname)) return Response.json({ error: "Arquivo não disponível." }, { status: 404 });
  const file = await getFile(entry.fileUrl);
  if (!file || file.blob.pathname !== entry.filePathname) return Response.json({ error: "Armazenamento indisponível." }, { status: 503 });
  try {
    const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
    verifiedPublicationBytes(bytes, entry.sha256, value => createHash("sha256").update(value).digest("hex"));
     return new Response(byteStream(bytes), { headers: { "Content-Type": entry.contentType || "application/octet-stream", "Content-Disposition": `attachment; filename="${downloadFilename(entry.filename || entry.filePathname)}"`, "Cache-Control": "no-store", "X-Content-SHA256": entry.sha256, "X-Content-Type-Options": "nosniff" } });
  } catch {
    return Response.json({ error: "Integridade do arquivo não confirmada." }, { status: 503 });
  }
}
