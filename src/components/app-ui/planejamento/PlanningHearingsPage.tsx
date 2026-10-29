import Link from "next/link";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanningWorkspace } from "./PlanningWorkspace";
import { PlanningList, planningColumn as col } from "./PlanningList";
import { PlanningOperation } from "./ContextualTables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { PlanningForm } from "./PlanningForm";
import { getPlanningContext } from "@/lib/planejamento/access";
import { pageHearings } from "@/db/repositories/planning-pages/hearings";
import { pageDatabase, pageDocumentClasses } from "@/db/repositories/planning-pages/shared";
import { canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { planningBasePath, type PlanningJurisdiction } from "@/lib/planejamento/policy";
import { PlanningDocumentUpload } from "./PlanningDocumentUpload";

export async function PlanningHearingsPage({ jurisdiction, filters }: { jurisdiction: PlanningJurisdiction; filters: { hearingId?: string; page?: string } }) {
  const context = await getPlanningContext(jurisdiction);
  const base = `${planningBasePath(jurisdiction)}/audiencias`;
  const database = pageDatabase(context);
  const { total, page, hearings, instruments, units, demands } = await pageHearings(database, context, filters);
  const hearingOptions = hearings.map((row) => ({ id: row.id, name: `${row.title} · ${row.heldAt.toLocaleDateString("pt-BR", { timeZone: "UTC" })}` }));
  const selected = hearings.find((hearing) => hearing.id === filters.hearingId);
  const canUpload = canPerformModuleOperation(context.user, "PLANEJAMENTO", "update") && canPerformModuleOperation(context.user, "DOCUMENTOS", "create");
  const classes = selected && canUpload ? await pageDocumentClasses(database) : [];
  return <PlanningWorkspace><PageHeader title="Audiências e participação comunitária" />
    {selected && <Card><CardHeader><CardTitle>{selected.title}</CardTitle></CardHeader><CardContent className="space-y-4"><div><p className="text-xs">{selected.location} · {selected.heldAt.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</p>{selected.minutes && <p className="whitespace-pre-wrap pt-2 text-sm">{selected.minutes}</p>}</div><section aria-label="Documentos da audiência" className="space-y-2 border-t pt-3"><h2 className="text-sm font-semibold">Documentos e atas</h2>{selected.documentLinks.length ? <ul className="space-y-1">{selected.documentLinks.map((link) => <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{link.document.title} <span className="text-xs text-muted-foreground">· {link.purpose === "HEARING_MINUTES" ? "Ata" : "Anexo"}</span></span><Link className="rounded border px-3 py-1 text-xs underline" href={`${planningBasePath(jurisdiction)}/documentos/${link.id}`}>Baixar / visualizar</Link></li>)}</ul> : <p className="text-sm text-muted-foreground">Nenhum arquivo anexado a esta audiência.</p>}{canUpload && classes.length > 0 && <details className="rounded border p-3"><summary className="cursor-pointer text-sm font-medium">Anexar documento ou ata</summary><div className="pt-3"><PlanningDocumentUpload jurisdiction={jurisdiction} instrumentId={selected.instrumentId} hearingId={selected.id} classes={classes} /></div></details>}{canUpload && classes.length === 0 && <p className="text-xs text-muted-foreground">Para anexar, é necessário configurar uma classe documental ativa de Planejamento no GED.</p>}</section></CardContent></Card>}
    <section data-table-area="demands" aria-label="Solicitações da comunidade"><PlanningList id={`planning:${jurisdiction}:demands`} label="Solicitações da comunidade" pathname={base} page={page} total={total} values={{ hearingId: filters.hearingId }}
      toolbar={<form method="get" className={styles.searchForm}><select aria-label="Audiência" name="hearingId" defaultValue={filters.hearingId} className={styles.searchInput}><option value="">Todas autorizadas</option>{hearingOptions.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><button className={styles.dialogButton}>Consultar</button></form>}
      columns={[col("requester", "Solicitante", 100, 180), col("email", "E-mail", 90, 150), col("phone", "Telefone", 90, 110), col("neighborhood", "Bairro", 75, 110), col("request", "Demanda", 110, 240), col("unit", "Órgão", 90, 150), col("hearing", "Audiência", 100, 160), col("status", "Situação", 90, 100, { type: "status" }), col("opinion", "Parecer", 100, 200), col("actions", "Ações", 85, 100, { type: "actions", details: "none", resizable: false })]}
      rows={demands.map(demand => ({ id: demand.id, label: demand.requesterName, values: { requester: demand.requesterName, email: demand.email ?? "—", phone: demand.phone ?? "—", neighborhood: demand.neighborhood, request: demand.request, unit: demand.responsibleUnit.name, hearing: demand.hearing.title, status: ({ PENDING: "Em análise", ACCEPTED: "Acolhida", REJECTED: "Não acolhida" } as Record<string, string>)[demand.status] ?? demand.status, opinion: demand.opinion ?? "—" },
        actions: demand.status === "PENDING" && canPerformModuleOperation(context.user, "PLANEJAMENTO", "update") ? <PlanningOperation label={`Analisar ${demand.requesterName}`}><PlanningForm jurisdiction={jurisdiction} operation="demandDecision" hidden={{ demandId: demand.id }} fields={[{ name: "status", label: "Decisão", type: "select", options: [{ id: "ACCEPTED", name: "Acolher" }, { id: "REJECTED", name: "Não acolher" }] }, { name: "opinion", label: "Parecer", type: "textarea" }]} /></PlanningOperation> : null }))} /></section>
    {canPerformModuleOperation(context.user, "PLANEJAMENTO", "create") && <>
      <details className="rounded border bg-card p-3"><summary className="cursor-pointer text-sm font-semibold">Registrar audiência</summary><div className="pt-3"><PlanningForm jurisdiction={jurisdiction} operation="hearing" fields={[{ name: "instrumentId", label: "Peça orçamentária", type: "select", options: instruments.map((row) => ({ id: row.id, name: row.title })) }, { name: "title", label: "Tema" }, { name: "heldAt", label: "Data de realização", type: "date" }, { name: "location", label: "Local" }, { name: "minutes", label: "Ata", type: "textarea", required: false }]} /></div></details>
      <details className="rounded border bg-card p-3"><summary className="cursor-pointer text-sm font-semibold">Registrar solicitação da comunidade</summary><div className="pt-3"><PlanningForm jurisdiction={jurisdiction} operation="demand" fields={[{ name: "hearingId", label: "Audiência", type: "select", options: hearingOptions }, { name: "requesterName", label: "Solicitante" }, { name: "email", label: "E-mail", type: "email", required: false }, { name: "phone", label: "Telefone", required: false }, { name: "neighborhood", label: "Bairro" }, { name: "responsibleUnitId", label: "Órgão responsável", type: "select", options: units }, { name: "request", label: "Solicitação", type: "textarea" }]} /></div></details>
    </>}
  </PlanningWorkspace>;
}
