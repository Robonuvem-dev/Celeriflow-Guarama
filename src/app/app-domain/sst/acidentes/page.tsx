import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listAccidents } from "@/lib/sst/accident-service";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { sstColumn } from "../_components/operational-columns";
import { SstNewLink } from "../_components/SstNewLink";
import { SstForm } from "../SstForm";
import { AccidentFields } from "./AccidentFields";
import { saveAccident } from "./actions";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { searchSstAccidentEmployees } from "@/db/repositories/sst-pages/accidents";
export const dynamic = "force-dynamic";
export default async function AccidentsPage({ searchParams }: { searchParams: Promise<{ page?: string; kind?: string; employee?: string; view?: string }> }) {
  const context = await getTenantContextForModule("SST"), params = await searchParams;
  const { rows, page, total } = await listAccidents(context, Number(params.page || 1), params.kind || "");
  const database = sstDatabase(context), units = await listSstUnits(database, context);
  const employees = (params.employee || "").trim().length >= 3 ? await searchSstAccidentEmployees(database,units.map(u=>u.secretariatId),params.employee!) : [];
  if (params.view !== "manage") {
    const columns = [sstColumn("employee", "Servidor", 300, 160), sstColumn("date", "Ocorrência", 160, 110), sstColumn("kind", "Tipo", 180, 110), sstColumn("actions", "Ações", 110, 100, "actions")];
    return <OperationalListFrame label="Acidentes, CAT e incidentes" actions={<SstNewLink href={`/sst/acidentes?${new URLSearchParams({ view: "manage", employee: params.employee || "", kind: params.kind || "" })}`}>Comunicar ocorrência</SstNewLink>}
      toolbar={<OperationalFilters label="Tipo de ocorrência" activeCount={Number(!!params.kind)}><form method="GET" className={styles.filterFields}><label>Tipo<select name="kind" defaultValue={params.kind || ""}><option value="">Todos</option><option value="INCIDENT">Incidentes</option><option value="TYPICAL">Típicos</option><option value="COMMUTE">Trajeto</option><option value="DISEASE">Doença</option></select></label><input type="hidden" name="employee" value={params.employee || ""} /><button className={styles.primaryButton}>Aplicar</button><Link href="/sst/acidentes">Limpar</Link></form></OperationalFilters>}
      pagination={<OperationalLinkPagination page={page} total={total} pathname="/sst/acidentes" values={{ kind: params.kind, employee: params.employee }} />}>
      <OperationalTable columns={columns} preferenceId="sst-acidentes" caption="Acidentes, CAT e incidentes" emptyMessage="Nenhuma ocorrência no escopo selecionado." rows={rows.map(r => { const employeeName = r.snapshot.employeeName ?? "Não informado"; return { id: r.id, label: employeeName, values: { employee: employeeName, date: r.occurredAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }), kind: r.kind }, actions: <Link href={`/sst/acidentes/${r.id}`}>Abrir ficha</Link> }; })} />
    </OperationalListFrame>;
  }
  return <main className="space-y-5 p-4"><h1 className="text-xl font-semibold">Acidentes, CAT e incidentes</h1>
    <Link href={`/sst/acidentes?kind=${encodeURIComponent(params.kind || "")}`}>Voltar à listagem</Link>
    <section className="space-y-3"><h2 className="font-semibold">Comunicar ocorrência</h2><form className="flex gap-2"><input type="hidden" name="view" value="manage" /><input type="hidden" name="kind" value={params.kind || ""} /><input aria-label="Buscar servidor" name="employee" placeholder="Buscar servidor (mínimo 3 letras)" defaultValue={params.employee || ""} minLength={3} required className="rounded border p-2" /><button>Buscar</button></form><p>Busca canônica limitada a 20 correspondências. Refine o nome quando necessário.</p><SstForm action={saveAccident} redirectBase="/sst/acidentes"><AccidentFields units={units} employees={employees} /></SstForm></section>
  </main>;
}
