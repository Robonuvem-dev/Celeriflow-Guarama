import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { recertificationCampaignSchema } from "@/lib/rh/recertification";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { CampaignForm } from "./CampaignForm";
export const dynamic = "force-dynamic";
export default async function ConfigureCampaign({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const context = await getTenantContextForModule("RH"), params = await searchParams;
  const units = await context.prisma.budgetUnit.findMany({ where: isSystemAdministrator(context.user) ? {} : { id: { in: context.user.allowedBudgetUnitIds } }, select: { id: true, name: true, secretariatId: true }, orderBy: { name: "asc" } });
  const ruleSets = await context.prisma.hrPayrollRuleSet.findMany({ where: { status: "ATIVA" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const employees = await context.prisma.employee.findMany({ where: { isActive: true, secretariatId: { in: units.map(unit => unit.secretariatId) } }, select: { id: true, name: true, registration: true, secretariatId: true }, orderBy: { name: "asc" } });
  const classes = await context.prisma.documentClass.findMany({ where: { isActive: true }, select: { code: true, label: true }, orderBy: { label: "asc" } });
  const rule = params.edit ? await context.prisma.hrPayrollRule.findFirst({ where: { id: params.edit, category: "PORTAL" } }) : null;
  const parsed = recertificationCampaignSchema.safeParse(rule?.value), unitId = parsed.success ? parsed.data.budgetUnitId || rule?.unit : null;
  const values = rule && parsed.success && unitId && units.some(unit => unit.id === unitId) ? { id: rule.id, code: rule.code, name: rule.name, ruleSetId: rule.ruleSetId, isActive: rule.isActive, policy: { ...parsed.data, budgetUnitId: unitId } } : undefined;
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"><ErpPageTitle title="Configurar campanha de recadastramento" description="Escolha unidade, público, campos, seções cadastrais, comprovação e janela, sem editar JSON." /><CampaignForm units={units} ruleSets={ruleSets} employees={employees} classes={classes.map(item => ({ code: item.code, name: item.label }))} values={values} /></div>;
}
