"use client";

import { useState } from "react";
import type { AnnualBatchInput } from "@/lib/tributacao/annual-batches";
import { taxAnnualBatchAction } from "./actions";

type Batch = { id: string; year: number; status: string; reason: string; scheduledAt: string | null; items: Array<{ id: string; targetId: string; status: string; base: string; amount: string; assessmentId: string | null; error: string | null }> };
type Target = { id: string; name: string; type: AnnualBatchInput["targetType"] };
const style = "rounded border p-2";

export function AnnualBatchesClient({ taxes, parameters, targets, batches }: { taxes: Array<{ id: string; name: string }>; parameters: Array<{ id: string; taxId: string; name: string }>; targets: Target[]; batches: Batch[] }) {
  const [input, setInput] = useState<AnnualBatchInput>(() => ({ taxId: taxes[0]?.id ?? "", parameterId: "", competence: `${new Date().getUTCFullYear()}-01-01`, targetType: "TAXPAYER", targets: [{ targetId: "", taxableBase: "" }], reason: "", idempotencyKey: crypto.randomUUID() }));
  const [pending, setPending] = useState(false); const [error, setError] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => new Date().toISOString().slice(0, 16)); const [reason, setReason] = useState("");
  const [copyYear, setCopyYear] = useState(new Date().getUTCFullYear() + 1);
  const [copyCalendar, setCopyCalendar] = useState("");
  const [copyOptionDates, setCopyOptionDates] = useState("");
  const [copyBasis, setCopyBasis] = useState("");
  const [copyReference, setCopyReference] = useState("");
  const [copyKey, setCopyKey] = useState(() => crypto.randomUUID());
  const command = async (value: Parameters<typeof taxAnnualBatchAction>[0]) => { setPending(true); setError(""); try { const result = await taxAnnualBatchAction(value); if (result.error) setError(result.error); else if (["SIMULATE", "PROPERTY_BASES"].includes(value.command)) setInput({ ...input, idempotencyKey: crypto.randomUUID() }); else if (value.command === "COPY_RULE") setCopyKey(crypto.randomUUID()); } catch { setError("Falha de comunicação. A chave da operação foi preservada para reapresentação."); } finally { setPending(false); } };
  return <section className="space-y-4">{error && <p role="alert" className="text-red-700">{error}</p>}<p>Simulação persistida sem lançamento, guia ou efeito contábil. Efetivação usa a regra e os cadastros congelados; alteração exige nova simulação. Cada item confirmado registra lançamento, reconhecimento contábil e progresso do job na mesma transação.</p>
    <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void command({ command: "SIMULATE", input }); }}>
      <select required className={style} aria-label="Tributo" value={input.taxId} onChange={event => setInput({ ...input, taxId: event.target.value, parameterId: "", idempotencyKey: crypto.randomUUID() })}>{taxes.map(tax => <option key={tax.id} value={tax.id}>{tax.name}</option>)}</select>
      <select required className={style} aria-label="Regra fiscal versionada" value={input.parameterId} onChange={event => setInput({ ...input, parameterId: event.target.value })}><option value="">Selecione a regra fiscal vigente</option>{parameters.filter(parameter => parameter.taxId === input.taxId).map(parameter => <option key={parameter.id} value={parameter.id}>{parameter.name}</option>)}</select>
      <label>Competência<input type="date" required className={`${style} block`} value={input.competence} onChange={event => setInput({ ...input, competence: event.target.value })} /></label>
      <select className={style} aria-label="Tipo de alvo" value={input.targetType} onChange={event => setInput({ ...input, targetType: event.target.value as AnnualBatchInput["targetType"], targets: [{ targetId: "", taxableBase: "" }] })}><option value="TAXPAYER">Contribuintes</option><option value="REAL_ESTATE">Imóveis</option><option value="ECONOMIC_REGISTRATION">Inscrições econômicas</option></select>
      {input.targets.map((target, index) => <div key={index} className="grid gap-2 md:grid-cols-3"><select required className={style} aria-label={`Alvo ${index + 1}`} value={target.targetId} onChange={event => setInput({ ...input, targets: input.targets.map((row, at) => at === index ? { ...row, targetId: event.target.value } : row) })}><option value="">Selecione o cadastro</option>{targets.filter(option => option.type === input.targetType).map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select><input required className={style} aria-label={`Base tributável ${index + 1}`} placeholder="Base tributável BRL" inputMode="decimal" value={target.taxableBase} onChange={event => setInput({ ...input, targets: input.targets.map((row, at) => at === index ? { ...row, taxableBase: event.target.value.replace(",", ".") } : row) })} /><button type="button" disabled={input.targets.length === 1} className={style} onClick={() => setInput({ ...input, targets: input.targets.filter((_, at) => at !== index) })}>Remover alvo</button></div>)}
      <button type="button" className={style} onClick={() => setInput({ ...input, targets: [...input.targets, { targetId: "", taxableBase: "" }] })}>Adicionar cadastro</button>
      <textarea required minLength={10} className={style} aria-label="Fundamento da simulação" placeholder="Fundamento e memória da base informada" value={input.reason} onChange={event => setInput({ ...input, reason: event.target.value })} />
      <button disabled={pending || !input.taxId} className={style}>Salvar simulação anual</button>
      {input.targetType === "REAL_ESTATE" && <button type="button" disabled={pending || !input.taxId || !input.parameterId} className={style} onClick={() => void command({ command: "PROPERTY_BASES", input: { taxId: input.taxId, parameterId: input.parameterId, year: Number(input.competence.slice(0, 4)), realEstateIds: input.targets.map(target => target.targetId), reason: input.reason, idempotencyKey: input.idempotencyKey } })}>Gerar bases das avaliações canônicas do ano e simular em 01/01</button>}
    </form>
    <details className="rounded border p-3"><summary>Inicialização da regra do próximo exercício em 01/01</summary>
      <form className="grid gap-3 pt-3" onSubmit={event => {
        event.preventDefault();
        const lines = copyOptionDates.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const pairs = lines.map(line => line.split("=").map(value => value.trim()));
        if (pairs.some(pair => pair.length !== 2 || !pair[0] || !/^\d{4}-\d{2}-\d{2}$/.test(pair[1])) || new Set(pairs.map(pair => pair[0])).size !== pairs.length) { setError("Informe códigos distintos no formato CODIGO=AAAA-MM-DD, um por linha."); return; }
        void command({ command: "COPY_RULE", input: { taxId: input.taxId, parameterId: input.parameterId, sourceYear: copyYear - 1, targetYear: copyYear, calendar: copyCalendar.split(/[\s,;]+/).filter(Boolean), ...(pairs.length ? { paymentOptionDates: Object.fromEntries(pairs) } : {}), legalBasis: copyBasis, reference: copyReference, reason: input.reason, idempotencyKey: copyKey } });
      }}>
        <p>Selecione o tributo/regra de origem acima. A cópia conserva a memória anterior e exige vigências sem sobreposição, calendário do novo ano e fundamento informado.</p>
        <label>Novo exercício<input type="number" min={1901} max={2200} required className={`${style} block`} value={copyYear} onChange={event => setCopyYear(Number(event.target.value))}/></label>
        <label>Vencimentos (AAAA-MM-DD, um por parcela)<textarea required className={`${style} block w-full`} value={copyCalendar} onChange={event => setCopyCalendar(event.target.value)}/></label>
        <label>Novas datas das opções de cota única (opcional, CODIGO=AAAA-MM-DD por linha)<textarea className={`${style} block w-full`} value={copyOptionDates} onChange={event => setCopyOptionDates(event.target.value)}/></label>
        <p>Opções sem nova data conservam dia e mês no próximo exercício. Datas como 29 de fevereiro exigem ajuste explícito em ano não bissexto.</p>
        <label>Fundamento da nova vigência<textarea required minLength={10} className={`${style} block w-full`} value={copyBasis} onChange={event => setCopyBasis(event.target.value)}/></label>
        <label>Referência normativa<input required minLength={3} className={`${style} block w-full`} value={copyReference} onChange={event => setCopyReference(event.target.value)}/></label>
        <button disabled={pending || !input.parameterId} className={style}>Copiar regra anual com proveniência</button>
      </form>
    </details>
    <div className="grid gap-3 md:grid-cols-2"><label>Execução agendada (UTC)<input type="datetime-local" className={`${style} block`} value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} /></label><label>Fundamento da efetivação/cancelamento<input className={`${style} block w-full`} value={reason} onChange={event => setReason(event.target.value)} /></label></div>
    {batches.map(batch => <article key={batch.id} className="space-y-2 rounded border p-3"><h2>{batch.year} · {batch.status} · {batch.reason}</h2><p>{batch.items.filter(item => item.status === "COMPLETED").length}/{batch.items.length} itens confirmados · {batch.items.filter(item => item.status === "FAILED").length} falhas · {batch.scheduledAt ?? "Não agendado"}</p>{!["COMPLETED", "CANCELLED"].includes(batch.status) && <div className="flex gap-2"><button disabled={pending} className={style} onClick={() => void command({ command: "QUEUE", batchId: batch.id, scheduledAt: `${scheduledAt}:00.000Z`, reason })}>Agendar / reapresentar falhas</button><button disabled={pending} className={style} onClick={() => void command({ command: "PROCESS", batchId: batch.id })}>Processar próximos 25</button><button disabled={pending} className={style} onClick={() => void command({ command: "CANCEL", batchId: batch.id, reason })}>Cancelar lote não efetivado</button></div>}<details><summary>Memória e resultado individual</summary>{batch.items.map(item => <p key={item.id} className="border-b py-2 text-sm">{item.targetId} · base {item.base} BRL · simulado {item.amount} BRL · {item.status} · lançamento {item.assessmentId ?? "não efetivado"} {item.error}</p>)}</details></article>)}
  </section>;
}
