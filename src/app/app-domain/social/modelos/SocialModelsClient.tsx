"use client";

import { useState } from "react";
import { FileText, Printer } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { socialDocumentTemplates } from "@/lib/social/document-templates";

export default function SocialModelsClient({ institution }: { institution: { name: string; city: string; state: string; phone: string; email: string } }) {
  const [code, setCode] = useState(socialDocumentTemplates[0].code);
  const [values, setValues] = useState<Record<string, string>>({});
  const template = socialDocumentTemplates.find((item) => item.code === code)!;
  function format(key: string, type?: string) {
    const value = values[key] || "";
    return type === "date" && value ? value.split("-").reverse().join("/") : value;
  }
  return <PageFrame className="space-y-3 p-3">
    <PageHeader title="Modelos de documentos SUAS — POC" icon={<FileText className="size-4" />} action={<button onClick={() => window.print()} className="inline-flex h-8 items-center gap-2 rounded bg-blue-600 px-3 text-xs text-white"><Printer className="size-4" />Imprimir / salvar PDF</button>} />
    <p className="text-xs text-slate-500">Modelos demonstrativos adaptados de documentos públicos. O preenchimento nesta tela não registra atendimento, aprovação ou entrega no sistema.</p>
    <label className="block text-xs">Modelo<select value={code} onChange={(event) => { setCode(event.target.value); setValues({}); }} className="mt-1 h-8 w-full rounded border px-2 text-sm">{socialDocumentTemplates.map((item) => <option key={item.code} value={item.code}>{item.title}</option>)}</select></label>
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="space-y-3 rounded-lg border p-3" aria-label="Preenchimento do modelo">
        {template.sections.map((section) => <fieldset key={section.title} className="grid gap-2 sm:grid-cols-2"><legend className="mb-2 text-sm font-semibold">{section.title}</legend>{section.fields.map((input) => <label key={input.key} className={`text-xs ${input.multiline ? "sm:col-span-2" : ""}`}>{input.label}{input.multiline ? <textarea rows={3} maxLength={5000} value={values[input.key] || ""} onChange={(event) => setValues({ ...values, [input.key]: event.target.value })} className="mt-1 w-full rounded border p-2 text-sm" /> : <input type={input.type || "text"} maxLength={300} value={values[input.key] || ""} onChange={(event) => setValues({ ...values, [input.key]: event.target.value })} className="mt-1 h-8 w-full rounded border px-2 text-sm" />}</label>)}</fieldset>)}
        <a className="text-xs text-blue-700 underline" href={template.source} target="_blank" rel="noreferrer">Consultar referência pública utilizada</a>
      </section>
      <article id="social-poc-print" className="min-w-0 space-y-4 rounded-lg border bg-white p-6 text-slate-900">
        <header className="border-b-2 border-slate-800 pb-3 text-center"><h1 className="text-lg font-bold">{institution.name}</h1><p className="text-sm">Assistência Social — {institution.city}/{institution.state}</p><p className="text-xs">{[institution.phone, institution.email].filter(Boolean).join(" • ")}</p><h2 className="mt-3 text-base font-bold">{template.title}</h2><p className="mt-1 text-[10px] font-semibold">MODELO DEMONSTRATIVO POC • {template.version} • SUJEITO À VALIDAÇÃO MUNICIPAL</p></header>
        {template.sections.map((section) => <section key={section.title} className="space-y-2"><h3 className="border-b pb-1 text-xs font-bold uppercase">{section.title}</h3><dl className="grid gap-3 sm:grid-cols-2">{section.fields.map((input) => <div key={input.key} className={input.multiline ? "sm:col-span-2" : ""}><dt className="text-[10px] font-semibold uppercase">{input.label}</dt><dd className={`mt-1 whitespace-pre-wrap break-words border-b border-slate-300 pb-1 text-xs ${input.multiline ? "min-h-12" : "min-h-5"}`}>{format(input.key, input.type) || " "}</dd></div>)}</dl></section>)}
        <footer className="space-y-4 pt-5"><div className="grid gap-8 sm:grid-cols-2">{template.signatures.map((label) => <div key={label} className="pt-8 text-center"><div className="border-t border-slate-500 pt-1 text-[10px]">{label}</div></div>)}</div><p className="text-[9px] text-slate-500">Modelo de demonstração adaptado para Ibema. Não substitui ato normativo, autorização ou comprovante emitido a partir de uma operação registrada.</p></footer>
      </article>
    </div>
    <style jsx global>{`
      @media print {
        @page { size: A4; margin: 15mm; }
        body * { visibility: hidden !important; }
        #social-poc-print, #social-poc-print * { visibility: visible !important; }
        #social-poc-print { position: absolute; inset: 0 auto auto 0; width: 100%; padding: 0; border: 0; background: white; }
        #social-poc-print dl, #social-poc-print footer > div { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        #social-poc-print .sm\\:col-span-2 { grid-column: span 2 / span 2; }
        #social-poc-print section, #social-poc-print dl > div { break-inside: avoid; }
      }
    `}</style>
  </PageFrame>;
}
