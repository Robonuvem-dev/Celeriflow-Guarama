"use client";
import { useState, useTransition } from "react";
import { submitRecruitmentApplicationAction } from "./actions";

export function RecruitmentApplicationForm({ noticeId, roles, acceptance }: { noticeId: string; roles: { code: string; name: string }[]; acceptance: string }) {
  const [pending, startTransition] = useTransition(), [message, setMessage] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setMessage("");
    startTransition(async () => { try { const result = await submitRecruitmentApplicationAction({ noticeId, roleCode: String(data.get("roleCode")), cpf: String(data.get("cpf")), fullName: String(data.get("fullName")), birthDate: String(data.get("birthDate")), phone: String(data.get("phone")), accepted: data.get("accepted") === "on" }); setMessage(result.error || "Inscrição recebida. Emita o comprovante na lista de inscrições."); } catch { setMessage("Não foi possível registrar a inscrição."); } });
  }
  return <form onSubmit={submit} className="mt-4 space-y-3"><fieldset disabled={pending} className="grid gap-3 text-sm sm:grid-cols-2"><label className="flex flex-col gap-1">Cargo<select name="roleCode" required className="rounded border p-2">{roles.map(role => <option key={role.code} value={role.code}>{role.name}</option>)}</select></label>{[["fullName", "Nome completo", "text"], ["cpf", "CPF", "text"], ["birthDate", "Nascimento", "date"], ["phone", "Telefone", "tel"]].map(([name, label, type]) => <label key={name} className="flex flex-col gap-1">{label}<input name={name} type={type} required maxLength={250} className="rounded border p-2" /></label>)}<label className="flex items-start gap-2 sm:col-span-2"><input name="accepted" type="checkbox" required className="mt-1" /><span>{acceptance}</span></label><button className="rounded bg-emerald-800 px-4 py-2 font-semibold text-white sm:col-span-2">{pending ? "Registrando…" : "Registrar inscrição"}</button></fieldset>{message && <p role="status" className="text-sm">{message}</p>}</form>;
}
