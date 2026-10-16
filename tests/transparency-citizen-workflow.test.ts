import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import type {PrismaClient} from "@prisma/client";
import {createCitizenRequest,consultCitizenRequest,appealCitizenRequest,rateCitizenService} from "../src/lib/transparencia/citizen-service";

function fixture(){
 const token="a".repeat(64),hash=createHash("sha256").update(token).digest("hex"),protocol="2026-ABCDEF123456";let stored:Record<string,unknown>={id:"request-one",protocol,accessHash:hash,type:"ESIC",status:"RESPONDIDO",respondedAt:new Date(),appeals:[],nativeTicket:null,nativeOmbudsman:null};let created:Record<string,unknown>|null=null;const scores=new Map<string,unknown>();
 const fake={configuracaoParametroInstancia:{findFirst:async()=>null},transparencyCitizenRequest:{create:async({data}:{data:Record<string,unknown>})=>{created=data;return data;},findFirst:async({where}:{where:Record<string,unknown>})=>where.accessHash===stored.accessHash?stored:null,findUniqueOrThrow:async()=>({id:"request-one"})},transparencyCitizenAppeal:{create:async({data}:{data:Record<string,unknown>})=>{const list=stored.appeals as unknown[];list.push({...data,respondedAt:null});return data;}},transparencySatisfaction:{upsert:async({where,create,update}:{where:{requestId:string};create:unknown;update:unknown})=>{scores.set(where.requestId,scores.has(where.requestId)?update:create);}}};
  const channel={...fake,processType:{upsert:async()=>({id:"channel-type",isActive:true})},subject:{upsert:async()=>({id:"channel-subject",isActive:true})},processSequence:{upsert:async()=>({nextNumber:2})},process:{create:async()=>({id:"channel-process",protocolNumber:"PROC-TEST-000001"})}};
  const db={...channel,$transaction:async(callback:(tx:unknown)=>unknown)=>callback(channel)} as unknown as PrismaClient;
 return {db,token,protocol,stored:()=>stored,created:()=>created,scores,setStored:(value:Record<string,unknown>)=>{stored=value;}};
}

test("prazos iniciais e-SIC/Ouvidoria são 20/30 dias sem pedir documentos de identidade",async()=>{
 const f=fixture(),before=Date.now();await createCitizenRequest(f.db,{type:"ESIC",name:"Solicitante",email:"pessoa@example.test",subject:"Informação pública",message:"Solicito acesso aos dados públicos do orçamento municipal."});const deadline=f.created()!.dueAt as Date;assert.ok(deadline.getTime()>=before+20*86400000);assert.ok(deadline.getTime()<Date.now()+20*86400000+1000);
 await createCitizenRequest(f.db,{type:"RECLAMACAO",subject:"Manifestação sem identidade",message:"Solicito a melhoria do atendimento e dos serviços municipais."});assert.ok((f.created()!.dueAt as Date).getTime()>=before+30*86400000);assert.equal(f.created()!.name,null);
});

test("recurso exige chave, resposta e janela de 10 dias; evita nova instância antes da anterior",async()=>{
 const f=fixture();await assert.rejects(appealCitizenRequest(f.db,f.protocol,"b".repeat(64),"Fundamento de recurso do pedido de acesso."));const appeal=await appealCitizenRequest(f.db,f.protocol,f.token,"Fundamento de recurso do pedido de acesso.");assert.equal(appeal.level,1);assert.ok((appeal.dueAt as Date).getTime()>Date.now()+4*86400000);await assert.rejects(appealCitizenRequest(f.db,f.protocol,f.token,"Segundo recurso antes da resposta da autoridade."));
 f.setStored({...f.stored(),appeals:[],respondedAt:new Date(Date.now()-11*86400000)});await assert.rejects(appealCitizenRequest(f.db,f.protocol,f.token,"Recurso apresentado fora da janela legal."),/prazo/);
});

test("resposta do Atendimento integrado não expõe IDs, identidade ou narrativa; avaliação é única",async()=>{
 const f=fixture();f.setStored({...f.stored(),status:"RECEBIDO",nativeTicket:{status:"Resolvido",solution:"Resposta institucional do atendimento",resolvedAt:new Date()},nativeOmbudsman:null});const response=await consultCitizenRequest(f.db,f.protocol,f.token);assert.equal(response?.status,"RESPONDIDO");assert.equal(response?.response,"Resposta institucional do atendimento");assert.ok(!("nativeTicket"in response!)&&!("nativeOmbudsman"in response!));await rateCitizenService(f.db,f.protocol,f.token,5,"Comentário restrito");await rateCitizenService(f.db,f.protocol,f.token,4,"Atualização da mesma avaliação");assert.equal(f.scores.size,1);await assert.rejects(rateCitizenService(f.db,f.protocol,"b".repeat(64),5,""));
});
