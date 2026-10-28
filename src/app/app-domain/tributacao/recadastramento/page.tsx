import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import RecadastramentoClient from "./RecadastramentoClient";
import { db } from "@/db/client";
import { listFiscalProperties } from "@/db/repositories/taxation-pages/lookups";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";

export const dynamic = "force-dynamic";

export default async function RecadastramentoPage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const database = context.database ?? db;
  const [configs, requests, properties] = await Promise.all([
    listFiscalEntries(database, { entityType: "RECADASTRAMENTO_CAMPAIGN", categories: ["CAMPOS_PERMITIDOS"], order: "created" }),
    listFiscalEntries(database, { entityType: "REAL_ESTATE", categories: ["PEDIDO_ALTERACAO"], source: "CONTRIBUINTE", order: "created", limit: 200 }),
    listFiscalProperties(database, { order: true }),
  ]);
  return <RecadastramentoClient campaigns={configs.map((item) => ({ id: item.id, code: item.entityId, title: item.title, data: item.data, startsAt: item.effectiveFrom.toISOString(), endsAt: item.effectiveUntil?.toISOString() ?? null, status: item.status }))} requests={requests.map((item) => ({ id: item.id, estateId: item.entityId, title: item.title, data: item.data, status: item.status, createdAt: item.createdAt.toISOString() }))} properties={properties.map((item) => ({ id: item.id, label: item.municipalInsc ?? item.registration ?? item.streetName ?? item.id }))} />;
}
