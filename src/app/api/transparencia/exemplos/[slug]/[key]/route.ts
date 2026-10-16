import {getTransparencyCollection} from "@/lib/transparencia/consultation-catalog";
import {exampleTransparencyDataset} from "@/lib/transparencia/example-provider";
import {parseTransparencyQuery} from "@/lib/transparencia/query-contract";
import {renderTransparencyFile,byteStream} from "@/lib/transparencia/export-files";
export async function GET(request:Request,{params}:{params:Promise<{slug:string;key:string}>}){
 const {slug,key}=await params,collection=getTransparencyCollection(slug);if(!collection)return new Response(null,{status:404});
 try{const search=new URL(request.url).searchParams;search.set("source","EXEMPLO");const query=parseTransparencyQuery(search),dataset=exampleTransparencyDataset(collection,query),record=dataset.records.find(record=>record.key===key);if(!record)return new Response(null,{status:404});
 const file=await renderTransparencyFile(collection,{...dataset,records:[record]},query,"pdf");return new Response(byteStream(file.bytes),{headers:{"Content-Type":file.contentType,"Content-Disposition":`attachment; filename="exemplo-ficticio-${slug}-${query.year}.pdf"`,"Cache-Control":"no-store"}});
 }catch{return Response.json({error:"Exemplo não encontrado."},{status:400});}
}
