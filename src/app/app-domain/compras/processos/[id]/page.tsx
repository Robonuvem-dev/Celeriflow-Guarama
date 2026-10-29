import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ClipboardList, Edit } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { db } from "@/db/client";
import { loadPurchaseProcessDetail } from "@/db/repositories/procurement/purchase-processes";
import { ComprasPanelTable } from "../../_components/ComprasPanelTable";
import { comprasColumn as column } from "../../_components/columns";

export default async function ProcessoDetalhesPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("COMPRAS");
  const resolvedParams = await params;
  const processo = await loadPurchaseProcessDetail(context.database ?? db, resolvedParams.id);

  if (!processo) {
    notFound();
  }

  return (
    <PageFrame className="space-y-2">
      <PageHeader title="Detalhes do Processo" icon={<ClipboardList className="size-4 shrink-0 text-blue-600" />} action={<><Link href="/compras/processos" aria-label="Voltar"><Button variant="outline" size="icon"><ArrowLeft className="size-4" /></Button></Link><Link href={`/compras/processos/${processo.id}/editar`}><Button variant="outline" size="sm"><Edit className="size-3.5" /><span className="hidden sm:inline">Editar</span></Button></Link></>} />

      <Card className="rounded-md">
        <CardHeader className="border-b p-3">
          <CardTitle className="text-sm">Informações Gerais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Número</p>
              <p className="text-lg">{processo.number}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <Badge variant="secondary">{processo.status}</Badge>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Objeto</p>
            <p>{processo.object}</p>
          </div>
          <div className="grid gap-3 border-t pt-3 sm:grid-cols-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Tipo</p>
              <p>{processo.type}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Modalidade</p>
              <p>{processo.modality}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Secretaria</p>
              <p>{processo.secretariat?.name}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-md">
        <CardHeader className="border-b p-3">
          <CardTitle className="text-sm">Solicitações de Origem ({processo.requestOrigins.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-3 text-sm">
          {processo.requestOrigins.length ? <ul className="space-y-2">
            {processo.requestOrigins.map((origin) => (
              <li key={origin.id} className="rounded-md border px-3 py-2">
                <Link className="font-medium text-primary underline-offset-2 hover:underline" href={`/compras/solicitacoes/${origin.purchaseRequest.id}`}>
                  {origin.purchaseRequest.number}
                </Link>
                <span className="text-muted-foreground"> · {origin.purchaseRequest.object}</span>
              </li>
            ))}
          </ul> : <p className="text-muted-foreground">Processo legado sem origem detalhada registrada.</p>}
        </CardContent>
      </Card>

      <Card className="rounded-md">
        <CardHeader className="border-b p-3">
          <CardTitle className="text-sm">Itens do Processo ({processo.items.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <ComprasPanelTable title={`Itens do processo ${processo.number}`} preferenceId="compras-processo-itens"
            columns={[column("name", "Item / serviço", 160, 350, "identifier"), column("quantity", "Quantidade", 80, 110, "text", "right"), column("unitValue", "Valor unitário", 100, 140, "text", "right"), column("subtotal", "Subtotal", 100, 140, "text", "right"), column("origins", "Origem e alocação", 160, 300)]}
            rows={processo.items.map((item) => {
              const name = item.catalogItem?.name ?? item.customName ?? "Item";
              const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
              const origins = item.requestItemOrigins.flatMap((origin) => {
                const request = origin.purchaseRequestItem.purchaseRequest;
                const allocations = origin.purchaseRequestItem.budgetAllocations;
                const action = <Link href={`/compras/solicitacoes/${request.id}`}>Abrir solicitação</Link>;
                if (!allocations.length) return [{ id: origin.id, label: request.number, values: { request: request.number, originQuantity: String(origin.quantity), code: "Sem alocação registrada", nature: "-", source: "-", unit: "-", year: "-", quantity: "-", value: "-" }, actions: action }];
                return allocations.map((allocation) => {
                  const appropriation = allocation.budgetAppropriation;
                  return { id: `${origin.id}-${allocation.id}`, label: request.number, values: { request: request.number, originQuantity: String(origin.quantity), code: appropriation.code, nature: appropriation.expenseNature.code, source: appropriation.resourceSource.code, unit: appropriation.budgetUnit.name, year: String(appropriation.financialYear.year), quantity: String(allocation.quantity), value: money(allocation.valueDecimal.toNumber()) }, actions: action };
                });
              });
              return { id: item.id, label: name, values: { name, quantity: String(item.quantity), unitValue: money(item.estimatedUnitValue ?? 0), subtotal: money(item.quantity * (item.estimatedUnitValue ?? 0)), origins: origins.map((row) => Object.values(row.values).join(" · ")).join("\n") || "Item sem origem de solicitação" }, cells: {
                origins: <ComprasPanelTable title={`Origem e alocações de ${name}`} triggerLabel={`Ver origem e alocações (${origins.length})`} preferenceId="compras-processo-origens" rows={origins}
                  columns={[column("request", "Solicitação", 100, 150), column("originQuantity", "Quantidade de origem", 75, 100), column("code", "Dotação", 85, 120), column("nature", "Natureza", 80, 110), column("source", "Fonte", 65, 85), column("unit", "Unidade gestora", 110, 180), column("year", "Exercício", 65, 80), column("quantity", "Quantidade alocada", 75, 100), column("value", "Valor alocado", 95, 130), column("actions", "Ações", 135, 140, "actions")]} />,
              } };
            })} />
          <div className="mt-4 text-right">
            <p className="text-lg font-bold">Total Estimado: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(processo.estimatedValue ?? 0)}</p>
          </div>
        </CardContent>
      </Card>
    </PageFrame>
  );
}
