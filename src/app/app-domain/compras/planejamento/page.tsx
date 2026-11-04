import Link from "next/link";
import { db } from "@/db/client";
import { listPurchasePlannings } from "@/db/repositories/procurement/purchase-planning";
import { getCf30GovernanceAndWarrantyDescriptor } from "@/lib/compras/internal-phase-documents";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { PlanningListClient } from "./PlanningListClient";

export default async function PlanejamentoComprasPage() {
  const context = await getTenantContextForModule("COMPRAS");
  const { user } = context;
  const plannings = await listPurchasePlannings(context.database ?? db);
  const governance = getCf30GovernanceAndWarrantyDescriptor();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Link className="inline-block underline font-medium" href="/compras/planejamento/pca">
            Consolidação do PCA
          </Link>
          <a
            className="inline-block underline"
            href="/api/compras/planejamento/pca/relatorio"
            target="_blank"
            rel="noreferrer"
          >
            Relatório Gerencial da Fase Interna (PCA / ETP / TR)
          </a>
        </div>
        <span className="text-xs text-muted-foreground">
          {governance.legalFramework.primaryLaw} · Garantia e Suporte Técnico: {governance.warrantyAndSupport.warrantyMonths} meses ({governance.performanceAndAvailability.availabilityTarget} SLA)
        </span>
      </div>
      <PlanningListClient
        canCreate={canPerformModuleOperation(user, "COMPRAS", "create")}
        canUpdate={canPerformModuleOperation(user, "COMPRAS", "update")}
        plannings={plannings.map((planning) => ({
          id: planning.id,
          itemName: planning.catalogItem?.name ?? planning.description ?? "Item sem especificação",
          description: planning.catalogItem ? planning.description : null,
          unit: planning.unit,
          quantity: planning.quantity,
          expectedPeriodStart: planning.expectedPeriodStart.toISOString(),
          expectedPeriodEnd: planning.expectedPeriodEnd.toISOString(),
          estimatedValueDecimal: Number(planning.estimatedValueDecimal),
          status: planning.status,
          originId: planning.originPurchaseRequest?.id ?? null,
          originNumber: planning.originPurchaseRequest?.number ?? null,
          originObject: planning.originPurchaseRequest?.object ?? null,
        }))}
      />
    </>
  );
}
