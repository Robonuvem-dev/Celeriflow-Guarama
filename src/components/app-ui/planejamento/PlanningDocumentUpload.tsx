"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { planningBasePath, type PlanningJurisdiction } from "@/lib/planejamento/policy";
import { PlanningLookupField } from "./PlanningLookupField";

export function PlanningDocumentUpload({ jurisdiction, instrumentId, classes }: { jurisdiction: PlanningJurisdiction; instrumentId: string; classes: { code: string; label: string }[] }) {
  const [pending, setPending] = useState(false), [message, setMessage] = useState(""); const router = useRouter();
  return <form className="space-y-3" onSubmit={async (event) => { event.preventDefault(); const form = event.currentTarget; setPending(true); setMessage(""); try { const response = await fetch(`${planningBasePath(jurisdiction)}/documentos/enviar`, { method: "POST", body: new FormData(form) }); const data = await response.json(); if (!response.ok) setMessage(data.error); else { setMessage("Documento registrado no GED e vinculado à peça."); form.reset(); router.refresh(); } } catch { setMessage("Não foi possível concluir o ingresso GED."); } finally { setPending(false); } }}><input type="hidden" name="instrumentId" value={instrumentId} /><fieldset disabled={pending} className="grid gap-3 md:grid-cols-2"><label><Label>Título</Label><Input name="title" required maxLength={200} /></label><label><Label>Classe documental</Label><select name="documentClassCode" required className="h-9 w-full rounded border bg-background p-2">{classes.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label><Label>Finalidade</Label><select name="purpose" className="h-9 w-full rounded border bg-background p-2"><option value="ANNEX">Anexo da peça</option><option value="HEARING_MINUTES">Ata da audiência</option><option value="LEGAL_ACT">Ato legal</option></select></label><PlanningLookupField jurisdiction={jurisdiction} name="hearingId" label="Audiência (para ata)" hidden={{ instrumentId }} /><label><Label>Arquivo (até 20 MB)</Label><Input type="file" name="file" required /></label></fieldset><Button disabled={pending}>{pending ? "Registrando…" : "Enviar arquivo e registrar no GED"}</Button>{message && <p role="status" className="text-sm">{message}</p>}</form>;
}
