import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { personalReportKinds } from "@/lib/portal-servidor/personal-reports";
import { attendanceTotalsPolicySchema } from "@/lib/portal-servidor/attendance-totals";

export const dynamic = "force-dynamic";

const labels: Record<(typeof personalReportKinds)[number], string> = {
  FICHA_FINANCEIRA: "Ficha financeira", CONTRIBUICOES: "Contribuições previdenciárias",
  SALARIOS_CONTRIBUICAO: "Salários de contribuição por previdência/vínculo",
  PONTO: "Espelho de ponto", FERIAS: "Direitos e saldos de férias", BANCO_HORAS: "Banco de horas",
  LICENCA_PREMIO: "Licença-prêmio", AFASTAMENTOS: "Afastamentos e faltas", CONSIGNACOES: "Consignações",
  FICHA_REGISTRO: "Ficha de registro funcional", ATOS: "Atos legais", PLANOS: "Despesas dos planos de saúde",
  GOZOS_LICENCA_PREMIO: "Gozos de licença-prêmio vinculados ao RH", HISTORICO_ATS: "Histórico do adicional por tempo de serviço",
};

export default async function PersonalReportsPage() {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Acesso funcional indisponível.</p>;
  const contracts = await access.context.prisma.hrEmploymentContract.findMany({
    where: { employeeId: access.employee.id }, select: { id: true, registration: true, status: true }, orderBy: { registration: "asc" },
  });
  const today = new Date().toISOString().slice(0, 10);
  const rules = await access.context.prisma.hrPayrollRule.findMany({ where: { category: "PORTAL", isActive: true, valueType: "JSON", ruleSet: { status: "ATIVA" } }, select: { id: true, name: true, value: true } });
  const totalizers = rules.filter(rule => { const policy = attendanceTotalsPolicySchema.safeParse(rule.value); return policy.success && (!policy.data.employeeIds.length || policy.data.employeeIds.includes(access.employee.id)); });
  const control = "h-9 rounded border border-slate-300 bg-white px-2 text-sm";
  return <div className="flex flex-1 flex-col gap-3 p-3">
    <ErpPageTitle title="Meus relatórios" description="Emissão integral do filtro a partir dos registros pessoais de RH, Folha e SST." />
    <form action="/api/portal-servidor/relatorios" method="get" className="grid max-w-3xl gap-4 rounded border border-slate-300 bg-white p-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs sm:col-span-2">Relatório<select name="kind" required className={control}>{personalReportKinds.map(kind => <option key={kind} value={kind}>{labels[kind]}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs">Início<input name="from" type="date" required defaultValue={`${today.slice(0, 4)}-01-01`} className={control} /></label>
      <label className="flex flex-col gap-1 text-xs">Fim<input name="until" type="date" required defaultValue={today} className={control} /></label>
      <label className="flex flex-col gap-1 text-xs">Contrato<select name="contractId" className={control}><option value="">Todos os meus vínculos / cadastro pessoal</option>{contracts.map(contract => <option key={contract.id} value={contract.id}>{contract.registration} · {contract.status}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs">Formato<select name="format" className={control}><option value="PDF">PDF</option><option value="CSV">CSV</option><option value="XLSX">Excel</option></select></label>
      <label className="flex flex-col gap-1 text-xs sm:col-span-2">Totalizadores de ponto configurados pelo RH<select name="totalsPolicyId" className={control}><option value="">Totalizadores padrão do espelho</option>{totalizers.map(policy => <option key={policy.id} value={policy.id}>{policy.name}</option>)}</select></label>
      <p className="text-xs text-slate-600 sm:col-span-2">Ponto, afastamentos, atos e planos de saúde usam o cadastro pessoal: selecione todos os vínculos. A ficha de registro apresenta o cadastro atual e as revisões até o fim do período. Os relatórios financeiros incluem apenas demonstrativos liberados para consulta.</p>
      <button className="h-9 rounded bg-emerald-800 px-4 text-sm font-semibold text-white sm:col-span-2">Emitir relatório integral</button>
    </form>
  </div>;
}
