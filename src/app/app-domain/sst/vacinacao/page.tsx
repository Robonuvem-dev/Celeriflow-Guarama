import { getTenantContextForModule, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { searchSstWorkerPeople, searchSstPageVaccines, readSstUserProfessionals } from "@/db/repositories/sst-pages/clinical-options";
import { clinicalSnapshot } from "@/lib/sst/clinical-policy";
import { formatSstCivilDate } from "@/lib/sst/aso-policy";
import { SstForm } from "../SstForm";
import { saveSstVaccination } from "../prontuarios/actions";
import Link from "next/link";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { sstColumn } from "../_components/operational-columns";
import { SstNewLink } from "../_components/SstNewLink";
import { listOccupationalVaccinations } from "@/lib/sst/clinical-service";
import { z } from "zod";

export default async function SstVaccinationPage({ searchParams }: { searchParams: Promise<{ budgetUnitId?: string; discipline?: string; personQ?: string; vaccineQ?: string; page?: string; view?: string }> }) {
  const context = await getTenantContextForModule("SST"); const params = await searchParams;
  const discipline = params.discipline === "NURSING" ? "NURSING" : "MEDICINE";
  const n = Number(params.page);
  const { units, unit, total, page, records } = await listOccupationalVaccinations(context, { discipline, budgetUnitId: params.budgetUnitId || "", page: Number.isFinite(n) ? Math.max(1, Math.trunc(n)) : 1 });
  const database = sstDatabase(context);
  const writeUnit = unit ? (await listSstUnits(database, context, discipline, true)).find(candidate => candidate.id === unit.id) : null;
  const create = !!writeUnit && canPerformModuleOperation(context.user, "SST", "create");
  const people = create && unit && (params.personQ || "").trim().length >= 3 ? await searchSstWorkerPeople(database, params.personQ!) : [];
  const vaccines = create && (params.vaccineQ || "").trim().length >= 3 ? await searchSstPageVaccines(database, params.vaccineQ!) : [];
  const roles = create && unit ? await readSstUserProfessionals(database, unit.id, discipline, context.user.id, false) : [];
  if (params.view !== "manage") {
    const columns = [sstColumn("person", "Pessoa", 210, 130), sstColumn("vaccine", "Vacina", 170, 110), sstColumn("date", "Aplicação", 125, 100), sstColumn("dose", "Dose", 65, 55, "text", "right"), sstColumn("next", "Próxima dose", 130, 110), sstColumn("professional", "Conferência", 210, 130), sstColumn("lot", "Lote", 110, 80, "identifier")];
    return <OperationalListFrame label="Vacinação ocupacional" actions={<SstNewLink href={`/sst/vacinacao?${new URLSearchParams({ ...params, discipline, view: "manage", page: "1" })}`}>Registrar vacinação comprovada</SstNewLink>}
      toolbar={<OperationalFilters label="Atuação e UG" activeCount={Number(!!params.budgetUnitId)}><form method="GET" className={styles.filterFields}><label>Atuação<select name="discipline" defaultValue={discipline}><option value="MEDICINE">Medicina</option><option value="NURSING">Enfermagem</option></select></label><label>UG<select name="budgetUnitId" defaultValue={unit?.id || ""}><option value="">Todas autorizadas</option>{units.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><input type="hidden" name="personQ" value={params.personQ || ""} /><input type="hidden" name="vaccineQ" value={params.vaccineQ || ""} /><p>Registro de vacinação comprovada externamente, sem gerar nova aplicação ou baixar estoque assistencial.</p><button className={styles.primaryButton}>Aplicar</button><Link href="/sst/vacinacao">Limpar</Link></form></OperationalFilters>}
      pagination={<OperationalLinkPagination page={page} total={total} pathname="/sst/vacinacao" values={{ budgetUnitId: params.budgetUnitId, discipline, personQ: params.personQ, vaccineQ: params.vaccineQ }} />}>
      <OperationalTable columns={columns} preferenceId="sst-vacinacao" caption="Vacinação ocupacional" emptyMessage="Nenhum registro nas UGs autorizadas." rows={records.map(record => { const snapshot = clinicalSnapshot.extend({ vaccineName: z.string() }).parse(record.snapshot); return { id: record.id, label: snapshot.personName, values: { person: snapshot.personName, vaccine: snapshot.vaccineName, date: formatSstCivilDate(record.administeredAt), dose: String(record.doseNumber), next: record.nextDoseAt ? formatSstCivilDate(record.nextDoseAt) : "Não prevista", professional: snapshot.professionalName, lot: record.lotNumber } }; })} />
    </OperationalListFrame>;
  }
  const field = "block w-full rounded border p-2";
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Vacinação ocupacional</h1><Link href={`/sst/vacinacao?${new URLSearchParams({ discipline, budgetUnitId: params.budgetUnitId || "" })}`}>Voltar à listagem</Link><p>Registro de vacinação comprovada externamente, sem gerar nova aplicação ou baixar estoque assistencial.</p><form className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="view" value="manage" /><label>Atuação<select name="discipline" defaultValue={discipline} className={field}><option value="MEDICINE">Medicina</option><option value="NURSING">Enfermagem</option></select></label><label>UG<select name="budgetUnitId" defaultValue={unit?.id || ""} className={field}><option value="">Todas autorizadas</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Servidor (3 letras)<input name="personQ" defaultValue={params.personQ} className={field}/></label><label>Vacina (3 letras)<input name="vaccineQ" defaultValue={params.vaccineQ} className={field}/></label><button className="w-fit rounded border p-2">Carregar</button></form>
    {create && unit && <SstForm action={saveSstVaccination} label="Registrar vacinação comprovada"><input type="hidden" name="budgetUnitId" value={unit.id}/><input type="hidden" name="source" value="EXTERNAL_PROOF"/><label>Servidor<select name="personId" required className={field}><option value="">Selecione</option>{people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label><label>Profissional que conferiu<select name="professionalRoleId" required className={field}><option value="">Selecione</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.person.fullName} · {role.council}</option>)}</select></label><label>Vacina canônica<select name="vaccineId" required className={field}><option value="">Selecione</option>{vaccines.map((vaccine) => <option key={vaccine.id} value={vaccine.id}>{vaccine.name}</option>)}</select></label>{[["administeredAt","Data de aplicação","date"],["doseNumber","Dose","number"],["lotNumber","Lote","text"],["occupationalContext","Contexto ocupacional e identificação do comprovante","text"],["nextDoseAt","Próxima dose prevista","date"]].map(([name,label,type]) => <label key={name}>{label}<input name={name} type={type} min={type === "number" ? 1 : undefined} required={name !== "nextDoseAt"} className={field}/></label>)}</SstForm>}
  </div>;
}
