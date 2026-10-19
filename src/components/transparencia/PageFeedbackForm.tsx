"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Frown, Meh, Smile, SmilePlus } from "lucide-react";
import Link from "next/link";

const options = [
  { rating: 1, label: "Muito insatisfeito", Icon: Frown }, { rating: 2, label: "Insatisfeito", Icon: Frown },
  { rating: 3, label: "Neutro", Icon: Meh }, { rating: 4, label: "Satisfeito", Icon: Smile },
  { rating: 5, label: "Muito satisfeito", Icon: SmilePlus },
];

export function PageFeedbackForm({ page, collectionSlug }: { page: "HOME" | "SEARCH" | "CONSULTATION"; collectionSlug?: string }) {
  const id = useId();
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const submission = useRef<{ key: string; payload: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || success) return;
    const form = new FormData(event.currentTarget);
    const data = { page, ...(collectionSlug ? { collectionSlug } : {}), rating: Number(form.get("rating")), comment: String(form.get("comment") || ""), website: String(form.get("website") || "") };
    const payload = JSON.stringify(data);
    if (!submission.current || submission.current.payload !== payload) submission.current = { key: crypto.randomUUID(), payload };
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/transparencia/avaliacao-pagina", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, submissionKey: submission.current.key }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar a avaliação.");
      setSuccess(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha de conexão. Tente novamente.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return <section aria-labelledby={`${id}-title`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <h2 id={`${id}-title`} className="text-center text-xl font-bold text-slate-900">Qual o seu nível de satisfação com esta página?</h2>
    <p className="mt-2 text-center text-sm leading-6 text-slate-600">Sua opinião ajuda a tornar as informações mais fáceis de encontrar.</p>
    {success ? <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center font-semibold text-emerald-900">Obrigado! Sua avaliação foi registrada.</p> : <form onSubmit={submit} className="mt-6 space-y-5" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-5">
        <legend className="sr-only">Escolha uma nota de satisfação de 1 a 5</legend>
        <div className="grid gap-2 sm:grid-cols-5">{options.map(({ rating, label, Icon }) => <label key={rating} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 has-checked:border-sky-800 has-checked:bg-sky-50 has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-sky-800 sm:flex-col sm:text-center">
          <input type="radio" name="rating" value={rating} required className="size-4 accent-sky-900" />
          <Icon className="size-8 shrink-0 text-[#0e4c7e]" aria-hidden="true" /><span className="text-sm font-semibold text-slate-800">{label}</span>
        </label>)}</div>
        <label htmlFor={`${id}-comment`} className="block text-sm font-semibold text-slate-800">Como podemos melhorar? <span className="font-normal">(opcional)</span><textarea id={`${id}-comment`} name="comment" rows={3} maxLength={2000} aria-describedby={`${id}-privacy`} className="mt-2 block w-full rounded-lg border border-slate-300 p-3 font-normal focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-800" /></label>
        <input name="website" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
        <p id={`${id}-privacy`} className="text-sm leading-6 text-slate-600">Não inclua dados pessoais no comentário. A avaliação é usada para melhorar o portal e mantida por até 365 dias; não solicitamos nome ou e-mail. Este formulário não substitui o <Link href="/portal/acesso-informacao" className="font-semibold underline">e-SIC</Link> ou a <Link href="/portal/ouvidoria" className="font-semibold underline">Ouvidoria</Link>. <Link href="/portal/privacidade" className="underline">Política de privacidade</Link>.</p>
        <button className="min-h-11 rounded-lg bg-[#0e4c7e] px-5 py-3 text-sm font-bold text-white hover:bg-[#0a3a5c] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-sky-800 disabled:opacity-60">{pending ? "Enviando avaliação…" : "Enviar avaliação"}</button>
      </fieldset>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </form>}
  </section>;
}
