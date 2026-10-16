"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { substituteConstructionAnalyst } from "../assignment-actions";

export default function ConstructionAssignmentClient({ caseId, firstAnalystId, assignedEmployeeId, employees }: { caseId: string; firstAnalystId: string | null; assignedEmployeeId: string | null; employees: { id: string; name: string }[] }) {
  const router = useRouter();
  const key = useRef("");
  const [employeeId, setEmployeeId] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    if (!key.current) key.current = crypto.randomUUID();
    try {
      const result = await substituteConstructionAnalyst({ caseId, requestKey: key.current, expectedAnalystId: firstAnalystId, expectedAssignedId: assignedEmployeeId, employeeId, reason });
      if (result.error) { setMessage(result.error); return; }
      key.current = ""; setEmployeeId(""); setReason(""); setMessage("Substituição registrada. O retorno de readequações seguirá o novo responsável."); router.refresh();
    } catch { setMessage("Falha de comunicação. Repita para recuperar a mesma substituição."); } finally { setPending(false); }
  }
  return <form onSubmit={submit} className="space-y-2 rounded border p-3"><h3 className="text-sm font-semibold">Substituição formal do analista</h3><fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2"><label className="text-xs">Novo responsável<select required value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="h-8 w-full rounded border bg-transparent px-2 text-sm"><option value="">Selecione</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label className="text-xs">Motivo<input required minLength={10} maxLength={4000} value={reason} onChange={(event) => setReason(event.target.value)} className="h-8 w-full rounded border bg-transparent px-2 text-sm" /></label><div className="text-right sm:col-span-2"><button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50">{pending ? "Registrando..." : "Registrar substituição"}</button></div></fieldset>{message && <p role="status" className="text-sm">{message}</p>}</form>;
}
