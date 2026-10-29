import Link from "next/link";
import { getTenantContextForModule, canPerformModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { integrationUnits } from "@/lib/sst/esocial-service";
import { findSstClinicalGrant } from "@/db/repositories/sst/access";
import { sstDatabase } from "@/lib/sst/database";
import { readSstQuestionnairesPage } from "@/db/repositories/sst-pages/clinical-options";
import { QuestionnaireForm } from "./QuestionnaireForm";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { sstColumn } from "../_components/operational-columns";
import { SstNewLink } from "../_components/SstNewLink";

const columns = [sstColumn("code", "Código", 180, 110, "identifier"), sstColumn("title", "Título", 380, 180), sstColumn("version", "Versão", 100, 75, "text", "right"), sstColumn("actions", "Ficha", 90, 80, "actions")];

export default async function SstQuestionnairesPage({ searchParams }: { searchParams: Promise<{ budgetUnitId?: string; q?: string; page?: string; view?: string }> }) {
  const context = await getTenantContextForModule("SST");
  const params = await searchParams;
  const database = sstDatabase(context), units = await integrationUnits(context);
  const unit = units.find(item => item.id === params.budgetUnitId);
  const { total, page, records } = await readSstQuestionnairesPage(database, params.budgetUnitId ? unit ? [unit.id] : [] : units.map(item => item.id), params);
  const grant = unit && !isSystemAdministrator(context.user) ? await findSstClinicalGrant(database, context.user.id, unit.id) : null;
  const create = canPerformModuleOperation(context.user, "SST", "create") && (isSystemAdministrator(context.user) || grant?.canAssess);
  const values = { budgetUnitId: params.budgetUnitId, q: params.q };
  if (params.view === "manage") return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Registrar questionário ou nova versão</h1><p>Versões preservadas por UG, com perguntas personalizadas e impressão em branco.</p><Link href={`/sst/questionarios?${new URLSearchParams({ budgetUnitId: params.budgetUnitId || "", q: params.q || "" })}`}>Voltar à listagem</Link><form className="flex flex-wrap gap-2"><input type="hidden" name="view" value="manage" /><label>UG<select name="budgetUnitId" defaultValue={params.budgetUnitId}><option value="">Selecione a UG</option>{units.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button>Carregar</button></form>{unit && create && <QuestionnaireForm key={unit.id} budgetUnitId={unit.id} />}</div>;
  return <OperationalListFrame label="Questionários de anamnese médica" actions={<SstNewLink href={`/sst/questionarios?${new URLSearchParams({ budgetUnitId: params.budgetUnitId || "", view: "manage" })}`}>Registrar questionário</SstNewLink>}
    toolbar={<><form method="GET" className={styles.searchForm}><input type="hidden" name="budgetUnitId" value={params.budgetUnitId || ""} /><input name="q" aria-label="Buscar por título" defaultValue={params.q} placeholder="Título" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button></form><OperationalFilters activeCount={Number(!!params.budgetUnitId)}><form method="GET" className={styles.filterFields}><input type="hidden" name="q" value={params.q || ""} /><label>UG<select name="budgetUnitId" defaultValue={params.budgetUnitId}><option value="">Todas as UGs clínicas autorizadas</option>{units.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className={styles.primaryButton}>Aplicar</button><Link href="/sst/questionarios">Limpar</Link></form></OperationalFilters></>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname="/sst/questionarios" values={values} />}>
    <OperationalTable columns={columns} preferenceId="sst-questionarios" caption="Questionários de anamnese médica" emptyMessage="Nenhum questionário encontrado nas UGs clínicas autorizadas." rows={records.map(record => ({ id: record.id, label: record.title, values: { code: record.code, title: record.title, version: String(record.version) }, actions: <Link href={`/sst/questionarios/${record.id}`}>Abrir</Link> }))} />
  </OperationalListFrame>;
}
