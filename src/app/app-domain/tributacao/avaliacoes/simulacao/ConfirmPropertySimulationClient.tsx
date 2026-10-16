"use client";

import { useState,useTransition } from "react";
import type { z } from "zod";
import type { propertySimulationSchema } from "@/lib/tributacao/property-group-simulation";
import { assessPropertySimulationAction } from "./actions";

export default function ConfirmPropertySimulationClient(props:{simulation:z.input<typeof propertySimulationSchema>;previewHash:string}) {
  const [notice,setNotice]=useState("");const [pending,startTransition]=useTransition();
  return <section className="mt-4 space-y-2 rounded border p-3"><h2 className="font-semibold">Efetivar lançamento da base simulada</h2>{notice && <p role="status" className="text-sm">{notice}</p>}<form action={form=>startTransition(async()=>{const result=await assessPropertySimulationAction({simulation:props.simulation,expectedPreviewHash:props.previewHash,processId:String(form.get("processId") ?? "").trim() || null,reason:String(form.get("reason") ?? "")});setNotice(result.error ?? `Lançamento ${result.number ?? result.id} efetivado. Os dados cadastrais foram preservados.`);})} className="space-y-2"><label className="block text-xs">ID do protocolo<input name="processId" className="mt-1 w-full rounded border p-2"/></label><label className="block text-xs">Fundamento<textarea name="reason" required className="mt-1 w-full rounded border p-2"/></label><button disabled={pending} className="rounded bg-emerald-700 p-2 text-xs text-white">Efetivar lançamento IPTU</button></form></section>;
}
