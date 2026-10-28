import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { recertificationCampaignSchema } from "@/lib/rh/recertification";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { CampaignForm } from "./CampaignForm";
import { db } from "@/db/client";
import { readCampaignConfiguration } from "@/db/repositories/personnel-pages/catalog";
export const dynamic = "force-dynamic";
export default async function ConfigureCampaign({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const context = await getTenantContextForModule("RH"), params = await searchParams;
  const { units, ruleSets, employees, classes, rule } = await readCampaignConfiguration(context.database ?? db, context.user, params.edit);
  const parsed = recertificationCampaignSchema.safeParse(rule?.value), unitId = parsed.success ? parsed.data.budgetUnitId || rule?.unit : null;
  const values = rule && parsed.success && unitId && units.some(unit => unit.id === unitId) ? { id: rule.id, code: rule.code, name: rule.name, ruleSetId: rule.ruleSetId, isActive: rule.isActive, policy: { ...parsed.data, budgetUnitId: unitId } } : undefined;
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"><ErpPageTitle title="Configurar campanha de recadastramento" description="Escolha unidade, público, campos, seções cadastrais, comprovação e janela, sem editar JSON." /><CampaignForm units={units} ruleSets={ruleSets} employees={employees} classes={classes.map(item => ({ code: item.code, name: item.label }))} values={values} /></div>;
}
