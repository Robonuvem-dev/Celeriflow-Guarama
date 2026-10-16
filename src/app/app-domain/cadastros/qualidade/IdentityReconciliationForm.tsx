"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { reconcileIdentityAction } from "./identity-actions";

export function IdentityReconciliationForm() {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    key.current ??= crypto.randomUUID();
    setPending(true);
    setMessage("");
    try {
      const input = Object.fromEntries([...new FormData(form)].map(([name, value]) => [name, String(value)]));
      const result = await reconcileIdentityAction({ ...input, idempotencyKey: key.current });
      if (result.error) setMessage(result.error);
      else { setMessage("Vínculos reconciliados com histórico preservado."); key.current = null; form.reset(); router.refresh(); }
    } catch { setMessage("Não foi possível concluir a reconciliação."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="mb-3 rounded border p-3 text-sm">
    <h2 className="mb-2 font-semibold">Reconciliar identidade canônica</h2>
    <fieldset disabled={pending} className="grid gap-2 md:grid-cols-2">
      <label>Tipo de identidade<select name="identityType" required className="block w-full rounded border bg-background p-2"><option value="PF">Pessoa física</option><option value="PJ">Pessoa jurídica</option></select></label>
      {[{ name: "identityId", label: "ID da pessoa ou empresa", required: true }, { name: "taxpayerId", label: "ID do contribuinte" }, { name: "supplierId", label: "ID do fornecedor" }, { name: "creditorId", label: "ID do credor" }].map(field => <label key={field.name}>{field.label}<input name={field.name} required={field.required} className="block w-full rounded border bg-background p-2" /></label>)}
      <label className="md:col-span-2">Fundamento da conciliação<textarea name="reason" minLength={3} maxLength={4000} required className="block w-full rounded border bg-background p-2" /></label>
      <button className="rounded border px-3 py-2" type="submit">{pending ? "Reconciliando…" : "Registrar vínculos"}</button>
    </fieldset>
    {message && <p role="status" className="mt-2">{message}</p>}
  </form>;
}
