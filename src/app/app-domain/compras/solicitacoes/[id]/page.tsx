import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Edit, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ApprovePurchaseRequestButton } from "../ApprovePurchaseRequestButton";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { canManagePurchaseRequest } from "@/lib/compras/purchase-request-policy";
import { db } from "@/db/client";
import { loadPurchaseRequestDetail } from "@/db/repositories/procurement/purchase-requests";
import { ComprasPanelTable } from "../../_components/ComprasPanelTable";
import { comprasColumn as column } from "../../_components/columns";
import { loadExternalAdhesion } from "@/db/repositories/procurement/external-adhesion";

export default async function SolicitacaoDetalhesPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("COMPRAS");
  const { user } = context;
  const resolvedParams = await params;
  const solicitacao = await loadPurchaseRequestDetail(context.database ?? db, resolvedParams.id);

  if (!solicitacao) {
    notFound();
  }
  const adhesion = await loadExternalAdhesion(context.database ?? db, solicitacao.id);

  return (
    <PageFrame className="space-y-2">
      <PageHeader
        title="Detalhes da Solicitação"
        icon={<ShoppingCart className="size-4 shrink-0 text-emerald-600" />}
        action={<><Link href="/compras/solicitacoes" aria-label="Voltar"><Button variant="outline" size="icon"><ArrowLeft className="size-4" /></Button></Link>{canManagePurchaseRequest(user, solicitacao) ? <Link href={`/compras/solicitacoes/${solicitacao.id}/editar`}><Button variant="outline" size="sm"><Edit className="size-3.5" /><span className="hidden sm:inline">Editar</span></Button></Link> : null}{solicitacao.status === "Rascunho" && <ApprovePurchaseRequestButton id={solicitacao.id} />}</>}
      />

      <Card className="rounded-md">
        {adhesion && <section className="space-y-1 border-b p-3"><h2 className="font-semibold">Origem: adesão externa</h2><p>Órgão gerenciador: {adhesion.organization}</p><p>Processo: {adhesion.processNumber} · Ata: {adhesion.minutesNumber}</p></section>}
        <CardHeader className="border-b p-3">
          <CardTitle className="text-sm">Informações Gerais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Número</p>
              <p className="text-lg">{solicitacao.number}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <Badge variant={solicitacao.status === 'Rascunho' ? 'secondary' : 'default'}>{solicitacao.status}</Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Prioridade do planejamento</p>
              <p>{solicitacao.priority}</p>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Objeto</p>
            <p>{solicitacao.object}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Justificativa</p>
            <p>{solicitacao.justification}</p>
          </div>
          <div className="grid gap-3 border-t pt-3 sm:grid-cols-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Secretaria</p>
              <p>{solicitacao.secretariat?.name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Departamento</p>
              <p>{solicitacao.department?.name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Solicitante</p>
              <p>{solicitacao.requester?.name}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-md">
        <CardHeader className="border-b p-3">
          <CardTitle className="text-sm">Itens ({solicitacao.items.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <ComprasPanelTable title={`Itens da solicitação ${solicitacao.number}`} preferenceId="compras-solicitacao-itens"
            columns={[column("name", "Item / serviço", 150, 300, "identifier"), column("quantity", "Quantidade", 80, 100, "text", "right"), column("unitValue", "Valor unitário", 100, 130, "text", "right"), column("subtotal", "Subtotal", 100, 130, "text", "right"), column("allocations", "Alocações orçamentárias", 130, 220), column("origins", "Processos de origem", 130, 220)]}
            rows={solicitacao.items.map((item) => {
              const name = item.catalogItem?.name ?? item.customName ?? "Item";
              const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
              const allocations = item.budgetAllocations.map((allocation) => {
                const appropriation = allocation.budgetAppropriation;
                return { id: allocation.id, label: appropriation.code, values: { code: appropriation.code, nature: appropriation.expenseNature.code, source: appropriation.resourceSource.code, unit: appropriation.budgetUnit.name, year: String(appropriation.financialYear.year), quantity: String(allocation.quantity), value: money(allocation.valueDecimal.toNumber()) } };
              });
              const origins = item.processItemOrigins.map((origin) => ({ id: origin.id, label: origin.purchaseProcessItem.purchaseProcess.number, values: { process: origin.purchaseProcessItem.purchaseProcess.number, quantity: String(origin.quantity), status: origin.purchaseProcessItem.purchaseProcess.status }, actions: <Link href={`/compras/processos/${origin.purchaseProcessItem.purchaseProcess.id}`}>Abrir processo</Link> }));
              return { id: item.id, label: name, values: { name, quantity: String(item.quantity), unitValue: money(item.estimatedUnitValue ?? 0), subtotal: money(item.quantity * (item.estimatedUnitValue ?? 0)), allocations: allocations.map((row) => Object.values(row.values).join(" · ")).join("\n") || "Sem alocação", origins: origins.map((row) => Object.values(row.values).join(" · ")).join("\n") || "Ainda não agrupado" },
                cells: {
                  allocations: <ComprasPanelTable title={`Alocações de ${name}`} triggerLabel={`Ver alocações (${allocations.length})`} preferenceId="compras-solicitacao-alocacoes" columns={[column("code", "Dotação", 90, 140), column("nature", "Natureza", 90, 130), column("source", "Fonte", 75, 100), column("unit", "Unidade gestora", 140, 260), column("year", "Exercício", 70, 90), column("quantity", "Quantidade", 80, 100), column("value", "Valor", 100, 140)]} rows={allocations} />,
                  origins: <ComprasPanelTable title={`Processos de ${name}`} triggerLabel={`Ver processos (${origins.length})`} preferenceId="compras-solicitacao-origens" columns={[column("process", "Processo", 130, 300), column("quantity", "Quantidade", 90, 120), column("status", "Situação", 120, 240, "status"), column("actions", "Ações", 120, 130, "actions")]} rows={origins} />,
                } };
            })} />
          <div className="mt-4 text-right">
            <p className="text-lg font-bold">Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(solicitacao.estimatedValue ?? 0)}</p>
          </div>
        </CardContent>
      </Card>
    </PageFrame>
  );
}
