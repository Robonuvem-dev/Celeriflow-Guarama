"use client";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { DiscoverySettings } from "@/lib/transparencia/discovery-settings";
import type { DiscoverySection } from "@/lib/transparencia/discovery";
import { saveDiscoveryPresentation } from "@/app/app-domain/transparencia/apresentacao/actions";
import { DiscoveryLinksTable } from "./DiscoveryLinksTable";
import { writeDiscoveryLinkDrafts } from "./discovery-link-drafts";

const field = "mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm";

export function DiscoveryPresentationEditor({ settings, sections, version, canUpdate }: { settings: DiscoverySettings; sections: DiscoverySection[]; version: string; canUpdate: boolean }) {
  const [links, setLinks] = useState(settings.links);
  const [shortcuts, setShortcuts] = useState(settings.shortcuts);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const router = useRouter();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate || pending) return;
    const futureReview = links.find(link => link.reviewedAt > new Date().toISOString().slice(0, 10));
    if (futureReview) {
      setFailed(true);
      setMessage(`A última revisão de ${futureReview.title || futureReview.id} não pode estar no futuro.`);
      return;
    }
    const form = new FormData(event.currentTarget);
    writeDiscoveryLinkDrafts(form, links);
    const availableShortcutIds = new Set([...sections.flatMap(section => section.items.map(item => item.id)), ...links.map(link => link.id)]);
    form.delete("shortcuts");
    for (const id of shortcuts) if (availableShortcutIds.has(id)) form.append("shortcuts", id);
    setMessage("");
    startTransition(async () => {
      const result = await saveDiscoveryPresentation(form);
      setFailed(Boolean(result.error));
      setMessage(result.error || "Apresentação salva e atualizada no portal público.");
      if (result.success) router.refresh();
    });
  }
  const items = sections.flatMap(section => section.items);
  return <form onSubmit={submit} className="space-y-5">
    <input type="hidden" name="version" value={version} />
    <div className="space-y-5">
      <fieldset disabled={!canUpdate || pending} className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-2">
        <h2 className="font-bold md:col-span-2">Abertura e preferências</h2>
        <label>Título da página<input name="title" required maxLength={120} defaultValue={settings.title} className={field} /></label>
        <label>Endereço público institucional<input name="publicOrigin" type="url" placeholder="https://portal.prefeitura.gov.br" defaultValue={settings.publicOrigin} className={field} /><span className="text-xs text-slate-600">Usado na URL canônica e no sitemap. Informe o endereço oficial de implantação.</span></label>
        <label className="md:col-span-2">Texto de apresentação<textarea name="intro" required minLength={10} maxLength={600} rows={3} defaultValue={settings.intro} className={field} /></label>
        <label className="md:col-span-2">Atalhos da abertura (até oito; Ctrl/Cmd para selecionar vários)<select name="shortcuts" multiple size={6} value={shortcuts} onChange={event => setShortcuts(Array.from(event.target.selectedOptions, option => option.value))} className={field}>{[...items, ...links.filter(link => link.enabled || shortcuts.includes(link.id))].map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label className="md:col-span-2"><input type="checkbox" name="feedbackEnabled" defaultChecked={settings.feedbackEnabled} /> Disponibilizar avaliação de usabilidade da página (sem nome/e-mail, retenção de até 365 dias)</label>
      </fieldset>
      <fieldset disabled={!canUpdate || pending} className="space-y-3 rounded-xl border bg-white p-5"><h2 className="font-bold">Seções, ordem e fundamentos legais</h2><p className="text-sm text-slate-600">A visibilidade aqui organiza o hub. A publicação dos dados e consultas continua sendo controlada em Configurações e documentos. Revise os fundamentos legais antes de publicar.</p>
        {sections.map((section, index) => { const current = settings.sections.find(item => item.id === section.id); return <details key={section.id} className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold">{current?.title || section.title}</summary><div className="mt-3 grid gap-3 md:grid-cols-2">
          <label>Título<input name={`section.${section.id}.title`} defaultValue={current?.title || section.title} required maxLength={150} className={field} /></label>
          <label>Ordem<input type="number" name={`section.${section.id}.order`} defaultValue={current?.order ?? index * 10} min={0} max={1000} className={field} /></label>
          <label className="md:col-span-2">Descrição<textarea name={`section.${section.id}.description`} defaultValue={current?.description ?? section.description} maxLength={600} className={field} /></label>
          <label className="md:col-span-2">Fundamento legal (opcional)<input name={`section.${section.id}.legalBasis`} defaultValue={current?.legalBasis || ""} maxLength={500} className={field} /></label>
          <label><input type="checkbox" name={`section.${section.id}.enabled`} defaultChecked={current?.enabled !== false} /> Exibir seção no hub</label>
          {section.items.map(item => <label key={item.id} className="md:col-span-2">Sinônimos adicionais — {item.title}<input name={`item.${item.id}.keywords`} defaultValue={settings.items.find(row => row.id === item.id)?.keywords || ""} maxLength={500} className={field} /></label>)}
        </div></details>; })}
      </fieldset>
      <section className="space-y-3 rounded-xl border bg-white p-5"><h2 className="font-bold">Destinos complementares</h2><p className="text-sm text-slate-600">Cadastre serviços, documentos ou sistemas externos. Cada destino tem responsável e data da última revisão.</p>
        <DiscoveryLinksTable links={links} onChange={setLinks} sections={sections} disabled={!canUpdate || pending} />
      </section>
      <button disabled={!canUpdate || pending} className="min-h-11 rounded-lg bg-sky-900 px-5 py-3 font-semibold text-white disabled:opacity-60">{pending ? "Salvando…" : "Salvar apresentação"}</button>
    </div>
    {message && <p role={failed ? "alert" : "status"} className={`rounded-lg border p-4 text-sm ${failed ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{message}</p>}
  </form>;
}
