"use client";
import { useState } from "react";
import Link from "next/link";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { SocialOperationalList } from "../OperationalList";
import { socialDocumentTemplates } from "@/lib/social/document-templates";
export default function SocialModelsClient({institution}:{institution:{name:string;city:string;state:string;phone:string;email:string}}){
  const [page,setPage]=useState(1);
  return <PageFrame className="space-y-3 p-3"><PageHeader title="Modelos de documentos socioassistenciais" action={<Link href="/social/gestao/documentos">Documentos registrados</Link>}/><p className="text-sm">{institution.name} — {[institution.city,institution.state].filter(Boolean).join("/")}</p><OperationalTablePanel title="Biblioteca de modelos CelerFlow"><SocialOperationalList id="biblioteca-modelos" page={page} total={socialDocumentTemplates.length} onPageChange={setPage} columns={[["name","Modelo",300,140,"identifier"],["version","Versão",100,70],["sections","Blocos",400,150],["actions","Ações",170,170,"actions"]]} rows={socialDocumentTemplates.slice((page-1)*20,page*20).map(model=>({id:model.code,label:model.title,values:{name:model.title,version:model.version,sections:model.sections.map(s=>s.title).join("; ")},actions:<Link href="/social/gestao/documentos">Registrar documento</Link>}))}/></OperationalTablePanel></PageFrame>;
}
