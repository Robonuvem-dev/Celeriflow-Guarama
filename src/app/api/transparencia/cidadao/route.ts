import { db, databaseConnection } from "@/db/client";
import { checkRateLimit } from "@/lib/platform/rate-limit";
import { createCitizenRequest,consultCitizenRequest,appealCitizenRequest,rateCitizenService } from "@/lib/transparencia/citizen-service";
import {isSameOriginRequest} from "@/lib/transparencia/request-origin";

export async function POST(request:Request){
 if(!isSameOriginRequest(request)) return Response.json({error:"Origem inválida."},{status:403});
 const ip=request.headers.get("x-forwarded-for")?.split(",")[0].trim()||"unknown",limit=checkRateLimit(`transparency-citizen:${ip}`);
 if(!limit.allowed) return Response.json({error:"Muitas solicitações. Tente novamente mais tarde."},{status:429,headers:{"Retry-After":String(limit.retryAfterSeconds)}});
 try{const body=await request.json();
  if(body.operation==="consultar") {const entry=await consultCitizenRequest(db,String(body.protocol||""),String(body.token||""));return entry?Response.json(entry,{headers:{"Cache-Control":"no-store"}}):Response.json({error:"Protocolo ou chave não conferem."},{status:404});}
  if(body.operation==="recorrer")return Response.json(await appealCitizenRequest(db,String(body.protocol||""),String(body.token||""),String(body.message||"")),{headers:{"Cache-Control":"no-store"}});
  if(body.operation==="avaliar")return Response.json(await rateCitizenService(db,String(body.protocol||""),String(body.token||""),body.rating,body.comment),{headers:{"Cache-Control":"no-store"}});
  const receipt=await createCitizenRequest(databaseConnection,body);return Response.json(receipt,{status:201,headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({error:"Não foi possível registrar. Confira os campos e tente novamente."},{status:400});}
}
