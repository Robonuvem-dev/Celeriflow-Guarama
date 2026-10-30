"use client";
import { useMemo, useState, useTransition } from "react";
import { TaxOperationalTable, TaxRowActions, TaxRowAction } from "../TaxOperationalTable";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import {
  Calculator,
  FileText,
  ListChecks,
  Search,
  Settings2,
  Target,
} from "lucide-react";
import {
  acknowledgeTiafAction,
  cancelTiafAction,
  closeOrderAction,
  communicateDocumentAction,
  confirmProductivityAction,
  createAssessmentMapAction,
  createFiscalPlanAction,
  createOrderFromMeshAction,
  createStandaloneOrderAction,
  finalizeMapAction,
  generatePlanOrdersAction,
  issueSeizureAction,
  issueTiafAction,
  markOrderReadAction,
  receiveDocumentAction,
  returnDocumentAction,
  runMeshesAction,
  savePenaltyRuleAction,
  saveTemplateAction,
} from "./s7-actions";
type Data = {
  taxpayers: {
    id: string;
    name: string;
    document: string;
    cnae: string;
    serviceItem: string;
    neighborhood: string;
    street: string;
  }[];
  properties: {
    id: string;
    name: string;
    taxpayerId: string | null;
    propertyType: string;
    street: string;
    neighborhood: string;
    fiscalZone: string;
    fiscalSector: string;
  }[];
  employees: {
    id: string;
    name: string;
    registration: string;
    salaryBase: number;
  }[];
  plans: {
    id: string;
    year: number;
    name: string;
    type: string;
    status: string;
    selections: number;
    inspectors: string[];
    orders: number;
    filters: unknown;
    events: string[];
  }[];
  orders: {
    id: string;
    number: string;
    origin: string;
    status: string;
    subject: string;
    taxpayerId: string | null;
    realEstateId: string | null;
    employee: string;
    employeeId: string;
    reason: string;
    issuedAt: string;
    readAt: string | null;
    closedAt: string | null;
    documents: {
      id: string;
      kind: string;
      number: string;
      status: string;
      issuedAt: string;
    }[];
    requests: {
      id: string;
      description: string;
      status: string;
      deadline: string;
      receivedBy: string | null;
      returnedTo: string | null;
    }[];
    maps: {
      id: string;
      version: number;
      type: string;
      status: string;
      competence: string;
      base: number;
      principal: number;
      penalty: number;
      additions: number;
      discount: number;
      total: number;
    }[];
    events: string[];
  }[];
  findings: {
    id: string;
    taxpayer: string;
    competence: string;
    status: string;
    nfse: number;
    simples: number;
    cards: number;
    desif: number;
    difference: number;
    rate: number;
    potential: number;
    causes: string[];
    hasOrder: boolean;
  }[];
  productivity: {
    id: string;
    employee: string;
    employeeId: string;
    competence: string;
    status: string;
    points: number;
    pointValue: number;
    gross: number;
    cap: number;
    excess: number;
    adjustment: number;
    final: number;
    ledger: { type: string; amount: number; description: string }[];
  }[];
  templates: {
    id: string;
    code: string;
    name: string;
    kind: string;
    body: string;
    version: number;
    status: string;
  }[];
  rules: {
    id: string;
    code: string;
    name: string;
    type: string;
    penalty: number;
    discount: number;
    interest: number;
    correction: number;
    legalBasis: string;
  }[];
};
const input =
  "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900";
const primary =
  "inline-flex h-8 items-center justify-center rounded-md bg-amber-500 px-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50";
const secondary =
  "inline-flex h-8 items-center justify-center rounded-md border px-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900";
const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export default function FiscalizacaoClient({ data }: { data: Data }) {
  const [templateId, setTemplateId] = useState("");
  const editingTemplate = data.templates.find(row => row.id === templateId);
  const [tab, setTab] = useState("planejamento");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const [competence, setCompetence] = useState("2026-09");
  const [employeeId, setEmployeeId] = useState(data.employees[0]?.id ?? "");
  const [filter, setFilter] = useState("");
  const run = (job: () => Promise<{ error?: string }>) =>
    start(async () => {
      const response = await job();
      setMessage(response.error ?? "Operação concluída.");
    });
  const submit =
    (handler: (form: FormData) => void) =>
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      handler(new FormData(event.currentTarget));
    };
  const eligible = useMemo(
    () =>
      data.taxpayers.filter((row) =>
        [row.name, row.cnae, row.neighborhood, row.street]
          .join(" ")
          .toLowerCase()
          .includes(filter.toLowerCase()),
      ),
    [data.taxpayers, filter],
  );
  const listView = ["malhas", "documentos", "produtividade"].includes(tab);
  const navigation = <select aria-label="Área da fiscalização" value={tab} onChange={event => setTab(event.target.value)} className="h-7 rounded border px-2 text-[13px]">{[["planejamento", "Planejamento"], ["malhas", "Malhas"], ["ordens", "Ordens e ação fiscal"], ["documentos", "Documentos e autos"], ["produtividade", "Produtividade"], ["parametros", "Modelos e regras"]].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>;
  const toolbar = <>{navigation}{message && <OperationalFilters label="Resultado"><p role="status">{message}</p></OperationalFilters>}</>;
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-2.5">
      <OperationalHeaderActions>
        <div className="flex gap-1">
          <input
            className={`${input} w-28`}
            value={competence}
            onChange={(event) => setCompetence(event.target.value)}
          />
          <select
            className={`${input} max-w-52`}
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
          >
            {data.employees.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </div>
      </OperationalHeaderActions>
      {!listView && navigation}
      {message && !listView && (
        <button
          onClick={() => setMessage("")}
          className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-left text-xs text-blue-800"
        >
          {message}
        </button>
      )}
      {tab === "malhas" && <TaxOperationalTable id="fiscalizacao-malhas" toolbar={toolbar}
        actions={<button className="h-7 rounded border px-2 text-xs" onClick={() => run(() => runMeshesAction(competence))}>Cruzar fontes</button>}
        columns={[["taxpayer", "Contribuinte", 80, 220], ["competence", "Competência", 56, 115], ["status", "Situação", 56, 130, "status"], ["nfse", "NFS-e", 48, 120, "text", "right"], ["simples", "Simples", 48, 120, "text", "right"], ["cards", "Cartões", 48, 120, "text", "right"], ["desif", "DES-IF", 48, 120, "text", "right"], ["difference", "Diferença", 48, 120, "text", "right"], ["rate", "Alíquota", 40, 90, "text", "right"], ["potential", "Potencial", 48, 120, "text", "right"], ["causes", "Causas", 72, 180], ["order", "Ordem fiscal", 56, 90], ["actions", "Ações", 48, 60, "actions"]]}
        rows={data.findings.map(row => ({ id: row.id, label: row.taxpayer, values: { taxpayer: row.taxpayer, competence: row.competence, status: row.status, nfse: money(row.nfse), simples: money(row.simples), cards: money(row.cards), desif: money(row.desif), difference: money(row.difference), rate: `${row.rate}%`, potential: money(row.potential), causes: row.causes.join("; ") || "Sem divergência", order: row.hasOrder ? "OS vinculada" : "Sem OS" }, actions: row.hasOrder ? null : <TaxRowActions label={row.taxpayer}><TaxRowAction disabled={!employeeId} onClick={() => run(() => createOrderFromMeshAction(row.id, employeeId))}>Abrir análise</TaxRowAction></TaxRowActions> }))} />}
      {tab === "documentos" && <TaxOperationalTable id="fiscalizacao-documentos" toolbar={toolbar}
        columns={[["order", "OS", 100, 130, "identifier"], ["subject", "Assunto", 150, 240], ["kind", "Tipo", 100, 130], ["number", "Documento", 120, 160, "identifier"], ["status", "Situação", 100, 130, "status"], ["date", "Emissão", 155, 180], ["actions", "Ações", 60, 60, "actions"]]}
        rows={data.orders.flatMap(order => order.documents.map(doc => ({ id: doc.id, label: doc.number, values: { order: order.number, subject: order.subject, kind: doc.kind, number: doc.number, status: doc.status, date: new Date(doc.issuedAt).toLocaleString("pt-BR") }, actions: <TaxRowActions label={doc.number}><TaxRowAction href={`/tributacao/fiscalizacao/documentos/${doc.id}`} target="_blank">Visualizar</TaxRowAction><TaxRowAction onClick={() => run(() => communicateDocumentAction(doc.id))}>Enviar DTE</TaxRowAction>{doc.kind === "TIAF" && doc.status === "ABERTO" && <><TaxRowAction onClick={() => { const receivedBy = prompt("Pessoa que recebeu a correspondência"); if (receivedBy) run(() => acknowledgeTiafAction(doc.id, receivedBy)); }}>Registrar ciência</TaxRowAction><TaxRowAction onClick={() => { const reason = prompt("Motivo do cancelamento"); if (reason) run(() => cancelTiafAction(doc.id, reason)); }}>Cancelar</TaxRowAction></>}</TaxRowActions> })))} />}
      {tab === "produtividade" && <TaxOperationalTable id="fiscalizacao-produtividade" toolbar={toolbar}
        actions={<a href={`/tributacao/fiscalizacao/produtividade/relatorio?competence=${competence}`} target="_blank" rel="noreferrer" className="h-7 rounded border px-2 text-xs">Relatório</a>}
        columns={[["employee", "Fiscal", 80, 210], ["competence", "Competência", 56, 115], ["ledger", "Conta-corrente", 80, 220], ["points", "Pontos", 40, 75, "text", "right"], ["point", "Valor/ponto", 48, 120, "text", "right"], ["gross", "Bruto", 48, 120, "text", "right"], ["cap", "Teto", 48, 120, "text", "right"], ["excess", "Excesso", 48, 120, "text", "right"], ["adjustment", "Ajuste", 48, 120, "text", "right"], ["final", "Resultado", 48, 120, "text", "right"], ["status", "Situação", 56, 130, "status"], ["actions", "Ações", 48, 60, "actions"]]}
        rows={data.productivity.map(row => ({ id: row.id, label: row.employee, values: { employee: row.employee, competence: row.competence, ledger: row.ledger.map(item => `${item.type}: ${money(item.amount)} · ${item.description}`).join("\n"), points: String(row.points), point: money(row.pointValue), gross: money(row.gross), cap: money(row.cap), excess: money(row.excess), adjustment: money(row.adjustment), final: money(row.final), status: row.status }, actions: row.status === "APURADA" ? <TaxRowActions label={row.employee}><TaxRowAction onClick={() => run(() => confirmProductivityAction(row.id))}>Confirmar sem folha</TaxRowAction></TaxRowActions> : null }))} />}
      <main className={listView ? "hidden print:block" : "min-h-0 flex-1 overflow-auto"}>
        {tab === "planejamento" && (
          <div className="grid gap-2 xl:grid-cols-[390px_1fr]">
            <form
              className="grid content-start gap-2 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
              onSubmit={submit((form) =>
                run(() =>
                  createFiscalPlanAction({
                    year: Number(form.get("year")),
                    name: String(form.get("name")),
                    planType: String(form.get("type")) as
                      "ANUAL" | "FORCA_TAREFA" | "IMOBILIARIA",
                    filters: {
                      cnae: String(form.get("cnae")),
                      serviceItem: String(form.get("serviceItem")),
                      neighborhood: String(form.get("neighborhood")),
                      street: String(form.get("street")),
                      propertyType: String(form.get("propertyType")),
                      fiscalSector: String(form.get("fiscalSector")),
                      fiscalZone: String(form.get("fiscalZone")),
                    },
                    taxpayerIds: form.getAll("taxpayers").map(String),
                    realEstateIds: form.getAll("properties").map(String),
                    employeeIds: form.getAll("employees").map(String),
                  }),
                ),
              )}
            >
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Target className="size-4" />
                Novo planejamento
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={input}
                  name="year"
                  type="number"
                  defaultValue="2026"
                />
                <select className={input} name="type">
                  <option value="ANUAL">Anual</option>
                  <option value="FORCA_TAREFA">Força-tarefa</option>
                  <option value="IMOBILIARIA">Imobiliária</option>
                </select>
              </div>
              <input
                className={input}
                name="name"
                placeholder="Nome do planejamento"
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <input className={input} name="cnae" placeholder="CNAE" />
                <input
                  className={input}
                  name="serviceItem"
                  placeholder="Atividade ISS"
                />
                <input
                  className={input}
                  name="neighborhood"
                  placeholder="Bairro"
                />
                <input
                  className={input}
                  name="street"
                  placeholder="Logradouro"
                />
                <input
                  className={input}
                  name="propertyType"
                  placeholder="Terreno/construção"
                />
                <input
                  className={input}
                  name="fiscalZone"
                  placeholder="Zona fiscal"
                />
                <input
                  className={input}
                  name="fiscalSector"
                  placeholder="Setor fiscal"
                />
                <input
                  className={input}
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Filtrar lista"
                />
              </div>
              <label className="text-xs font-semibold">
                Contribuintes
                <select className={`${input} h-24`} name="taxpayers" multiple>
                  {eligible.slice(0, 50).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} · {row.cnae} · {row.neighborhood}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold">
                Imóveis
                <select className={`${input} h-20`} name="properties" multiple>
                  {data.properties.slice(0, 50).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} · {row.propertyType} · {row.fiscalZone}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold">
                Fiscais
                <select className={`${input} h-20`} name="employees" multiple>
                  {data.employees.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className={primary} disabled={pending}>
                Salvar seleção
              </button>
            </form>
            <section className="grid content-start gap-2">
              {data.plans.slice(0, 20).map((row) => (
                <article
                  key={row.id}
                  className="rounded-lg border bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-950"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold">
                        {row.year} · {row.name}
                      </h3>
                      <p>
                        {row.type} · {row.status} · {row.selections}{" "}
                        selecionados · {row.inspectors.join(", ")}
                      </p>
                    </div>
                    <button
                      className={primary}
                      onClick={() =>
                        run(() => generatePlanOrdersAction(row.id))
                      }
                    >
                      Gerar OS ({row.orders})
                    </button>
                  </div>
                  <details className="mt-2 text-slate-500">
                    <summary>Filtros e histórico</summary>
                    <pre className="whitespace-pre-wrap text-[10px]">
                      {JSON.stringify(row.filters, null, 2)}
                    </pre>
                    {row.events.map((event, index) => (
                      <p key={index}>{event}</p>
                    ))}
                  </details>
                </article>
              ))}
            </section>
          </div>
        )}
        {tab === "malhas" && (
          <section className="rounded-lg border bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center gap-2 border-b p-2">
              <Search className="size-4" />
              <b className="mr-auto text-sm">Malhas integradas de ISS</b>
              <button
                className={primary}
                onClick={() => run(() => runMeshesAction(competence))}
              >
                Cruzar fontes
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-left dark:bg-slate-900">
                  <tr>
                    <th className="p-2">Contribuinte</th>
                    <th className="p-2 text-right">NFS-e</th>
                    <th className="p-2 text-right">Simples</th>
                    <th className="p-2 text-right">Cartões</th>
                    <th className="p-2 text-right">DES-IF</th>
                    <th className="p-2 text-right">Diferença / potencial</th>
                    <th className="p-2">Causas</th>
                    <th className="p-2">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.findings.slice(0, 20).map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-2">
                        <b>{row.taxpayer}</b>
                        <br />
                        {row.competence} ·{" "}
                        <span className="font-semibold text-amber-700">
                          {row.status}
                        </span>
                      </td>
                      <td className="p-2 text-right">{money(row.nfse)}</td>
                      <td className="p-2 text-right">{money(row.simples)}</td>
                      <td className="p-2 text-right">{money(row.cards)}</td>
                      <td className="p-2 text-right">{money(row.desif)}</td>
                      <td className="p-2 text-right">
                        <b>{money(row.difference)}</b>
                        <br />
                        {row.rate}% = {money(row.potential)}
                      </td>
                      <td className="p-2">
                        {row.causes.join("; ") || "Sem divergência"}
                      </td>
                      <td className="p-2">
                        {row.hasOrder ? (
                          "OS vinculada"
                        ) : (
                          <button
                            className={secondary}
                            disabled={!employeeId}
                            onClick={() =>
                              run(() =>
                                createOrderFromMeshAction(row.id, employeeId),
                              )
                            }
                          >
                            Abrir análise
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t p-2 text-[10px] text-slate-500">
              Os resultados são indícios baseados em fontes disponíveis; não
              classificam fraude automaticamente.
            </p>
          </section>
        )}
        {tab === "ordens" && (
          <div className="grid gap-2 xl:grid-cols-[340px_1fr]">
            <form
              className="grid content-start gap-2 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
              onSubmit={submit((form) =>
                run(() =>
                  createStandaloneOrderAction({
                    originType: String(form.get("origin")) as
                      "AVULSA" | "SOLICITACAO_FISCAL",
                    taxpayerId: String(form.get("taxpayerId")) || undefined,
                    realEstateId: String(form.get("realEstateId")) || undefined,
                    responsibleEmployeeId: String(form.get("employeeId")),
                    requestedByEmployeeId:
                      String(form.get("origin")) === "SOLICITACAO_FISCAL"
                        ? String(form.get("employeeId"))
                        : undefined,
                    reason: String(form.get("reason")),
                  }),
                ),
              )}
            >
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <ListChecks className="size-4" />
                Ordem avulsa ou solicitada
              </h2>
              <select className={input} name="origin">
                <option value="AVULSA">Avulsa</option>
                <option value="SOLICITACAO_FISCAL">
                  Solicitação do fiscal
                </option>
              </select>
              <select className={input} name="taxpayerId">
                <option value="">Contribuinte opcional</option>
                {data.taxpayers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
              <select className={input} name="realEstateId">
                <option value="">Imóvel opcional</option>
                {data.properties.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
              <select className={input} name="employeeId">
                {data.employees.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
              <textarea
                className={`${input} h-20 py-2`}
                name="reason"
                placeholder="Fundamentação"
                required
              />
              <button className={primary}>Emitir OS</button>
            </form>
            <section className="grid content-start gap-2">
              {data.orders.slice(0, 20).map((row) => (
                <article
                  key={row.id}
                  className="rounded-lg border bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-950"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold">
                        {row.number} · {row.subject}
                      </h3>
                      <p>
                        {row.origin} · {row.status} · fiscal {row.employee}
                      </p>
                      <p className="text-slate-500">{row.reason}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {!row.readAt && (
                        <button
                          className={secondary}
                          onClick={() => run(() => markOrderReadAction(row.id))}
                        >
                          Registrar leitura
                        </button>
                      )}
                      {!row.documents.some((doc) => doc.kind === "TIAF") && (
                        <button
                          className={primary}
                          onClick={() => {
                            const docs = prompt(
                              "Documentos separados por vírgula",
                              "Livro fiscal, extratos bancários, contratos",
                            );
                            if (docs)
                              run(() =>
                                issueTiafAction({
                                  orderId: row.id,
                                  requestedDocuments: docs
                                    .split(",")
                                    .map((item) => item.trim())
                                    .filter(Boolean),
                                  deadlineDays: 15,
                                }),
                              );
                          }}
                        >
                          Emitir TIAF
                        </button>
                      )}
                      <button
                        className={secondary}
                        onClick={() =>
                          run(() =>
                            createAssessmentMapAction({
                              orderId: row.id,
                              competence,
                              obligationType: "PRINCIPAL",
                              originalBase: 9000,
                              assessedBase: 10000,
                              rate: 3,
                              penaltyRate: 50,
                              interestRate: 2,
                              correctionRate: 1,
                              discountRate: 20,
                            }),
                          )
                        }
                      >
                        Mapa 1.000×3%
                      </button>
                      <button
                        className={secondary}
                        onClick={() =>
                          run(() =>
                            issueSeizureAction({
                              orderId: row.id,
                              items: ["Livro fiscal", "Documento auxiliar"],
                              custodian: row.employee,
                            }),
                          )
                        }
                      >
                        Apreensão
                      </button>
                      <button
                        className={secondary}
                        onClick={() =>
                          run(() =>
                            closeOrderAction({
                              orderId: row.id,
                              result:
                                "Ação concluída após análise documental e lavratura dos documentos cabíveis.",
                            }),
                          )
                        }
                      >
                        Encerrar
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2 lg:grid-cols-3">
                    <div>
                      <b>Solicitações</b>
                      {row.requests.map((request) => (
                        <div
                          key={request.id}
                          className="mt-1 rounded border p-1 dark:border-slate-700"
                        >
                          {request.description} · {request.status}
                          <div className="flex gap-1">
                            {request.status === "SOLICITADO" && (
                              <button
                                className="text-blue-600 underline"
                                onClick={() =>
                                  run(() =>
                                    receiveDocumentAction({
                                      requestId: request.id,
                                      receivedBy: "Representante informado",
                                    }),
                                  )
                                }
                              >
                                Receber
                              </button>
                            )}
                            {request.status === "RECEBIDO" && (
                              <button
                                className="text-blue-600 underline"
                                onClick={() =>
                                  run(() =>
                                    returnDocumentAction({
                                      requestId: request.id,
                                      returnedTo: "Representante informado",
                                    }),
                                  )
                                }
                              >
                                Devolver
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div>
                      <b>Mapas</b>
                      {row.maps.map((map) => (
                        <div
                          key={map.id}
                          className="mt-1 rounded border p-1 dark:border-slate-700"
                        >
                          v{map.version} {map.type} · base {money(map.base)} ·
                          total {money(map.total)} · {map.status}
                          {map.status === "RASCUNHO" && (
                            <button
                              className="ml-2 text-blue-600 underline"
                              onClick={() =>
                                run(() => finalizeMapAction(map.id))
                              }
                            >
                              Auto + DAM
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div>
                      <b>Histórico em tempo real</b>
                      <details>
                        <summary>{row.events.length} eventos</summary>
                        {row.events.map((event, index) => (
                          <p key={index}>{event}</p>
                        ))}
                      </details>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </div>
        )}
        {tab === "documentos" && (
          <section className="rounded-lg border bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center gap-2 border-b p-2">
              <FileText className="size-4" />
              <b className="text-sm">Documentos da ação fiscal</b>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-left dark:bg-slate-900">
                  <tr>
                    <th className="p-2">OS</th>
                    <th className="p-2">Documento</th>
                    <th className="p-2">Situação</th>
                    <th className="p-2">Emissão</th>
                    <th className="p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders
                    .flatMap((order) =>
                      order.documents.map((doc) => ({ order, doc })),
                    )
                    .slice(0, 20)
                    .map(({ order, doc }) => (
                      <tr key={doc.id} className="border-t">
                        <td className="p-2">
                          {order.number}
                          <br />
                          {order.subject}
                        </td>
                        <td className="p-2">
                          <b>{doc.kind}</b>
                          <br />
                          {doc.number}
                        </td>
                        <td className="p-2">{doc.status}</td>
                        <td className="p-2">
                          {new Date(doc.issuedAt).toLocaleString("pt-BR")}
                        </td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-1">
                            <a
                              className={secondary}
                              target="_blank"
                              href={`/tributacao/fiscalizacao/documentos/${doc.id}`}
                            >
                              Visualizar
                            </a>
                            <button
                              className={secondary}
                              onClick={() =>
                                run(() => communicateDocumentAction(doc.id))
                              }
                            >
                              Enviar DTE
                            </button>
                            {doc.kind === "TIAF" && doc.status === "ABERTO" && (
                              <>
                                <button
                                  className={secondary}
                                  onClick={() => {
                                    const receivedBy = prompt(
                                      "Pessoa que recebeu a correspondência",
                                    );
                                    if (receivedBy)
                                      run(() =>
                                        acknowledgeTiafAction(
                                          doc.id,
                                          receivedBy,
                                        ),
                                      );
                                  }}
                                >
                                  Registrar ciência
                                </button>
                                <button
                                  className={secondary}
                                  onClick={() => {
                                    const reason = prompt(
                                      "Motivo do cancelamento",
                                    );
                                    if (reason)
                                      run(() =>
                                        cancelTiafAction(doc.id, reason),
                                      );
                                  }}
                                >
                                  Cancelar
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {tab === "produtividade" && (
          <section className="rounded-lg border bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-center gap-2 border-b p-2">
              <Calculator className="size-4" />
              <b className="mr-auto text-sm">Conta-corrente de produtividade</b>
              <a
                className={secondary}
                target="_blank"
                href={`/tributacao/fiscalizacao/produtividade/relatorio?competence=${competence}`}
              >
                Relatório
              </a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-left dark:bg-slate-900">
                  <tr>
                    <th className="p-2">Fiscal / competência</th>
                    <th className="p-2 text-right">Pontos</th>
                    <th className="p-2 text-right">Valor/ponto</th>
                    <th className="p-2 text-right">Bruto</th>
                    <th className="p-2 text-right">Teto / excesso</th>
                    <th className="p-2 text-right">Ajuste</th>
                    <th className="p-2 text-right">Resultado</th>
                    <th className="p-2">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.productivity.slice(0, 20).map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-2">
                        <b>{row.employee}</b>
                        <br />
                        {row.competence}
                        <details>
                          <summary>Conta-corrente</summary>
                          {row.ledger.map((item, index) => (
                            <p key={index}>
                              {item.type}: {money(item.amount)} ·{" "}
                              {item.description}
                            </p>
                          ))}
                        </details>
                      </td>
                      <td className="p-2 text-right">{row.points}</td>
                      <td className="p-2 text-right">
                        {money(row.pointValue)}
                      </td>
                      <td className="p-2 text-right">{money(row.gross)}</td>
                      <td className="p-2 text-right">
                        {money(row.cap)}
                        <br />
                        excesso {money(row.excess)}
                      </td>
                      <td className="p-2 text-right">
                        {money(row.adjustment)}
                      </td>
                      <td className="p-2 text-right font-bold text-emerald-700">
                        {money(row.final)}
                      </td>
                      <td className="p-2">
                        {row.status}
                        {row.status === "APURADA" && (
                          <button
                            className="ml-2 text-blue-600 underline"
                            onClick={() =>
                              run(() => confirmProductivityAction(row.id))
                            }
                          >
                            Confirmar sem folha
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t p-2 text-[10px] text-slate-500">
              A confirmação registra a produtividade devida e sua memória. Não
              executa folha, pagamento ou alteração salarial.
            </p>
          </section>
        )}
        {tab === "parametros" && (
          <div className="grid gap-2 xl:grid-cols-2">
            <form
              key={templateId}
              className="grid content-start gap-2 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
              onSubmit={submit((form) =>
                run(() =>
                  saveTemplateAction({
                    code: String(form.get("code")),
                    name: String(form.get("name")),
                    documentKind: String(form.get("kind")),
                    bodyTemplate: String(form.get("body")),
                  }),
                ),
              )}
            >
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Settings2 className="size-4" />
                Modelo fiscal versionado
              </h2>
              <label>Consultar / editar modelo<select className={input} value={templateId} onChange={event => setTemplateId(event.target.value)}><option value="">Novo modelo</option>{data.templates.map(row=><option key={row.id} value={row.id}>{row.code} · {row.name} · v{row.version}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={input}
                  name="code"
                  readOnly={Boolean(editingTemplate)}
                  defaultValue={editingTemplate?.code ?? "TIAF_PADRAO"}
                />
                <select className={input} name="kind" defaultValue={editingTemplate?.kind}>
                  <option>ORDEM</option><option>TERMO_FISCAL</option>
                  <option>TIAF</option>
                  <option>MAPA</option>
                  <option>AUTO_PRINCIPAL</option>
                  <option>AUTO_ACESSORIA</option>
                  <option>ENCERRAMENTO</option>
                </select>
              </div>
              <input
                className={input}
                name="name"
                defaultValue={editingTemplate?.name ?? "Modelo TIAF municipal"}
              />
              <textarea
                className={`${input} h-24 py-2`}
                name="body"
                defaultValue={editingTemplate?.body ?? "Termo referente à OS {{orderNumber}}, contribuinte {{subject}}, fiscal {{inspector}}."}
              />
              <button className={primary}>Salvar nova versão</button>
              {data.templates.slice(0, 10).map((row) => (
                <p key={row.id} className="text-xs">
                  {row.code} v{row.version} · {row.kind} · {row.status}
                </p>
              ))}
            </form>
            <form
              className="grid content-start gap-2 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
              onSubmit={submit((form) =>
                run(() =>
                  savePenaltyRuleAction({
                    code: String(form.get("code")),
                    name: String(form.get("name")),
                    obligationType: String(form.get("type")),
                    penaltyRate: Number(form.get("penalty")),
                    discountRate: Number(form.get("discount")),
                    interestRate: Number(form.get("interest")),
                    correctionRate: Number(form.get("correction")),
                    discountDeadlineDays: Number(form.get("days")),
                    legalBasis: String(form.get("basis")),
                  }),
                ),
              )}
            >
              <h2 className="text-sm font-bold">
                Multa, desconto e acréscimos
              </h2>
              <div className="grid grid-cols-2 gap-2">
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
                <select className={input} name="type">
                  <option>PRINCIPAL</option>
                  <option>ACESSORIA</option>
                </select>
                <input
                  className={input}
                  name="basis"
                  placeholder="Fundamento legal"
                  required
                />
              </div>
              <div className="grid grid-cols-5 gap-2">
                <input
                  className={input}
                  name="penalty"
                  type="number"
                  defaultValue="50"
                  title="Multa %"
                />
                <input
                  className={input}
                  name="discount"
                  type="number"
                  defaultValue="20"
                  title="Desconto %"
                />
                <input
                  className={input}
                  name="interest"
                  type="number"
                  defaultValue="2"
                  title="Juros %"
                />
                <input
                  className={input}
                  name="correction"
                  type="number"
                  defaultValue="1"
                  title="Correção %"
                />
                <input
                  className={input}
                  name="days"
                  type="number"
                  defaultValue="30"
                  title="Prazo"
                />
              </div>
              <button className={primary}>Salvar regra</button>
              {data.rules.slice(0, 10).map((row) => (
                <p key={row.id} className="text-xs">
                  {row.code} · multa {row.penalty}% · desconto {row.discount}% ·
                  juros {row.interest}% · correção {row.correction}%
                </p>
              ))}
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
