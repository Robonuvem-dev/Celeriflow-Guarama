import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { searchSstPeople } from "@/db/repositories/sst/references";
import { sstDatabase } from "@/lib/sst/database";
import { readSstProgramsPage } from "@/db/repositories/sst-pages/programs";
import { ProgramForm } from "./ProgramForm";
import { z } from "zod";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { sstColumn } from "../_components/operational-columns";
import { SstNewLink } from "../_components/SstNewLink";

const columns = [sstColumn("code", "Código", 150, 100, "identifier"), sstColumn("kind", "Tipo", 110, 85), sstColumn("version", "Versão", 90, 70, "text", "right"), sstColumn("period", "Vigência", 220, 185), sstColumn("responsible", "Responsável", 250, 140), sstColumn("actions", "Detalhes", 110, 100, "actions")];

export default async function SstProgramsPage({ searchParams }: { searchParams: Promise<{ budgetUnitId?: string; personQ?: string; page?: string; view?: string }> }) {
  const context = await getTenantContextForModule("SST");
  const params = await searchParams;
  const database = sstDatabase(context), units = await listSstUnits(database, context);
  const unit = units.find(item => item.id === params.budgetUnitId);
  const { total, page, records, groups } = await readSstProgramsPage(database, units.map(item => item.id), unit?.id, params.page);
  const programs = records.map(record => ({ ...record, responsible: { fullName: z.object({ name: z.string() }).parse(record.responsibleSnapshot).name } }));
  const people = params.personQ && params.personQ.trim().length >= 3 ? await searchSstPeople(database, params.personQ.trim()) : [];
  const date = (value: Date) => value.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  if (params.view === "manage") return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Registrar programa ou nova versão</h1><Link href={`/sst/programas?budgetUnitId=${encodeURIComponent(params.budgetUnitId || "")}`}>Voltar à listagem</Link><form className="flex flex-wrap gap-2"><input type="hidden" name="view" value="manage" /><label>UG<select name="budgetUnitId" defaultValue={params.budgetUnitId}><option value="">Selecione a UG</option>{units.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Responsável técnico no Cadastro Único (3 letras)<input name="personQ" defaultValue={params.personQ} /></label><button>Carregar opções</button></form>{unit && <ProgramForm budgetUnitId={unit.id} groups={groups} people={people} />}</div>;
  return <OperationalListFrame label="Programas e laudos ocupacionais" actions={<SstNewLink href={`/sst/programas?${new URLSearchParams({ budgetUnitId: params.budgetUnitId || "", personQ: params.personQ || "", view: "manage" })}`}>Registrar programa</SstNewLink>}
    toolbar={<OperationalFilters label="Unidade gestora" activeCount={Number(!!unit)}><form method="GET" className={styles.filterFields}><label>UG<select name="budgetUnitId" defaultValue={params.budgetUnitId}><option value="">Todas autorizadas</option>{units.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><input type="hidden" name="personQ" value={params.personQ || ""} /><button className={styles.primaryButton}>Aplicar</button><Link href="/sst/programas">Limpar</Link></form></OperationalFilters>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname="/sst/programas" values={{ budgetUnitId: unit?.id, personQ: params.personQ }} />}>
    <OperationalTable columns={columns} preferenceId="sst-programas" caption="Programas e laudos ocupacionais" emptyMessage="Nenhum programa encontrado." rows={programs.map(program => ({ id: program.id, label: program.code, values: { code: program.code, kind: program.kind, version: String(program.version), period: `${date(program.startsAt)} — ${date(program.endsAt)}`, responsible: program.responsible.fullName }, actions: <Link href={`/sst/programas/${program.id}`}>Abrir versão</Link> }))} />
  </OperationalListFrame>;
}
