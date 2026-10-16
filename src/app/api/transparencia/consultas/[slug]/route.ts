import { prisma } from "@/lib/prisma";
import { parseTransparencyQuery } from "@/lib/transparencia/query-contract";
import { runTransparencyConsultation,publishedTransparencyCatalog } from "@/lib/transparencia/consultation-service";
import {getTransparencySettings} from "@/lib/transparencia/presentation-settings";
import {getTransparencyCollection} from "@/lib/transparencia/consultation-catalog";
import { renderTransparencyFile, byteStream } from "@/lib/transparencia/export-files";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const search = new URL(request.url).searchParams;
  const requestedFormat=search.get("format");if(requestedFormat&&!["csv","txt","xlsx","pdf","docx","jpeg","json","schema"].includes(requestedFormat))return Response.json({error:"Formato de exportação não suportado."},{status:400});
  let query;
  try { query = parseTransparencyQuery(search); } catch { return Response.json({ error: "Filtros inválidos." }, { status: 400 }); }
  try {
    if(requestedFormat==="schema"){
      const settings=await getTransparencySettings(prisma),definition=publishedTransparencyCatalog(settings).find(collection=>collection.slug===slug);if(!definition)return new Response(null,{status:404});
      const collection=query.source==="DOCUMENTOS"?{...getTransparencyCollection("publicacoes")!,slug,title:definition.title}:definition;
      return Response.json({title:collection.title,source:query.source,columns:collection.columns.map(column=>({...column,type:column.kind==="money"?"decimal textual com duas casas":column.kind==="date"?"data ISO YYYY-MM-DD":column.kind==="number"?"número":"texto"})),filters:collection.filters,periodField:collection.periodField||"date",pagination:"Página começa em 1; CSV/PDF/XLSX/TXT/DOCX/JSON/JPEG exportam o conjunto completo filtrado. JPEG é um ZIP de páginas, limitado a 1.000 registros.",missingData:"null = campo não informado; total financeiro com campo ausente não vira zero.",provenance:"API de Ibema, dados nativos, documentos e exemplos fictícios são fontes separadas."});
    }
    const result = await runTransparencyConsultation(prisma, slug, query);
    if(result.status==="NOT_ADOPTED")return Response.json({status:result.status,source:result.source,message:result.message,declarationLinks:result.declarationLinks,records:[],totals:result.totals},{headers:{"Cache-Control":"no-store"}});
    if (result.status !== "AVAILABLE" || !result.complete) return Response.json({ status: result.status, error: result.message || "Fonte indisponível.", source: result.source }, { status: 503 });
    const format=search.get("format");
    if (format && ["csv","txt","xlsx","pdf","docx","jpeg"].includes(format)) {
      const file=await renderTransparencyFile(result.collection,{...result,records:result.rows},query,format as "csv"|"txt"|"xlsx"|"pdf"|"docx"|"jpeg");
      return new Response(byteStream(file.bytes),{headers:{"Content-Type":file.contentType,"Content-Disposition":`attachment; filename="${slug}-${query.source}-${query.entity}-${query.year}.${format==="jpeg"?"jpeg.zip":format}"`,"Cache-Control":"no-store"}});
    }
    if(format==="json") return Response.json({source:result.source,provenance:result.provenance,query,totals:result.totals,total:result.total,records:result.rows},{headers:{"Cache-Control":"no-store","Content-Disposition":`attachment; filename="${slug}-${query.year}.json"`}});
    return Response.json({ collection: result.collection, query: result.query, records: result.records, source: result.source, provenance: result.provenance, updatedAt: result.updatedAt, status: result.status, complete: result.complete, total: result.total, totals: result.totals, page: result.page, pageSize: result.pageSize }, { headers: { "Cache-Control": "no-store" } });
  } catch(error) { console.error("[transparencia] Consulta/exportação não concluída:",error instanceof Error?error.message:"falha desconhecida");return Response.json({ error: "Consulta indisponível ou filtros não permitidos." }, { status: 400 }); }
}
