import {createHash} from "node:crypto";
import {prisma} from "@/lib/prisma";
import {getFile,downloadFilename} from "@/lib/platform/blob";
import {getTransparencySettings} from "@/lib/transparencia/presentation-settings";
import {isTransparencyCollectionEnabled} from "@/lib/transparencia/publication-policy";
import {byteStream} from "@/lib/transparencia/export-files";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{publicKey:string}>}){
 const {publicKey}=await params,binding=await prisma.transparencyNativeBinding.findUnique({where:{publicKey}}),settings=await getTransparencySettings(prisma);
 if(!binding||!binding.enabled||binding.sourceType!=="OFFICIAL_DIARY"||!isTransparencyCollectionEnabled(binding.collectionSlug,settings)||!settings.entities.some(entity=>entity.enabled&&entity.nativeIds.includes(binding.governmentEntityId)))return new Response(null,{status:404});
 const diary=await prisma.officialDiary.findUnique({where:{id:binding.sourceId},select:{publishDate:true,status:true,pdfUrl:true,editionNumber:true}});
 if(!diary||!["Publicado","Publicada","PUBLISHED"].includes(diary.status)||!settings.availableYears.includes(diary.publishDate.getUTCFullYear()))return new Response(null,{status:404});
 const url=new URL(diary.pdfUrl);if(!["http:","https:"].includes(url.protocol))return new Response(null,{status:404});
 if(!url.hostname.endsWith(".blob.vercel-storage.com"))return new Response(null,{status:307,headers:{Location:url.toString(),"Cache-Control":"no-store"}});
 const file=await getFile(diary.pdfUrl);if(!file)return Response.json({error:"Arquivo nativo indisponível."},{status:503});const bytes=new Uint8Array(await new Response(file.stream).arrayBuffer());
 if(Buffer.from(bytes.subarray(0,5)).toString()!=="%PDF-")return Response.json({error:"PDF da edição não confirmado."},{status:503});
 return new Response(byteStream(bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${downloadFilename(`diario-${diary.editionNumber}.pdf`)}"`,"X-Content-SHA256":createHash("sha256").update(bytes).digest("hex"),"Cache-Control":"no-store"}});
}
