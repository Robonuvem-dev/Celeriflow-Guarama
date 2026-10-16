"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CemeteryLookup } from "./CemeteryLookup";
import { WORKFLOW_MOVEMENT_LABELS } from "@/lib/cemeteries/workflow-labels";
import { advanceWorkflow, checkWorkflowDebt, readWorkflowReference, saveWorkflow, saveWorkflowTransfer } from "@/app/app-domain/cemiterios/processos/workflow-actions";

const field = "rounded border p-2";
function Input({ name, label, type = "text", required = false, defaultValue }: { name: string; label: string; type?: string; required?: boolean; defaultValue?: string }) {
  return <label className="grid gap-1 text-sm">{label}<input className={field} name={name} type={type} required={required} defaultValue={defaultValue} /></label>;
}

export function WorkflowForm({ initialCemeteryId = "" }: { cemeteries?: { id: string; name: string }[]; initialCemeteryId?: string }) {
  const router = useRouter();
  const [type, setType] = useState("SEPULTAMENTO");
  const [existingRecord, setExistingRecord] = useState(true);
  const [burialType, setBurialType] = useState("NORMAL");
  const [unidentified, setUnidentified] = useState(false);
  const [cemeteryId, setCemeteryId] = useState(initialCemeteryId);
  const [reference, setReference] = useState<Awaited<ReturnType<typeof readWorkflowReference>>["reference"]>();
  const [declarant, setDeclarant] = useState("");
  const [confirmed, setConfirmed] = useState("");
  const [debt, setDebt] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const [key, setKey] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const scheduledAt = String(form.get("scheduledAt") || "");
    if (scheduledAt && Number.isFinite(new Date(scheduledAt).getTime())) form.set("scheduledAt", new Date(scheduledAt).toISOString());
    const requestKey = key || crypto.randomUUID(); setKey(requestKey); form.set("requestKey", requestKey);
    start(async () => { const result = await saveWorkflow(form); setMessage(result.error || "Agendamento registrado."); if (!result.error) { setKey(""); router.refresh(); } });
  }
  return <form onSubmit={submit} className="grid gap-4 rounded border bg-white p-4">
    <h2 className="font-semibold">Agendar processo funerário</h2>
    <div className="grid gap-3 md:grid-cols-3"><label className="grid gap-1">Processo<select className={field} name="processType" value={type} onChange={e => { setType(e.target.value); setReference(undefined); }}><option>SEPULTAMENTO</option><option>VELORIO</option><option>CREMACAO</option></select></label><CemeteryLookup name="cemeteryId" kind="cemetery" label="Cemitério" value={cemeteryId} onChange={setCemeteryId} required /><Input name="scheduledAt" label="Agendamento" type="datetime-local" required /></div>
    <CemeteryLookup name="declarantTaxpayerId" kind="taxpayer" label="Declarante responsável" required value={declarant} onChange={id => { setDeclarant(id); setConfirmed(""); setDebt(""); }} />
    <div><button className={field} type="button" disabled={pending || !declarant} onClick={() => start(async () => { const result = await checkWorkflowDebt(declarant); if (result.error) { setMessage(result.error); return; } setConfirmed(declarant); setDebt(`Débitos: R$ ${result.snapshot?.total ?? "0.00"} · ${result.snapshot?.assessmentCount ?? 0} lançamentos e ${result.snapshot?.activeDebtCount ?? 0} dívidas ativas.`); })}>Consultar débitos antes da confirmação</button><p role="status">{debt}</p><input type="hidden" name="debtConfirmed" value={confirmed} /></div>
    {type === "SEPULTAMENTO" ? <>
      <label className="grid gap-1">Tipo de sepultamento<select className={field} name="burialType" value={burialType} onChange={e => { setBurialType(e.target.value); if (e.target.value !== "NAO_RECLAMADO") setUnidentified(false); }}><option>NORMAL</option><option>MEMBRO</option><option>NAO_RECLAMADO</option></select></label>
      {burialType === "NAO_RECLAMADO" && <label><input type="checkbox" name="unidentified" checked={unidentified} onChange={e => setUnidentified(e.target.checked)} /> Pessoa não identificada</label>}
      {!unidentified && <CemeteryLookup name="deceasedTaxpayerId" kind="taxpayer" label={burialType === "MEMBRO" ? "Pessoa proprietária do membro" : "Pessoa falecida no Cadastro Único"} personOnly required onChange={id => { setReference(undefined); if (id) start(async () => { const result = await readWorkflowReference("taxpayer", id); setReference(result.reference); if (result.error) setMessage(result.error); }); }} />}
      {burialType === "MEMBRO" && <label><input type="checkbox" name="memberOwnerDeceased" /> Proprietário também faleceu (aplicar espólio e data do óbito)</label>}
      {burialType === "NAO_RECLAMADO" && <Input name="exceptionReason" label="Justificativa do sepultamento não reclamado/não identificado" required />}
      {reference && !unidentified && <p className="rounded bg-slate-50 p-2">Cadastro de origem: {reference.name} · Óbito cadastrado: {reference.deathDate || "Não registrado"}</p>}
      <div className="grid gap-3 md:grid-cols-3"><Input key={unidentified ? "unknown" : reference?.name || "name"} name="fullName" label={unidentified ? "Identificação administrativa (sem criar PF)" : "Nome"} required defaultValue={!unidentified ? reference?.name : undefined} /><Input key={reference?.birthDate || "birth"} name="birthDate" label="Nascimento" type="date" defaultValue={reference?.birthDate} /><Input key={reference?.deathDate || "death"} name="deathDate" label={burialType === "MEMBRO" ? "Data da remoção/óbito" : "Data do óbito"} type="date" required defaultValue={reference?.deathDate} /><Input name="deathTime" label="Hora" type="time" /><Input name="gender" label="Sexo" /><Input name="document" label="Documento" /><Input name="maritalStatus" label="Estado civil" /><Input name="fatherName" label="Pai" /><Input name="motherName" label="Mãe" /><Input name="address" label="Endereço" /><Input name="doctorName" label="Médico declarante" required /><Input name="doctorCrm" label="CRM" required /></div>
      <CemeteryLookup name="graveId" kind="grave" label="Sepultura com vaga" cemeteryId={cemeteryId} required />
      <CemeteryLookup name="causeId" kind="cause" label="Causa do óbito" required={!unidentified} />
      <details><summary>Onze grupos da declaração de óbito</summary><div className="grid gap-3 md:grid-cols-2">{["falecido", "nascimento", "documentos", "endereco", "obito", "local", "medico", "causas", "funeraria", "sepultamento", "observacoes"].map(group => <label key={group} className="grid gap-1">{group}<textarea className={field} name={`group_${group}`} /></label>)}</div></details>
    </> : <><label><input type="checkbox" checked={existingRecord} onChange={e => { setExistingRecord(e.target.checked); setReference(undefined); }} /> Usar registro funerário existente</label>
      {existingRecord ? <CemeteryLookup name="deceasedId" kind="deceased" label="Pessoa / registro funerário" required onChange={id => { setReference(undefined); if (id) start(async () => { const result = await readWorkflowReference("deceased", id); setReference(result.reference); if (result.error) setMessage(result.error); }); }} /> : <><CemeteryLookup name="deceasedTaxpayerId" kind="taxpayer" label="Pessoa falecida no Cadastro Único" personOnly required onChange={id => { setReference(undefined); if (id) start(async () => { const result = await readWorkflowReference("taxpayer", id); setReference(result.reference); if (result.error) setMessage(result.error); }); }} /><Input key={reference?.deathDate || "independent-death"} name="deathDate" label="Data do óbito" type="date" required defaultValue={reference?.deathDate} /><CemeteryLookup name="causeId" kind="cause" label="Causa do óbito" required /><Input name="doctorName" label="Médico declarante" required /><Input name="doctorCrm" label="CRM" required /></>}
      {reference && <div className="rounded border p-3"><p>{reference.name} · Óbito: {reference.deathDate || "Informe a data"} · {reference.status}</p><p>Causa: {reference.cause || "Selecione a causa para o novo registro"} · Funerária de origem: {reference.funeralHome || "—"}</p></div>}</>}
    <div className="grid gap-3 md:grid-cols-2"><CemeteryLookup name="funeralHomeId" kind="funeralHome" label="Funerária" required={!unidentified || type !== "SEPULTAMENTO"} /><CemeteryLookup name="chapelId" kind="chapel" label="Capela" cemeteryId={cemeteryId} required={type === "VELORIO" || (type === "SEPULTAMENTO" && !unidentified)} /></div>
    <Input name="notes" label="Observações do processo" />
    <button className="rounded bg-slate-900 p-2 text-white" disabled={pending || confirmed !== declarant || !declarant}>{pending ? "Salvando…" : "Confirmar agendamento"}</button><p role="status">{message}</p>
  </form>;
}

export function WorkflowAdvance({ id, type, status }: { id: string; type: string; status: string }) {
  const [message, setMessage] = useState(""); const [pending, start] = useTransition(); const router = useRouter();
  if (!["AGENDADO", "EM_REALIZACAO"].includes(status)) return null;
  const finish = type === "VELORIO" ? "ENCERRADO" : type === "CREMACAO" ? "CREMADO" : "SEPULTADO";
  return <div className="flex flex-wrap gap-2">{[...(status === "AGENDADO" ? ["EM_REALIZACAO" as const] : []), finish as "ENCERRADO" | "CREMADO" | "SEPULTADO", "CANCELADO" as const].map(next => <button key={next} className={field} disabled={pending} onClick={() => start(async () => { const result = await advanceWorkflow(id, next, `${id}:${next}`); setMessage(result.error || "Processo atualizado."); if (!result.error) router.refresh(); })}>{next}</button>)}<span role="status">{message}</span></div>;
}

export function WorkflowTransferForm() {
  const [type, setType] = useState("OUTRO_LOTE"); const [pending, start] = useTransition(); const [message, setMessage] = useState(""); const [key, setKey] = useState(""); const router = useRouter();
  const [reference, setReference] = useState<Awaited<ReturnType<typeof readWorkflowReference>>["reference"]>();
  return <form className="grid gap-3 rounded border bg-white p-4" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const requestKey = key || crypto.randomUUID(); setKey(requestKey); form.set("requestKey", requestKey); start(async () => { const result = await saveWorkflowTransfer(form); setMessage(result.error || "Movimentação registrada."); if (!result.error) { setKey(""); router.refresh(); } }); }}>
    <h2 className="font-semibold">Transferir / movimentar pessoa atualmente sepultada</h2>
    <CemeteryLookup name="deceasedId" kind="deceased" label="Pessoa sepultada" required onChange={id => { setReference(undefined); if (id) start(async () => { const result = await readWorkflowReference("deceased", id); setReference(result.reference); setMessage(result.error || (result.reference?.status !== "SEPULTADO" ? "Esta pessoa não está atualmente sepultada." : "")); }); }} />
    <input type="hidden" name="graveId" value={reference?.graveId || ""} />
    {reference && <p className="rounded border p-3">Origem atual: {reference.graveLabel || "Sem sepultura"} · Ocupação: {reference.occupied ?? 0}/{reference.capacity ?? 0} · {reference.status}</p>}
    <label className="grid gap-1">Movimentação<select className={field} name="movementType" value={type} onChange={e => setType(e.target.value)}>{Object.entries(WORKFLOW_MOVEMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {(type === "OUTRO_LOTE" || type === "MUDANCA_CEMITERIO") && <CemeteryLookup name="toGraveId" kind="grave" label="Sepultura de destino" required={type === "OUTRO_LOTE"} />}
    {type === "OSSUARIO" && <CemeteryLookup name="ossuaryId" kind="ossuary" label="Ossuário de destino" required />}
    <Input name="destinationDescription" label="Descrição do destino / justificativa" required={!["OUTRO_LOTE", "OSSUARIO", "MUDANCA_CEMITERIO"].includes(type)} /><Input name="notes" label="Observações" />
    <button className="rounded bg-slate-900 p-2 text-white" disabled={pending || reference?.status !== "SEPULTADO" || !reference.graveId}>{pending ? "Salvando…" : "Confirmar movimentação"}</button><p role="status">{message}</p>
  </form>;
}

export function WorkflowReceiptPrint() {
  return <button className="rounded border p-2 print:hidden" type="button" onClick={() => window.print()}>Imprimir recibo</button>;
}
