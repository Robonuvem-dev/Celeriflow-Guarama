"use client";
import { useState, useTransition } from "react";
import { TaxOperationalTable, TaxRowActions, TaxRowAction } from "../TaxOperationalTable";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import {
  Building2,
  Calculator,
  FileCheck2,
  PackageSearch,
  ShieldCheck,
} from "lucide-react";
import {
  communicateFiscalCaseAction,
  createAgencyAction,
  createInstitutionAction,
  issueGuideAction,
  openFiscalCaseAction,
  processImportAction,
  receiveImportAction,
  validateImportAction,
} from "./actions";

type Data = {
  taxpayers: { id: string; name: string; document: string }[];
  processes: { id: string; protocolNumber: string; status: string }[];
  institutions: {
    id: string;
    name: string;
    baseCnpj: string;
    status: string;
    taxpayerId: string | null;
    agencies: {
      id: string;
      code: string;
      name: string;
      fullCnpj: string;
      registration: string | null;
      status: string;
    }[];
    plans: {
      id: string;
      version: string;
      status: string;
      accounts: {
        id: string;
        code: string;
        name: string;
        subtitles: { id: string; code: string; name: string; rate: number }[];
        cosif: string[];
      }[];
    }[];
    tariffs: { id: string; code: string; name: string; amount: number }[];
    packages: { id: string; code: string; name: string; composition: string }[];
  }[];
  imports: {
    id: string;
    institution: string;
    agency: string;
    competence: string;
    moduleType: string;
    fileName: string;
    version: string;
    originMode: string;
    status: string;
    signaturePolicy: string;
    signatureStatus: string;
    receipt: string | null;
    inconsistencies: unknown;
  }[];
  assessments: {
    id: string;
    institution: string;
    agency: string;
    competence: string;
    subtitle: string;
    revenue: number;
    deduction: number;
    base: number;
    rate: number;
    grossTax: number;
    credit: number;
    debit: number;
    due: number;
    status: string;
    guideId: string | null;
  }[];
  balances: {
    id: string;
    agency: string;
    competence: string;
    account: string;
    opening: number;
    credits: number;
    debits: number;
    calculated: number;
    declared: number;
    difference: number;
    inconsistency: string | null;
  }[];
  movements: {
    id: string;
    agency: string;
    competence: string;
    package: string;
    holders: number;
    potential: number;
    collected: number;
    difference: number;
    impact: number;
  }[];
  cases: {
    id: string;
    institution: string;
    agency: string;
    competence: string;
    findingType: string;
    status: string;
    os: string | null;
    processId: string | null;
    tiafDocumentId: string | null;
    mapDocumentId: string | null;
    infractionId: string | null;
    dteMessageId: string | null;
    events: string[];
  }[];
};
const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const input =
  "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900";
const button =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md bg-amber-500 px-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50";
const secondary =
  "inline-flex h-8 items-center justify-center rounded-md border px-2 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900";
function errorList(value: unknown) {
  return Array.isArray(value) ? value.map(String).join("; ") : "";
}

export default function IssBancarioClient({ data }: { data: Data }) {
  const [tab, setTab] = useState("apuracao");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const [taxpayerId, setTaxpayerId] = useState(data.taxpayers[0]?.id ?? "");
  const [institutionId, setInstitutionId] = useState(
    data.institutions[0]?.id ?? "",
  );
  const [processId, setProcessId] = useState("");
  const [confronto, setConfronto] = useState("balancetes");
  const run = (job: () => Promise<{ error?: string }>) =>
    start(async () => {
      const response = await job();
      setMessage(response.error ?? "Operação concluída.");
    });
  const current = data.institutions.find((row) => row.id === institutionId);
  const submit =
    (handler: (form: FormData) => Promise<void>) =>
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void handler(new FormData(event.currentTarget));
    };
  const listView = ["apuracao", "historico-importacoes", "confrontos", "fiscalizacao"].includes(tab);
  const navigation = <select aria-label="Área do ISS bancário" value={tab} onChange={event => setTab(event.target.value)} className="h-7 rounded border px-2 text-[13px]">{[["apuracao", "Apuração"], ["importacoes", "Receber arquivo"], ["historico-importacoes", "Histórico de importações"], ["cadastros", "Instituições"], ["catalogo", "PGCC / COSIF"], ["confrontos", "Balancete / pacotes"], ["fiscalizacao", "Fiscalização bancária"]].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>;
  const toolbar = <>{navigation}{tab === "confrontos" && <select aria-label="Confronto" value={confronto} onChange={event => setConfronto(event.target.value)} className="h-7 rounded border text-[13px]"><option value="balancetes">Balancetes</option><option value="pacotes">Pacotes e correntistas</option></select>}<OperationalFilters label="Contexto e resultado">{message && <p role="status">{message}</p>}<p>O confronto de pacotes é independente e não duplica a mesma receita já apurada por COSIF/PGCC.</p><p>Escopo desta tela: omissão, diferença e ausência de movimento no ISS bancário. A fiscalização tributária geral permanece fora do S6.</p><p>Cenário de referência: R$ 10.000 − R$ 1.000 = R$ 9.000 × 5% = R$ 450 − R$ 50 = R$ 400.</p></OperationalFilters></>;
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-2.5">
      <OperationalHeaderActions>
        <select
          className={`${input} max-w-72`}
          value={taxpayerId}
          onChange={(event) => setTaxpayerId(event.target.value)}
        >
          {data.taxpayers.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </OperationalHeaderActions>
      {!listView && navigation}
      {message && !listView && (
        <button
          className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-left text-xs text-blue-800"
          onClick={() => setMessage("")}
        >
          {message}
        </button>
      )}
      {tab === "apuracao" && <TaxOperationalTable id="iss-bancario-apuracao" toolbar={toolbar}
        actions={<select aria-label="Processo para OS" className="h-7 max-w-48 rounded border text-[13px]" value={processId} onChange={event => setProcessId(event.target.value)}><option value="">OS sem processo</option>{data.processes.map(row => <option key={row.id} value={row.id}>{row.protocolNumber} · {row.status}</option>)}</select>}
        columns={[["institution", "Instituição", 80, 200], ["agency", "Agência", 64, 150], ["competence", "Competência", 56, 115], ["subtitle", "Subtítulo", 56, 130], ["revenue", "Receita", 48, 120, "text", "right"], ["deduction", "Dedução", 48, 120, "text", "right"], ["base", "Base", 48, 120, "text", "right"], ["rate", "Alíquota", 40, 90, "text", "right"], ["gross", "ISS", 48, 120, "text", "right"], ["credit", "Crédito", 48, 120, "text", "right"], ["debit", "Débito", 48, 120, "text", "right"], ["due", "A recolher", 48, 120, "text", "right"], ["actions", "Ações", 48, 60, "actions"]]}
        rows={data.assessments.map(row => ({ id: row.id, label: `${row.institution} · ${row.competence} · ${row.subtitle}`, values: { institution: row.institution, agency: row.agency, competence: row.competence, subtitle: row.subtitle, revenue: money(row.revenue), deduction: money(row.deduction), base: money(row.base), rate: `${row.rate}%`, gross: money(row.grossTax), credit: `-${money(row.credit)}`, debit: `+${money(row.debit)}`, due: money(row.due) }, actions: <TaxRowActions label={row.institution}>{row.guideId ? <TaxRowAction href={`/tributacao/iss-bancario/guias/${row.guideId}`} target="_blank">DAM</TaxRowAction> : <TaxRowAction disabled={pending} onClick={() => run(() => issueGuideAction(row.id))}>Gerar DAM</TaxRowAction>}{([ ["DIFERENCA", "OS diferença"], ["OMISSAO", "OS omissão"], ["SEM_MOVIMENTO", "OS sem movimento"] ] as const).map(([kind, label]) => <TaxRowAction key={kind} disabled={pending} onClick={() => run(() => openFiscalCaseAction(row.id, kind, processId || undefined))}>{label}</TaxRowAction>)}</TaxRowActions> }))} />}
      {tab === "confrontos" && confronto === "balancetes" && <TaxOperationalTable id="iss-bancario-balancetes" toolbar={toolbar}
        columns={[["agency", "Agência", 130, 190], ["account", "Conta", 110, 150, "identifier"], ["competence", "Competência", 100, 115], ["inconsistency", "Inconsistência", 150, 250], ["opening", "Inicial", 110, 140, "text", "right"], ["credits", "Créditos", 110, 140, "text", "right"], ["debits", "Débitos", 110, 140, "text", "right"], ["final", "Final", 110, 140, "text", "right"]]}
        rows={data.balances.map(row => ({ id: row.id, label: `${row.agency} · ${row.account}`, values: { agency: row.agency, account: row.account, competence: row.competence, inconsistency: row.inconsistency ?? "Sem diferença", opening: money(row.opening), credits: money(row.credits), debits: money(row.debits), final: money(row.calculated) } }))} />}
      {tab === "confrontos" && confronto === "pacotes" && <TaxOperationalTable id="iss-bancario-pacotes" toolbar={toolbar}
        columns={[["agency", "Agência", 130, 190], ["package", "Pacote", 130, 200], ["competence", "Competência", 100, 115], ["holders", "Correntistas", 100, 120, "text", "right"], ["potential", "Potencial", 110, 140, "text", "right"], ["collected", "Arrecadado", 110, 140, "text", "right"], ["difference", "Diferença", 110, 140, "text", "right"], ["impact", "Impacto", 110, 140, "text", "right"]]}
        rows={data.movements.map(row => ({ id: row.id, label: `${row.agency} · ${row.package}`, values: { agency: row.agency, package: row.package, competence: row.competence, holders: String(row.holders), potential: money(row.potential), collected: money(row.collected), difference: money(row.difference), impact: money(row.impact) } }))} />}
      {tab === "fiscalizacao" && <TaxOperationalTable id="iss-bancario-fiscalizacao" toolbar={toolbar}
        columns={[["institution", "Instituição", 80, 180], ["agency", "Agência", 64, 140], ["competence", "Competência", 56, 115], ["finding", "Achado", 56, 140], ["status", "Situação", 56, 140, "status"], ["order", "OS", 56, 130, "identifier"], ["process", "Processo", 56, 150, "identifier"], ["infraction", "Auto", 64, 180], ["communication", "Comunicação", 64, 180], ["history", "Histórico", 72, 220], ["actions", "Ações", 48, 60, "actions"]]}
        rows={data.cases.map(row => ({ id: row.id, label: row.os || row.id, values: { institution: row.institution, agency: row.agency, competence: row.competence, finding: row.findingType, status: row.status, order: row.os ?? "—", process: data.processes.find(item => item.id === row.processId)?.protocolNumber ?? "Sem processo", infraction: row.infractionId ? "Gerado" : "Pendente de vínculo fiscal", communication: row.dteMessageId ? "Disponibilizada no DTE" : "Não comunicada", history: row.events.join("\n") }, actions: <TaxRowActions label={row.os || row.id}><TaxRowAction href={`/tributacao/iss-bancario/fiscalizacoes/${row.id}/tiaf`} target="_blank">TIAF</TaxRowAction><TaxRowAction href={`/tributacao/iss-bancario/fiscalizacoes/${row.id}/mapa`} target="_blank">Mapa</TaxRowAction>{row.infractionId&&<TaxRowAction href={`/tributacao/iss-bancario/fiscalizacoes/${row.id}/auto`}>Visualizar / editar auto</TaxRowAction>}{!row.dteMessageId && <TaxRowAction onClick={() => run(() => communicateFiscalCaseAction(row.id))}>Comunicar DTE</TaxRowAction>}</TaxRowActions> }))} />}
      {tab === "historico-importacoes" && <TaxOperationalTable id="iss-bancario-importacoes" toolbar={toolbar}
        columns={[["file", "Arquivo", 80, 200], ["module", "Módulo", 56, 150], ["institution", "Instituição", 72, 180], ["agency", "Agência", 56, 140], ["competence", "Competência", 56, 115], ["version", "Versão", 40, 80], ["origin", "Origem", 56, 140], ["status", "Validação", 56, 150, "status"], ["policy", "Política de assinatura", 64, 190], ["signature", "Assinatura", 56, 150], ["errors", "Inconsistências", 72, 220], ["receipt", "Recibo", 64, 160, "identifier"], ["actions", "Ações", 48, 60, "actions"]]}
        rows={data.imports.map(row => ({ id: row.id, label: row.fileName, values: { file: row.fileName, module: row.moduleType, institution: row.institution, agency: row.agency, competence: row.competence, version: row.version, origin: row.originMode, status: row.status, policy: row.signaturePolicy, signature: row.signatureStatus, errors: errorList(row.inconsistencies), receipt: row.receipt || "Após processar" }, actions: <TaxRowActions label={row.fileName}>{row.receipt && <TaxRowAction href={`/tributacao/iss-bancario/importacoes/${row.id}/recibo`} target="_blank">Abrir recibo</TaxRowAction>}{["RECEBIDO", "INCONSISTENTE"].includes(row.status) && <TaxRowAction onClick={() => run(() => validateImportAction(row.id))}>Validar</TaxRowAction>}{row.status === "VALIDADO" && <TaxRowAction onClick={() => run(() => processImportAction(row.id))}>Processar</TaxRowAction>}</TaxRowActions> }))} />}
      <main className={listView ? "hidden print:block" : "min-h-0 flex-1 overflow-auto"}>
        {tab === "apuracao" && (
          <section className="rounded-lg border bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-center gap-2 border-b p-2">
              <Calculator className="size-4" />
              <b className="mr-auto text-sm">
                Apuração por instituição, agência, competência e subtítulo
              </b>
              <select
                className={`${input} max-w-64`}
                value={processId}
                onChange={(event) => setProcessId(event.target.value)}
              >
                <option value="">OS sem processo</option>
                {data.processes.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.protocolNumber} · {row.status}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-left dark:bg-slate-900">
                  <tr>
                    <th className="p-2">Instituição / agência</th>
                    <th className="p-2">Competência / subtítulo</th>
                    <th className="p-2 text-right">Receita</th>
                    <th className="p-2 text-right">Dedução / base</th>
                    <th className="p-2 text-right">Alíquota / ISS</th>
                    <th className="p-2 text-right">Crédito / débito</th>
                    <th className="p-2 text-right">A recolher</th>
                    <th className="p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.assessments.slice(0, 20).map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-2">
                        <b>{row.institution}</b>
                        <br />
                        {row.agency}
                      </td>
                      <td className="p-2">
                        {row.competence}
                        <br />
                        {row.subtitle}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {money(row.revenue)}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {money(row.deduction)}
                        <br />
                        <b>{money(row.base)}</b>
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {row.rate}%<br />
                        <b>{money(row.grossTax)}</b>
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        -{money(row.credit)} / +{money(row.debit)}
                      </td>
                      <td className="p-2 text-right font-bold tabular-nums text-emerald-700">
                        {money(row.due)}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {row.guideId ? (
                            <a
                              className={secondary}
                              href={`/tributacao/iss-bancario/guias/${row.guideId}`}
                              target="_blank"
                            >
                              DAM
                            </a>
                          ) : (
                            <button
                              className={button}
                              disabled={pending}
                              onClick={() =>
                                run(() => issueGuideAction(row.id))
                              }
                            >
                              Gerar DAM
                            </button>
                          )}
                          <button
                            className={secondary}
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                openFiscalCaseAction(
                                  row.id,
                                  "DIFERENCA",
                                  processId || undefined,
                                ),
                              )
                            }
                          >
                            OS diferença
                          </button>
                          <button
                            className={secondary}
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                openFiscalCaseAction(
                                  row.id,
                                  "OMISSAO",
                                  processId || undefined,
                                ),
                              )
                            }
                          >
                            OS omissão
                          </button>
                          <button
                            className={secondary}
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                openFiscalCaseAction(
                                  row.id,
                                  "SEM_MOVIMENTO",
                                  processId || undefined,
                                ),
                              )
                            }
                          >
                            OS sem movimento
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t p-2 text-[10px] text-slate-500">
              Cenário de referência: R$ 10.000 − R$ 1.000 = R$ 9.000 × 5% = R$
              450 − R$ 50 = R$ 400.
            </p>
          </section>
        )}
        {tab === "importacoes" && (
          <div className="grid gap-2 xl:grid-cols-[340px_1fr]">
            <form
              className="grid content-start gap-2 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
              onSubmit={submit(async (form) => {
                const file = form.get("file") as File;
                if (!file?.size)
                  return setMessage("Selecione um arquivo JSON.");
                let payload: unknown;
                try {
                  payload = JSON.parse(await file.text());
                } catch {
                  return setMessage("O arquivo precisa ser JSON válido.");
                }
                run(() =>
                  receiveImportAction({
                    institutionId: String(form.get("institutionId")),
                    agencyId: String(form.get("agencyId")) || undefined,
                    competence: String(form.get("competence")),
                    moduleType: String(form.get("moduleType")),
                    fileName: file.name,
                    abrasfVersion: String(form.get("version")),
                    signaturePolicy: String(form.get("signaturePolicy")) as
                      "NAO_CONFIGURADA" | "ASSINATURA_INTERNA",
                    payload: payload as never,
                  }),
                );
              })}
            >
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <FileCheck2 className="size-4" />
                Receber arquivo DES-IF
              </h2>
              <label className="text-xs">
                Instituição
                <select
                  name="institutionId"
                  className={input}
                  value={institutionId}
                  onChange={(event) => setInstitutionId(event.target.value)}
                >
                  {data.institutions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                Agência
                <select name="agencyId" className={input}>
                  <option value="">Todas</option>
                  {current?.agencies.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs">
                  Competência
                  <input className={input} name="competence" required />
                </label>
                <label className="text-xs">
                  Versão
                  <input className={input} name="version" required />
                </label>
              </div>
              <label className="text-xs">
                Módulo
                <select className={input} name="moduleType">
                  <option>APURACAO</option>
                  <option>BALANCETE</option>
                  <option>TARIFAS</option>
                  <option>APURACAO_BALANCETE_TARIFAS</option>
                </select>
              </label>
              <label className="text-xs">
                Assinatura
                <select className={input} name="signaturePolicy">
                  <option value="NAO_CONFIGURADA">Não configurada</option>
                  <option value="ASSINATURA_INTERNA">Assinatura interna</option>
                </select>
              </label>
              <input
                className={input}
                name="file"
                type="file"
                accept="application/json,.json"
              />
              <button className={button} disabled={pending}>
                Receber arquivo
              </button>
              <p className="text-[10px] text-slate-500">
                A tela não declara validação ICP-Brasil. O perfil oficial
                depende de leiaute e provedor homologados.
              </p>
            </form>
            <section className="hidden print:block">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 text-left dark:bg-slate-900">
                    <tr>
                      <th className="p-2">Arquivo</th>
                      <th className="p-2">Instituição</th>
                      <th className="p-2">Competência / versão</th>
                      <th className="p-2">Validação / assinatura</th>
                      <th className="p-2">Recibo</th>
                      <th className="p-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.imports.slice(0, 20).map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-2">
                          <b>{row.fileName}</b>
                          <br />
                          {row.moduleType}
                        </td>
                        <td className="p-2">
                          {row.institution}
                          <br />
                          {row.agency}
                        </td>
                        <td className="p-2">
                          {row.competence}
                          <br />
                          {row.version} · {row.originMode}
                        </td>
                        <td className="p-2">
                          <b>{row.status}</b>
                          <br />
                          {row.signaturePolicy}: {row.signatureStatus}
                          <br />
                          <span className="text-rose-600">
                            {errorList(row.inconsistencies)}
                          </span>
                        </td>
                        <td className="p-2">
                          {row.receipt ? (
                            <a
                              className="text-blue-600 underline"
                              target="_blank"
                              href={`/tributacao/iss-bancario/importacoes/${row.id}/recibo`}
                            >
                              {row.receipt}
                            </a>
                          ) : (
                            "Após processar"
                          )}
                        </td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            {["RECEBIDO", "INCONSISTENTE"].includes(
                              row.status,
                            ) && (
                              <button
                                className={secondary}
                                onClick={() =>
                                  run(() => validateImportAction(row.id))
                                }
                              >
                                Validar
                              </button>
                            )}
                            {row.status === "VALIDADO" && (
                              <button
                                className={button}
                                onClick={() =>
                                  run(() => processImportAction(row.id))
                                }
                              >
                                Processar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
        {tab === "cadastros" && (
          <div className="grid gap-2 xl:grid-cols-[360px_1fr]">
            <div className="grid content-start gap-2">
              <form
                className="grid gap-2 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
                onSubmit={submit(async (form) =>
                  run(() =>
                    createInstitutionAction({
                      taxpayerId: String(form.get("taxpayerId")) || undefined,
                      name: String(form.get("name")),
                      baseCnpj: String(form.get("baseCnpj")),
                      validFrom: String(form.get("validFrom")),
                    }),
                  ),
                )}
              >
                <h2 className="text-sm font-bold">Instituição financeira</h2>
                <select className={input} name="taxpayerId">
                  <option value="">Sem vínculo fiscal</option>
                  {data.taxpayers.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
                <input
                  className={input}
                  name="name"
                  placeholder="Nome"
                  required
                />
                <input
                  className={input}
                  name="baseCnpj"
                  placeholder="CNPJ base (8 dígitos)"
                  required
                />
                <input
                  className={input}
                  name="validFrom"
                  type="date"
                  defaultValue="2026-01-01"
                  required
                />
                <button className={button}>Salvar instituição</button>
              </form>
              <form
                className="grid gap-2 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
                onSubmit={submit(async (form) =>
                  run(() =>
                    createAgencyAction({
                      institutionId: String(form.get("institutionId")),
                      code: String(form.get("code")),
                      name: String(form.get("name")),
                      fullCnpj: String(form.get("fullCnpj")),
                      municipalRegistration:
                        String(form.get("registration")) || undefined,
                      validFrom: String(form.get("validFrom")),
                    }),
                  ),
                )}
              >
                <h2 className="text-sm font-bold">Agência / dependência</h2>
                <select className={input} name="institutionId">
                  {data.institutions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
                <input
                  className={input}
                  name="code"
                  placeholder="Código"
                  required
                />
                <input
                  className={input}
                  name="name"
                  placeholder="Nome"
                  required
                />
                <input
                  className={input}
                  name="fullCnpj"
                  placeholder="CNPJ completo"
                  required
                />
                <input
                  className={input}
                  name="registration"
                  placeholder="Inscrição municipal"
                />
                <input
                  className={input}
                  name="validFrom"
                  type="date"
                  defaultValue="2026-01-01"
                  required
                />
                <button className={button}>Salvar agência</button>
              </form>
            </div>
            <section className="grid content-start gap-2">
              {data.institutions.slice(0, 20).map((row) => (
                <article
                  key={row.id}
                  className="rounded-lg border bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-950"
                >
                  <h3 className="font-bold">
                    {row.name} · CNPJ base {row.baseCnpj}
                  </h3>
                  <p>
                    {row.status} · vínculo fiscal{" "}
                    {row.taxpayerId ? "configurado" : "pendente"}
                  </p>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                    {row.agencies.map((agency) => (
                      <div
                        key={agency.id}
                        className="rounded border p-2 dark:border-slate-700"
                      >
                        <b>
                          {agency.code} — {agency.name}
                        </b>
                        <br />
                        {agency.fullCnpj} · IM{" "}
                        {agency.registration ?? "não informada"} ·{" "}
                        {agency.status}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </section>
          </div>
        )}
        {tab === "catalogo" && (
          <section className="grid gap-2 xl:grid-cols-2">
            {data.institutions.slice(0, 20).map((row) => (
              <article
                key={row.id}
                className="rounded-lg border bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-950"
              >
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <Building2 className="size-4" />
                  {row.name}
                </h2>
                {row.plans.map((plan) => (
                  <div
                    key={plan.id}
                    className="mt-2 rounded border p-2 dark:border-slate-700"
                  >
                    <b>PGCC {plan.version}</b> · {plan.status}
                    {plan.accounts.map((account) => (
                      <div key={account.id} className="mt-1 border-t pt-1">
                        <b>
                          {account.code} — {account.name}
                        </b>
                        <br />
                        COSIF: {account.cosif.join(", ") || "sem vínculo"}
                        <br />
                        Subtítulos:{" "}
                        {account.subtitles
                          .map((item) => `${item.code} (${item.rate}%)`)
                          .join(", ")}
                      </div>
                    ))}
                  </div>
                ))}
                <div className="mt-2">
                  <b>Tarifas:</b>{" "}
                  {row.tariffs
                    .map((item) => `${item.code} ${money(item.amount)}`)
                    .join(", ") || "—"}
                </div>
                <div>
                  <b>Pacotes:</b>{" "}
                  {row.packages
                    .map((item) => `${item.code} (${item.composition})`)
                    .join(", ") || "—"}
                </div>
              </article>
            ))}
          </section>
        )}
        {tab === "confrontos" && (
          <div className="grid gap-2 xl:grid-cols-2">
            <section className="rounded-lg border bg-white dark:border-slate-800 dark:bg-slate-950">
              <h2 className="flex items-center gap-2 border-b p-2 text-sm font-bold">
                <ShieldCheck className="size-4" />
                Balancetes e confrontos
              </h2>
              {data.balances.slice(0, 20).map((row) => (
                <article
                  key={row.id}
                  className="grid grid-cols-2 gap-1 border-t p-2 text-[11px] sm:grid-cols-4"
                >
                  <b className="col-span-2">
                    {row.agency} · {row.account}
                  </b>
                  <span>{row.competence}</span>
                  <span
                    className={
                      row.difference
                        ? "font-bold text-rose-600"
                        : "font-bold text-emerald-700"
                    }
                  >
                    {row.inconsistency ?? "Sem diferença"}
                  </span>
                  <span>Inicial {money(row.opening)}</span>
                  <span>Créditos {money(row.credits)}</span>
                  <span>Débitos {money(row.debits)}</span>
                  <span>Final {money(row.calculated)}</span>
                </article>
              ))}
            </section>
            <section className="rounded-lg border bg-white dark:border-slate-800 dark:bg-slate-950">
              <h2 className="flex items-center gap-2 border-b p-2 text-sm font-bold">
                <PackageSearch className="size-4" />
                Pacotes e correntistas
              </h2>
              {data.movements.slice(0, 20).map((row) => (
                <article
                  key={row.id}
                  className="grid grid-cols-2 gap-1 border-t p-2 text-[11px] sm:grid-cols-3"
                >
                  <b className="col-span-2">
                    {row.agency} · {row.package}
                  </b>
                  <span>{row.competence}</span>
                  <span>{row.holders} correntistas</span>
                  <span>Potencial {money(row.potential)}</span>
                  <span>Arrecadado {money(row.collected)}</span>
                  <span className="font-bold">
                    Diferença {money(row.difference)}
                  </span>
                  <span className="font-bold text-amber-700">
                    Impacto {money(row.impact)}
                  </span>
                </article>
              ))}
              <p className="border-t p-2 text-[10px] text-slate-500">
                O confronto de pacotes é independente e não duplica a mesma
                receita já apurada por COSIF/PGCC.
              </p>
            </section>
          </div>
        )}
        {tab === "fiscalizacao" && (
          <section className="rounded-lg border bg-white dark:border-slate-800 dark:bg-slate-950">
            <h2 className="flex items-center gap-2 border-b p-2 text-sm font-bold">
              <ShieldCheck className="size-4" />
              Fiscalização bancária
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-left dark:bg-slate-900">
                  <tr>
                    <th className="p-2">Instituição / agência</th>
                    <th className="p-2">Achado</th>
                    <th className="p-2">OS / Processo</th>
                    <th className="p-2">TIAF / mapa / auto</th>
                    <th className="p-2">Comunicação</th>
                    <th className="p-2">Histórico</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cases.slice(0, 20).map((row) => (
                    <tr key={row.id} className="border-t align-top">
                      <td className="p-2">
                        <b>{row.institution}</b>
                        <br />
                        {row.agency} · {row.competence}
                      </td>
                      <td className="p-2">
                        <b>{row.findingType}</b>
                        <br />
                        {row.status}
                      </td>
                      <td className="p-2">
                        {row.os}
                        <br />
                        {data.processes.find(
                          (item) => item.id === row.processId,
                        )?.protocolNumber ?? "Sem processo"}
                      </td>
                      <td className="p-2">
                        <a
                          className="text-blue-600 underline"
                          target="_blank"
                          href={`/tributacao/iss-bancario/fiscalizacoes/${row.id}/tiaf`}
                        >
                          TIAF
                        </a>{" "}
                        ·{" "}
                        <a
                          className="text-blue-600 underline"
                          target="_blank"
                          href={`/tributacao/iss-bancario/fiscalizacoes/${row.id}/mapa`}
                        >
                          Mapa
                        </a>
                        <br />
                        Auto{" "}
                        {row.infractionId
                          ? "gerado"
                          : "pendente de vínculo fiscal"}
                      </td>
                      <td className="p-2">
                        {row.dteMessageId ? (
                          "Disponibilizada no DTE"
                        ) : (
                          <button
                            className={button}
                            onClick={() =>
                              run(() => communicateFiscalCaseAction(row.id))
                            }
                          >
                            Comunicar DTE
                          </button>
                        )}
                      </td>
                      <td className="p-2">
                        <details>
                          <summary>{row.events.length} eventos</summary>
                          {row.events.map((event, index) => (
                            <p key={index}>{event}</p>
                          ))}
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t p-2 text-[10px] text-slate-500">
              Escopo desta tela: omissão, diferença e ausência de movimento no
              ISS bancário. A fiscalização tributária geral permanece fora do
              S6.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
