import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { readSstBenefitRegistrationPage } from "@/db/repositories/sst-pages/benefits";
import { SstForm } from "../../SstForm";
import { saveHealthPlan, saveBenefitBeneficiary } from "../actions";

const field = "block w-full rounded border p-2";
export default async function BenefitRegistrationPage({ searchParams }: { searchParams: Promise<{ q?: string; planId?: string; payrollBenefitId?: string }> }) {
  const context = await getTenantContextForModule("SST");
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 120);
  const database = sstDatabase(context), units = await listSstUnits(database, context);
  const {plans,configs,rubrics,assignments}=await readSstBenefitRegistrationPage(database,units,q,params);
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Cadastro contratual de planos</h1><Link href="/sst/planos" className="underline">Voltar à consulta</Link>
    <p className="text-sm">Pesquisas limitadas a 20 resultados. Informe IDs canônicos das rubricas se a pesquisa pelo mesmo termo não as localizar. Cadastre benefício, fornecedor/Company, rubricas e vínculo de servidor no RH antes da extensão SST.</p>
    <form className="flex gap-2"><input className={field} name="q" defaultValue={q} placeholder="Buscar plano, servidor ou rubrica (3 letras)"/><button className="rounded border p-2">Pesquisar</button></form>
    <section className="space-y-2"><h2 className="font-semibold">Planos localizados no escopo</h2>{plans.map((plan) => <article key={plan.id} className="rounded border p-3"><h3 className="break-words font-semibold">{plan.benefitConfig.name} · ANS {plan.ansPlanNumber}</h3><p className="break-all text-sm">ID do plano {plan.id} · benefício RH {plan.benefitConfigId}</p><p className="break-all text-sm">Mensalidade: rubrica {plan.monthlyRubricId} · evento {plan.monthlyEventId ?? "mapeamento pendente"}</p><p className="break-all text-sm">Extraordinária: rubrica {plan.extraordinaryRubricId} · evento {plan.extraordinaryEventId ?? "mapeamento pendente"}</p><p className="break-words">Contrato {plan.contractReference}</p></article>)}</section>
    <section><h2 className="mb-2 font-semibold">Plano ANS e mapeamento de rubricas</h2><SstForm action={saveHealthPlan} label="Registrar extensão SST">
      <label>UG<select required name="budgetUnitId" className={field}><option value="">Selecione</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
      <label>Benefício canônico existente<select required name="benefitConfigId" className={field}><option value="">Selecione</option>{configs.map((config) => <option key={config.id} value={config.id}>{config.name} · {config.type}</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-2"><label>Registro ANS do plano<input required name="ansPlanNumber" pattern="[0-9]{9}" className={field}/></label><label>Registro ANS da operadora<input required name="ansOperatorNumber" pattern="[0-9]{6}" className={field}/></label></div>
      <datalist id="canonical-benefit-rubrics">{rubrics.map((rubric) => <option key={rubric.id} value={rubric.id}>{rubric.code} · {rubric.name} · {rubric.ruleSet.name}</option>)}</datalist>
      <div className="grid gap-3 sm:grid-cols-2"><label>ID da rubrica RH de mensalidade<input required name="monthlyRubricId" list="canonical-benefit-rubrics" className={field}/></label><label>ID da rubrica RH extraordinária<input required name="extraordinaryRubricId" list="canonical-benefit-rubrics" className={field}/></label></div>
      <div className="grid gap-3 sm:grid-cols-2"><label>ID do PayrollEvent de mensalidade (opcional)<input name="monthlyEventId" className={field}/></label><label>ID do PayrollEvent extraordinário (opcional)<input name="extraordinaryEventId" className={field}/></label></div>
      <label>Referência contratual<input required name="contractReference" className={field}/></label>
      <p>ANS é registro informado; a tela não certifica cadastro ativo na ANS. O mapeamento não dispara descontos de folha.</p>
    </SstForm></section>
    <section><h2 className="mb-2 font-semibold">Adesão e vigência do beneficiário</h2><SstForm action={saveBenefitBeneficiary} label="Registrar beneficiário" redirectBase="/sst/planos">
      <label>Plano<select required name="planId" className={field}><option value="">Selecione</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.benefitConfig.name} · {plan.ansPlanNumber}</option>)}</select></label>
      <label>Vínculo canônico PayrollBenefit<select required name="payrollBenefitId" className={field}><option value="">Selecione</option>{assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.employee.name} · {assignment.benefitConfig.name}</option>)}</select></label>
      <label>Beneficiário<select name="dependentId" className={field}><option value="">Titular do vínculo</option>{assignments.flatMap((assignment) => assignment.employee.dependents.map((dependent) => <option key={`${assignment.id}:${dependent.id}`} value={dependent.id}>{dependent.name} · titular {assignment.employee.name}</option>))}</select></label>
      <div className="grid gap-3 sm:grid-cols-3">{[["admissionDate", "Adesão"], ["startsAt", "Início da cobertura"], ["endsAt", "Fim da cobertura"]].map(([name, label]) => <label key={name}>{label}<input required type="date" name={name} className={field}/></label>)}</div>
      <label>Carteirinha<input required name="cardNumber" className={field}/></label><label>Mensalidade contratual (decimal exato)<input required name="monthlyAmount" inputMode="decimal" className={field}/></label><label>Contrato/termo de adesão<input required name="contractReference" className={field}/></label>
      <p>Mensalidades automáticas exigem cobertura do mês completo. Meses parciais ficam pendentes de regra contratual de cobrança/pro rata.</p>
    </SstForm></section>
  </div>;
}
