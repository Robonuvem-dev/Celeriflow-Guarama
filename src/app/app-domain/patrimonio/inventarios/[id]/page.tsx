import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InventoryCountClient } from "../InventoryCountClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { inventorySessions, inventorySessionItems, warehouses, materialStocks, materials } from "@/db/schema/assets-stock";
import { users } from "@/db/schema/identity";

export default async function InventarioDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getTenantContextForModule("PATRIMONIO");
  const approvers = alias(users, "inventory_approvers");
  const [loaded] = await db.select({ session: inventorySessions, warehouse: { name: warehouses.name }, createdByUsuario: { nome: users.nome }, approvedByUsuario: { nome: approvers.nome } }).from(inventorySessions)
    .innerJoin(warehouses, eq(warehouses.id, inventorySessions.warehouseId)).innerJoin(users, eq(users.id, inventorySessions.createdByUsuarioId))
    .leftJoin(approvers, eq(approvers.id, inventorySessions.approvedByUsuarioId)).where(eq(inventorySessions.id, id)).limit(1);
  if (!loaded) notFound();
  const items = await db.select({ item: inventorySessionItems, stock: materialStocks, material: { code: materials.code, name: materials.name, unitOfMeasure: materials.unitOfMeasure } }).from(inventorySessionItems)
    .innerJoin(materialStocks, eq(materialStocks.id, inventorySessionItems.stockId)).innerJoin(materials, eq(materials.id, materialStocks.materialId))
    .where(eq(inventorySessionItems.sessionId, id)).orderBy(asc(materials.name)).then(rows => rows.map(row => ({ ...row.item, stock: { ...row.stock, material: row.material } })));
  const session = { ...loaded.session, warehouse: loaded.warehouse, createdByUsuario: loaded.createdByUsuario, approvedByUsuario: loaded.approvedByUsuario, items };

  const divergenceCount = session.items.filter((item) => item.countedQuantity !== null && item.countedQuantity !== item.expectedQuantity).length;
  return (
    <PageFrame className="space-y-2"><PageHeader title="Relatório de Inventário" action={<Link href="/patrimonio/inventarios" className="text-xs font-semibold text-slate-600 underline">Voltar à listagem</Link>} /><p className="text-xs text-muted-foreground">{session.warehouse.name} · iniciado em {session.startedAt.toLocaleString("pt-BR")}</p><Card className="rounded-md"><CardHeader className="border-b p-3"><CardTitle className="text-sm">Rastreabilidade</CardTitle><CardDescription className="text-xs">Situação: {session.status}. Responsável pela abertura: {session.createdByUsuario.nome}. Itens com ajuste: {divergenceCount}.</CardDescription></CardHeader><CardContent className="grid gap-2 p-3 text-sm md:grid-cols-2"><p>Bloqueio de movimentos: {session.lockMovements ? "ativo" : "liberado"}</p><p>Enviado para aprovação: {session.submittedAt?.toLocaleString("pt-BR") ?? "não enviado"}</p><p>Aprovado por: {session.approvedByUsuario?.nome ?? "pendente"}</p><p>Evidência da aprovação: {session.approvalEvidence ?? "pendente"}</p></CardContent></Card><Card className="rounded-md"><CardHeader className="border-b p-3"><CardTitle className="text-sm">Contagem e divergências</CardTitle><CardDescription className="text-xs">O relatório preserva o saldo esperado, a contagem informada, justificativas e a evidência da aprovação.</CardDescription></CardHeader><CardContent className="p-3"><InventoryCountClient sessionId={session.id} status={session.status} items={session.items} /></CardContent></Card></PageFrame>
  );
}
