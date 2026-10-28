import { getTenantContextForModule, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { searchSstWorkerPeople, searchSstPageVaccines, readSstUserProfessionals } from "@/db/repositories/sst-pages/clinical-options";
import { clinicalSnapshot } from "@/lib/sst/clinical-policy";
import { formatSstCivilDate } from "@/lib/sst/aso-policy";
import { SstForm } from "../SstForm";
import { saveSstVaccination } from "../prontuarios/actions";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { listOccupationalVaccinations } from "@/lib/sst/clinical-service";
import { z } from "zod";

export default async function SstVaccinationPage({ searchParams }: { searchParams: Promise<{ budgetUnitId?: string; discipline?: string; personQ?: string; vaccineQ?: string; page?: string }> }) {
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
  const href = (value: number) => `/sst/vacinacao?${new URLSearchParams({ budgetUnitId: params.budgetUnitId || "", discipline, personQ: params.personQ || "", vaccineQ: params.vaccineQ || "", page: String(value) })}`;
  const field = "block w-full rounded border p-2";
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Vacinação ocupacional</h1><p>Registro de vacinação comprovada externamente, sem gerar nova aplicação ou baixar estoque assistencial.</p><form className="grid gap-3 sm:grid-cols-2"><label>Atuação<select name="discipline" defaultValue={discipline} className={field}><option value="MEDICINE">Medicina</option><option value="NURSING">Enfermagem</option></select></label><label>UG<select name="budgetUnitId" defaultValue={unit?.id || ""} className={field}><option value="">Todas autorizadas</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Servidor (3 letras)<input name="personQ" defaultValue={params.personQ} className={field}/></label><label>Vacina (3 letras)<input name="vaccineQ" defaultValue={params.vaccineQ} className={field}/></label><button className="w-fit rounded border p-2">Carregar</button></form>
    {create && unit && <SstForm action={saveSstVaccination} label="Registrar vacinação comprovada"><input type="hidden" name="budgetUnitId" value={unit.id}/><input type="hidden" name="source" value="EXTERNAL_PROOF"/><label>Servidor<select name="personId" required className={field}><option value="">Selecione</option>{people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label><label>Profissional que conferiu<select name="professionalRoleId" required className={field}><option value="">Selecione</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.person.fullName} · {role.council}</option>)}</select></label><label>Vacina canônica<select name="vaccineId" required className={field}><option value="">Selecione</option>{vaccines.map((vaccine) => <option key={vaccine.id} value={vaccine.id}>{vaccine.name}</option>)}</select></label>{[["administeredAt","Data de aplicação","date"],["doseNumber","Dose","number"],["lotNumber","Lote","text"],["occupationalContext","Contexto ocupacional e identificação do comprovante","text"],["nextDoseAt","Próxima dose prevista","date"]].map(([name,label,type]) => <label key={name}>{label}<input name={name} type={type} min={type === "number" ? 1 : undefined} required={name !== "nextDoseAt"} className={field}/></label>)}</SstForm>}
    <table className="w-full table-fixed text-left text-sm"><thead><tr><th className="p-2">Pessoa / vacina</th><th className="p-2">Aplicação / dose</th><th className="p-2">Próxima dose</th><th className="p-2">Conferência</th></tr></thead><tbody>{records.map((record) => { const snapshot = clinicalSnapshot.extend({ vaccineName: z.string() }).parse(record.snapshot); return <tr className="border-b" key={record.id}><td className="break-words p-2">{snapshot.personName} · {snapshot.vaccineName}</td><td className="p-2">{formatSstCivilDate(record.administeredAt)} · Dose {record.doseNumber}</td><td className="p-2">{record.nextDoseAt ? formatSstCivilDate(record.nextDoseAt) : "Não prevista"}</td><td className="break-words p-2">{snapshot.professionalName} · {record.lotNumber}</td></tr>; })}</tbody></table>{!records.length && <p>Nenhum registro nas UGs autorizadas.</p>}<ErpPagination page={page} total={total} previousHref={href(page - 1)} nextHref={href(page + 1)}/>
  </div>;
}
