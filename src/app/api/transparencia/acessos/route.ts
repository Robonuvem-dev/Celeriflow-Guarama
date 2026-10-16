import {isIP} from "node:net";
import {prisma} from "@/lib/prisma";
import {getTransparencySettings} from "@/lib/transparencia/presentation-settings";
import {parseTransparencyQuery} from "@/lib/transparencia/query-contract";
import {publishedTransparencyCatalog} from "@/lib/transparencia/consultation-service";
import {checkRateLimit} from "@/lib/platform/rate-limit";
import {isSameOriginRequest} from "@/lib/transparencia/request-origin";
export async function POST(request:Request){
 if(!isSameOriginRequest(request)) return new Response(null,{status:403});
 const settings=await getTransparencySettings(prisma);if(!settings.countAccess)return new Response(null,{status:204});
 const forwarded=request.headers.get("x-forwarded-for")?.split(",")[0].trim()||request.headers.get("x-real-ip")||"",ip=isIP(forwarded)?forwarded:"unknown";
 if(!checkRateLimit(`transparency-access:${ip}`).allowed)return new Response(null,{status:204});
 try{const body=await request.json(),query=parseTransparencyQuery(new URLSearchParams(body.query)),collection=publishedTransparencyCatalog(settings).find(collection=>collection.slug===String(body.slug));if(!collection)return new Response(null,{status:400});
 await prisma.transparencyAccess.create({data:{collectionSlug:collection.slug,entity:query.entity,source:query.source,year:query.year,ip}});
 // Retenção móvel de 90 dias: não é contagem de pessoas únicas.
 await prisma.transparencyAccess.deleteMany({where:{createdAt:{lt:new Date(Date.now()-90*86400000)}}});
 return new Response(null,{status:204});}catch{return new Response(null,{status:400});}
}
