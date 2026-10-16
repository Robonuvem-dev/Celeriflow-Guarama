"use client";

import { useState,useTransition } from "react";
import type { z } from "zod";
import type { licensePolicySchema } from "@/lib/tributacao/license-policy";
import { publishLicensePolicyAction } from "./actions";

export default function LicensePortalPolicyClient(props:{policies:{id:string;version:number;data:z.infer<typeof licensePolicySchema>}[]}) {
  const [notice,setNotice]=useState("");const [pending,startTransition]=useTransition();
  return <section className="space-y-2 p-4"><h2 className="font-semibold">Bloqueios cadastrais e emissão no portal</h2>{notice && <p role="status" className="text-sm">{notice}</p>}{props.policies.map(policy=><form key={`${policy.id}:${policy.version}`} action={form=>startTransition(async()=>{
    const list=(key:string)=>String(form.get(key) ?? "").split(/[,;\n]/).map(value=>value.trim()).filter(Boolean);
    const result=await publishLicensePolicyAction({...policy.data,policyId:policy.id,expectedVersion:policy.version,allowPortalIssue:form.get("allow")==="on",blockedCompanyTypes:list("companyTypes"),blockedCnaes:list("cnaes"),blockingMessage:String(form.get("message") ?? "")});setNotice(result.error ?? "Bloqueios e opção do portal publicados.");
  })} className="grid gap-3 rounded border bg-white p-3 text-xs sm:grid-cols-2"><span className="font-semibold sm:col-span-2">{policy.data.year} · {policy.data.name}</span><label className="flex items-center gap-2 sm:col-span-2"><input name="allow" type="checkbox" defaultChecked={policy.data.allowPortalIssue}/>Permitir emissão por titular com acesso ALVARAS</label><label>Tipos de empresa bloqueados (um por linha)<textarea name="companyTypes" defaultValue={policy.data.blockedCompanyTypes.join("\n")} className="mt-1 w-full rounded border p-2"/></label><label>CNAEs bloqueados, principais ou secundários (um por linha)<textarea name="cnaes" defaultValue={policy.data.blockedCnaes.join("\n")} className="mt-1 w-full rounded border p-2"/></label><label className="sm:col-span-2">Mensagem do bloqueio<input name="message" required maxLength={2000} defaultValue={policy.data.blockingMessage} className="mt-1 w-full rounded border p-2"/></label><button disabled={pending} className="rounded border p-1">Publicar bloqueios e portal</button></form>)}</section>;
}
