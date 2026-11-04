"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { z } from "zod";
import type { simplesOptionLayoutSchema } from "@/lib/tributacao/simples-option-files";
import { publishSimplesLayoutAction, importSimplesOptionFileAction, decideSimplesOptionAction } from "./actions";

type Layout = z.infer<typeof simplesOptionLayoutSchema>;

export default function SimplesOptionFilesClient(props: {
  units: { id: string; entityId: string; label: string }[];
  layouts: { version: number; data: Layout }[];
  files: { id: string; budgetUnitId: string; filename: string; createdAt: string; checksum: string; rows: { cnpj: string; name: string; balance: string; pending: string[] }[] }[];
  decisions: { id: string; fileId: string; cnpj: string; version: number; approved: boolean; reason: string; actor: string }[];
}) {
  const defaultUnitId = props.units[0]?.id ?? "";
  const [unitId, setUnitId] = useState(defaultUnitId);
  const [fileId, setFileId] = useState(() => props.files.find((row) => row.budgetUnitId === defaultUnitId)?.id ?? "");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const unit = props.units.find((row) => row.id === unitId);
  const layout = props.layouts.find((row) => row.data.budgetUnitId === unitId);
  const selected = props.files.find((row) => row.id === fileId && row.budgetUnitId === unitId);
  const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900";
  const text = (form: FormData, key: string) => String(form.get(key) ?? "");
  const number = (form: FormData, key: string) => Number(form.get(key));
  const separators = (
    <>
      <option value=";">Ponto e vírgula</option>
      <option value="|">Barra vertical</option>
      <option value=",">Vírgula</option>
      <option value={"\t"}>Tabulação</option>
    </>
  );

  return (
    <div className="mx-auto h-full max-w-6xl space-y-4 overflow-auto p-4 sm:p-6">
      <header className="cf-portal-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Simples Nacional e MEI (CF27)</p>
            <h1 className="text-xl font-bold text-slate-900">Arquivos de Opção e Termos Municipais</h1>
            <p className="mt-1 text-xs text-slate-600">
              Configuração de layout de arquivos de opção, importação e verificação de pendências fiscais, deferimento/indeferimento e emissão de termos em PDF.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/tributacao/simples-nacional/consulta" className="cf-portal-btn-secondary">Consulta por Contribuinte</Link>
            <Link href="/tributacao/simples-nacional" className="cf-portal-btn-secondary">← Painel Simples Nacional</Link>
          </div>
        </div>
      </header>

      {notice && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900">
          {notice}
        </p>
      )}

      <section className="cf-portal-card grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-700">
          Ente / Unidade Gestora (UG)
          <select
            value={unitId}
            onChange={(event) => {
              const nextUnitId = event.target.value;
              setUnitId(nextUnitId);
              setFileId(props.files.find((row) => row.budgetUnitId === nextUnitId)?.id ?? "");
            }}
            className={field}
          >
            <option value="">Selecione</option>
            {props.units.map((row) => (
              <option key={row.id} value={row.id}>{row.label}</option>
            ))}
          </select>
        </label>
        {unit && (
          <label className="block text-xs font-semibold text-slate-700">
            Histórico de arquivos importados
            <select value={fileId} onChange={(event) => setFileId(event.target.value)} className={field}>
              <option value="">Selecione um arquivo importado</option>
              {props.files
                .filter((row) => row.budgetUnitId === unitId)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.filename} · {new Date(row.createdAt).toLocaleString("pt-BR")} · {row.rows.length} empresas
                  </option>
                ))}
            </select>
          </label>
        )}
      </section>

      {unit && (
        <>
          <details className="cf-portal-card" open={!layout?.data.active}>
            <summary className="cursor-pointer text-sm font-bold text-slate-900">Layout do arquivo e modelos dos termos de opção</summary>
            <form
              key={`${unitId}:${layout?.version ?? 0}`}
              action={(form) =>
                startTransition(async () => {
                  const result = await publishSimplesLayoutAction({
                    governmentEntityId: unit.entityId,
                    budgetUnitId: unit.id,
                    expectedVersion: layout?.version ?? 0,
                    name: text(form, "name"),
                    active: form.get("active") === "on",
                    format: text(form, "format") as Layout["format"],
                    delimiter: text(form, "delimiter") as Layout["delimiter"],
                    cnpjColumn: number(form, "column"),
                    cnpjStart: number(form, "start"),
                    cnpjLength: number(form, "length"),
                    headerRows: number(form, "headers"),
                    footerRows: number(form, "footers"),
                    outputDelimiter: text(form, "outputDelimiter") as Layout["outputDelimiter"],
                    outputHeader: text(form, "outputHeader"),
                    approvalTitle: text(form, "approval"),
                    refusalTitle: text(form, "refusal"),
                    termText: text(form, "term"),
                    legalBasis: text(form, "basis"),
                  });
                  setNotice(result.error ?? "Layout e termos publicados com nova versão.");
                })
              }
              className="cf-portal-form mt-3 grid gap-3 sm:grid-cols-3"
            >
              <label className="text-xs">
                Nome do layout
                <input name="name" defaultValue={layout?.data.name ?? "Opção pelo Simples Nacional"} required className={field} />
              </label>
              <label className="flex items-center gap-2 pt-5 text-xs font-semibold">
                <input name="active" type="checkbox" defaultChecked={layout?.data.active ?? true} />
                Layout ativo
              </label>
              <label className="text-xs">
                Formato
                <select name="format" defaultValue={layout?.data.format ?? "DELIMITED"} className={field}>
                  <option value="DELIMITED">Delimitado</option>
                  <option value="FIXED">Posições fixas</option>
                </select>
              </label>
              <label className="text-xs">
                Separador de entrada
                <select name="delimiter" defaultValue={layout?.data.delimiter ?? ";"} className={field}>{separators}</select>
              </label>
              {(
                [
                  ["column", "Coluna do CNPJ (inicia em 1)", layout?.data.cnpjColumn ?? 1],
                  ["start", "Posição inicial do CNPJ (inicia em 1)", layout?.data.cnpjStart ?? 1],
                  ["length", "Tamanho do campo CNPJ", layout?.data.cnpjLength ?? 14],
                  ["headers", "Linhas de cabeçalho a ignorar", layout?.data.headerRows ?? 0],
                  ["footers", "Linhas finais a ignorar", layout?.data.footerRows ?? 0],
                ] as const
              ).map(([key, label, value]) => (
                <label key={key} className="text-xs">
                  {label}
                  <input name={key} type="number" min={key === "headers" || key === "footers" ? 0 : 1} defaultValue={value} required className={field} />
                </label>
              ))}
              <label className="text-xs">
                Separador de saída
                <select name="outputDelimiter" defaultValue={layout?.data.outputDelimiter ?? ";"} className={field}>{separators}</select>
              </label>
              <label className="text-xs">
                Cabeçalho do arquivo de pendências
                <input name="outputHeader" defaultValue={layout?.data.outputHeader ?? "CNPJ;PENDENCIAS;SALDO"} className={field} />
              </label>
              <label className="text-xs">
                Título do deferimento
                <input name="approval" defaultValue={layout?.data.approvalTitle ?? "Termo de deferimento municipal — Simples Nacional"} required className={field} />
              </label>
              <label className="text-xs">
                Título do indeferimento
                <input name="refusal" defaultValue={layout?.data.refusalTitle ?? "Termo de indeferimento municipal — Simples Nacional"} required className={field} />
              </label>
              <label className="text-xs sm:col-span-3">
                Texto do termo
                <textarea name="term" defaultValue={layout?.data.termText ?? "A Administração Tributária Municipal comunica o resultado da verificação de regularidade fiscal para opção pelo Simples Nacional."} required rows={3} className={field} />
              </label>
              <label className="text-xs sm:col-span-3">
                Fundamento legal
                <textarea name="basis" defaultValue={layout?.data.legalBasis ?? "Lei Complementar nº 123/2006 e Resolução CGSN nº 140/2018."} required rows={2} className={field} />
              </label>
              <div className="sm:col-span-3">
                <button disabled={pending} className="cf-portal-btn">Publicar layout</button>
              </div>
            </form>
          </details>

          {layout?.data.active && (
            <form
              action={(form) =>
                startTransition(async () => {
                  try {
                    const file = form.get("file");
                    if (!(file instanceof File) || !file.size || file.size > 2 * 1024 * 1024) throw new Error("Selecione um TXT de até 2 MB.");
                    const bytes = new Uint8Array(await file.arrayBuffer());
                    let binary = "";
                    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
                    const result = await importSimplesOptionFileAction({
                      governmentEntityId: unit.entityId,
                      budgetUnitId: unit.id,
                      expectedLayoutVersion: layout.version,
                      filename: file.name,
                      originalBase64: btoa(binary),
                      encoding: text(form, "encoding") as "utf-8" | "windows-1252",
                    });
                    setNotice(result.error ?? "Arquivo importado e arquivo de pendências gerado.");
                    if (result.id) setFileId(result.id);
                  } catch (error) {
                    setNotice(error instanceof Error ? error.message : "Não foi possível ler o arquivo.");
                  }
                })
              }
              className="cf-portal-card cf-portal-form grid items-end gap-3 sm:grid-cols-3"
            >
              <label className="text-xs">
                Arquivo TXT de opção
                <input name="file" type="file" accept=".txt,text/plain" required className={field} />
              </label>
              <label className="text-xs">
                Codificação
                <select name="encoding" className={field}>
                  <option value="utf-8">UTF-8</option>
                  <option value="windows-1252">Windows-1252</option>
                </select>
              </label>
              <div>
                <button disabled={pending} className="cf-portal-btn">Importar e analisar pendências</button>
              </div>
            </form>
          )}
        </>
      )}

      {selected && (
        <section className="cf-portal-card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Arquivo selecionado: {selected.filename}</h2>
              <p className="break-all text-xs text-slate-500">SHA-256 da entrada: {selected.checksum}</p>
            </div>
            <nav className="flex flex-wrap gap-2 text-xs">
              <a href={`/api/tributacao/simples/arquivos/${selected.id}?tipo=entrada`} className="cf-portal-btn-secondary">
                Baixar arquivo original
              </a>
              <a href={`/api/tributacao/simples/arquivos/${selected.id}?tipo=saida`} className="cf-portal-btn-secondary">
                Baixar saída de pendências
              </a>
            </nav>
          </div>
          {selected.rows.map((row) => {
            const decision = props.decisions.find((item) => item.fileId === selected.id && item.cnpj === row.cnpj);
            return (
              <details key={row.cnpj} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <summary className="cursor-pointer text-xs font-semibold text-slate-800">
                  {row.cnpj} · {row.name} · Saldo R$ {row.balance} · {row.pending.join(", ") || "Sem pendências na posição importada"}
                  {decision ? ` · ${decision.approved ? "Deferido" : "Indeferido"}` : " · Aguardando decisão"}
                </summary>
                <form
                  key={`${selected.id}:${row.cnpj}:${decision?.version ?? 0}`}
                  action={(form) =>
                    startTransition(async () => {
                      const result = await decideSimplesOptionAction({
                        fileId: selected.id,
                        cnpj: row.cnpj,
                        expectedVersion: decision?.version ?? 0,
                        approved: form.get("decision") === "true",
                        reason: text(form, "reason"),
                      });
                      setNotice(result.error ?? "Decisão municipal registrada.");
                    })
                  }
                  className="cf-portal-form mt-3 grid gap-3 sm:grid-cols-2"
                >
                  <label className="text-xs">
                    Decisão
                    <select name="decision" defaultValue={decision ? String(decision.approved) : row.pending.length ? "false" : "true"} className={field}>
                      <option value="true">Deferir</option>
                      <option value="false">Indeferir</option>
                    </select>
                  </label>
                  <label className="text-xs">
                    Fundamento
                    <textarea name="reason" defaultValue={decision?.reason ?? "Análise municipal de regularidade cadastral e fiscal."} required className={field} />
                  </label>
                  <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                    <button disabled={pending} className="cf-portal-btn">Registrar decisão</button>
                    {decision && (
                      <a href={`/api/tributacao/simples/termos/${decision.id}`} className="cf-portal-btn-secondary">
                        Emitir termo em PDF · {decision.actor}
                      </a>
                    )}
                  </div>
                </form>
              </details>
            );
          })}
        </section>
      )}
    </div>
  );
}
