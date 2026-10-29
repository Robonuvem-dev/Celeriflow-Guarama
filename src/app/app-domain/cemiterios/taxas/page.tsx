import Link from "next/link";
import { z } from "zod";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listCemeteryFeeEvents, listCemeteryFeeRules } from "@/lib/cemeteries/fees-service";
import { AdditionalFeeEventForm, FeeRuleForm, RetryFeeButton } from "./FeeForms";
import CemeteryLookup from "@/components/cemeteries/CemeteryLookup";
import { db } from "@/db/client";
import { readCemeteryFeeChoices } from "@/db/repositories/cemeteries/workflow-pages";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalFilters, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import type { OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { ProcessRowMenu } from "../ProcessRowMenu";

export const dynamic = "force-dynamic";
const statuses: Record<string, string> = { AGUARDANDO_CONFIGURACAO: "Aguardando configuração", AGUARDANDO_CONTRIBUINTE: "Aguardando responsável tributário", PENDENTE: "Pendente de emissão", FALHA_EMISSAO: "Falha na emissão", EMITIDA: "Emitida" };
const schema = z.object({ rulesPage: z.coerce.number().int().min(1).default(1), eventsPage: z.coerce.number().int().min(1).default(1), status: z.string().default(""), q: z.string().trim().max(120).default(""), cemeteryId: z.string().max(100).default("") });
const column = (key: string, label: string, initialWidth: number, minWidth: number, type: OperationalColumn["type"] = "text"): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: type === "actions" ? 190 : 700, type, resizable: type !== "actions", sortable: false, details: type === "actions" ? "none" : "overflow" });
const ruleColumns = [column("evento", "Evento", 140, 70), column("versao", "Versão", 65, 50), column("descricao", "Descrição", 180, 80), column("abrangencia", "Abrangência", 140, 60), column("formula", "Fórmula", 130, 60), column("valor", "Valor-base", 100, 60), column("inicio", "Vigência inicial", 100, 70), column("fim", "Vigência final", 100, 70), column("prazo", "Prazo", 70, 50), column("fundamento", "Fundamento", 180, 70)];
// Textos e cabeçalhos usam a leitura integral condicional da base. Mínimos não reservam o texto inteiro.
const eventColumns = [column("evento", "Fato gerador", 100, 70), column("data", "Data do fato", 90, 70), column("origemTipo", "Tipo de origem", 90, 50), column("origem", "Origem", 110, 80), column("contribuinte", "Contribuinte", 150, 80), column("valor", "Cálculo", 95, 60), column("quantidade", "Quantidade", 70, 50), column("vencimento", "Vencimento", 90, 70), column("status", "Situação", 130, 60, "status"), column("erro", "Erro de emissão", 140, 60), column("lancamento", "Lançamento", 110, 80), column("guia", "DAM", 100, 80), column("guiaStatus", "Situação do DAM", 110, 60, "status"), column("actions", "Ações", 56, 56, "actions")];

export default async function CemeteryFeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const parsed = schema.safeParse(params);
  if (!parsed.success) return <p className="p-6" role="alert">Filtros inválidos.</p>;
  const filters = parsed.data;
  const status = filters.status in statuses ? filters.status : "";
  const context = await getTenantContextForModule("CEMITERIOS");
  const database = context.database ?? db;
  const [rules, events, { cemeteries, taxes }] = await Promise.all([
    listCemeteryFeeRules(database, filters.rulesPage, filters), listCemeteryFeeEvents(database, filters.eventsPage, status, filters), readCemeteryFeeChoices(database),
  ]);
  const names = new Map(cemeteries.map(record => [record.id, record.name]));
  const view = params.view === "regras" ? "regras" : "eventos";
  const values = { q: filters.q, cemeteryId: filters.cemeteryId, status, rulesPage: rules.page, eventsPage: events.page, view };
  const href = (nextView: string) => `/cemiterios/taxas?${new URLSearchParams({ ...values, rulesPage: String(rules.page), eventsPage: String(events.page), view: nextView })}`;
  const canCreate = canPerformModuleOperation(context.user, "CEMITERIOS", "create");
  if (params.view === "nova-regra" || params.view === "adicional") return <main className="space-y-4 p-4"><Link href={href(view)}>Voltar às taxas</Link>{canCreate && (params.view === "nova-regra" ? <FeeRuleForm taxes={taxes} cemeteries={cemeteries} /> : <AdditionalFeeEventForm />)}</main>;
  const active = view === "regras" ? rules : events;
  return <OperationalListFrame label="Taxas cemiteriais" actions={canCreate && <><Link className={styles.newButton} href={href("nova-regra")}>Publicar regra</Link><Link className={styles.dialogButton} href={href("adicional")}>Evento adicional</Link></>}
    toolbar={<><form className={styles.searchForm} action="/cemiterios/taxas"><input aria-label="Buscar evento, descrição ou origem" className={styles.searchInput} name="q" defaultValue={filters.q} placeholder="Buscar evento, descrição ou origem…" /><input type="hidden" name="cemeteryId" value={filters.cemeteryId} /><input type="hidden" name="status" value={status} /><input type="hidden" name="view" value={view} /><button className={styles.filterButton}>Buscar</button></form><Link className={styles.filterButton} aria-current={view === "eventos" ? "page" : undefined} href={href("eventos")}>Eventos ({events.total})</Link><Link className={styles.filterButton} aria-current={view === "regras" ? "page" : undefined} href={href("regras")}>Regras ({rules.total})</Link><OperationalFilters activeCount={Number(!!status) + Number(!!filters.cemeteryId)}><form className={styles.filterFields}><input type="hidden" name="q" value={filters.q} /><input type="hidden" name="view" value={view} /><CemeteryLookup name="cemeteryId" kind="cemetery" label="Cemitério" defaultValue={filters.cemeteryId} /><label>Situação<select name="status" defaultValue={status}><option value="">Todas</option>{Object.entries(statuses).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label><button className={styles.primaryButton}>Filtrar</button><Link href="/cemiterios/taxas">Limpar filtros</Link></form></OperationalFilters></>}
    pagination={<OperationalLinkPagination pathname="/cemiterios/taxas" page={active.page} total={active.total} values={values} pageParam={view === "regras" ? "rulesPage" : "eventsPage"} />}>
    {view === "regras" ? <OperationalTable columns={ruleColumns} preferenceId="cemiterios.taxas.regras" caption="Versões publicadas" emptyMessage="Nenhuma regra no filtro." rows={rules.rows.map(rule => ({ id: rule.id, label: rule.label, values: { evento: rule.eventType, versao: String(rule.version), descricao: rule.label, abrangencia: rule.cemeteryId ? names.get(rule.cemeteryId) || rule.cemeteryId : "Geral", formula: rule.formula, valor: `R$ ${rule.baseAmount.toFixed(2)}`, inicio: rule.validFrom.toISOString().slice(0, 10), fim: rule.validUntil?.toISOString().slice(0, 10) || "Sem término", prazo: `${rule.dueDays} dias`, fundamento: rule.legalBasis } }))} />
      : <OperationalTable columns={eventColumns} preferenceId="cemiterios.taxas.eventos" caption="Eventos e guias — sem regra vigente o fato aguarda configuração; reprocessar não duplica cobranças" emptyMessage="Nenhum evento no filtro." rows={events.rows.map(event => ({ id: event.id, label: `${event.eventType} ${event.sourceId}`, values: { evento: event.eventType, data: event.occurredAt.toISOString().slice(0, 10), origemTipo: event.sourceType, origem: event.sourceId, contribuinte: event.guide?.assessment.taxpayer.person?.fullName ?? event.guide?.assessment.taxpayer.company?.corporateName ?? event.taxpayerId ?? "Responsável ausente", valor: event.amount ? `R$ ${event.amount.toFixed(2)}` : "Sem regra", quantidade: event.quantity.toString(), vencimento: event.dueDate?.toISOString().slice(0, 10) || "—", status: statuses[event.status] || event.status, erro: event.lastError || "—", lancamento: event.guide?.assessment.assessmentNumber || "—", guia: event.guide?.guideNumber || "Nenhuma guia", guiaStatus: event.guide?.status || "—" }, actions: (event.guide || (!event.assessmentId && canCreate)) ? <ProcessRowMenu label={`${event.eventType} ${event.sourceId}`}><div className={styles.filterFields}>{event.guide && <Link className={styles.dialogButton} href={`/cemiterios/taxas/guias/${event.guide.id}`} target="_blank">Reimprimir</Link>}{!event.assessmentId && canCreate && <RetryFeeButton eventKey={event.eventKey} />}</div></ProcessRowMenu> : null }))} />}
  </OperationalListFrame>;
}
