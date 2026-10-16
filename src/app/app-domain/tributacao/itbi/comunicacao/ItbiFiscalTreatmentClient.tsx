"use client";

import { useState, useTransition } from "react";
import { decideItbiFiscalTreatmentAction } from "./actions";

export default function ItbiFiscalTreatmentClient(props: { declarationId: string; updatedAt: string; documents: { id: string; title: string }[] }) {
  const [notice, setNotice] = useState(""); const [pending, startTransition] = useTransition();
  const field = "mt-1 w-full rounded border p-2 text-xs";
  return <details className="rounded border p-3 print:hidden"><summary className="cursor-pointer text-sm font-semibold">Decisão fiscal: isenção, imunidade ou não incidência</summary>{notice && <p role="status" className="mt-2 text-xs">{notice}</p>}<form action={form => startTransition(async () => {
    const result = await decideItbiFiscalTreatmentAction({ declarationId: props.declarationId, expectedUpdatedAt: props.updatedAt, treatment: String(form.get("treatment")) as "ISENTO" | "IMUNIDADE" | "NAO_INCIDENCIA" | "TRIBUTAVEL", legalBasis: String(form.get("basis") ?? ""), reason: String(form.get("reason") ?? ""), documentIds: form.getAll("documents").map(String) });
    setNotice("error" in result ? result.error : "Decisão fiscal registrada no processo e no cadastro imobiliário.");
  })} className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs">Tratamento<select name="treatment" className={field}><option value="ISENTO">Isento</option><option value="IMUNIDADE">Imunidade</option><option value="NAO_INCIDENCIA">Não incidência</option><option value="TRIBUTAVEL">Restabelecer análise tributável</option></select></label><label className="text-xs">Fundamento legal<textarea name="basis" required maxLength={4000} className={field}/></label><label className="text-xs sm:col-span-2">Decisão fundamentada<textarea name="reason" required maxLength={8000} className={field}/></label><label className="text-xs sm:col-span-2">Documentos comprobatórios do processo<select name="documents" multiple required className={field}>{props.documents.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label><button disabled={pending} className="rounded border p-2 text-xs">Registrar decisão fiscal</button></form></details>;
}
