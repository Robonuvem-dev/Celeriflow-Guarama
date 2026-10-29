import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { readPersonnelExternalReadiness } from "@/db/repositories/personnel-pages/catalog";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { rhColumn } from "../_components/operational-columns";
import { RhNewLink } from "../_components/RhNewLink";
import { EsocialConfigurationForm } from "./ConfigurationForm";
import { db } from "@/db/client";
import { readEsocialEventsPage } from "@/db/repositories/personnel-pages/requests";

export const dynamic = "force-dynamic";
export default async function RhEsocialPage({ searchParams }: { searchParams: Promise<{ page?: string; view?: string }> }) {
  const context = await getTenantContextForModule("RH"), database = context.database ?? db;
  const readiness = await readPersonnelExternalReadiness(database);
  const params = await searchParams;
  const { total, page, events } = await readEsocialEventsPage(database, params.page);
  if (params.view !== "manage") {
    const columns = [rhColumn("type", "Evento", 230, 140), rhColumn("source", "Origem", 260, 150, "identifier"), rhColumn("environment", "Ambiente", 160, 110), rhColumn("status", "Estado", 150, 100, "status"), rhColumn("actions", "Conferência", 230, 210, "actions")];
    return <OperationalListFrame label="eSocial · preparação de RH/Folha" actions={<><Link href="/rh/operacoes" className={styles.filterButton}>Operações</Link><RhNewLink href="?view=manage">Configuração e exportações</RhNewLink></>}
      pagination={<OperationalLinkPagination page={page} total={total} pathname="/rh/esocial" />}>
      <OperationalTable columns={columns} preferenceId="rh-esocial" caption="Origens de preparação eSocial RH/Folha — transmissão não ativa" emptyMessage="Nenhuma origem encontrada." rows={events.map(event => ({ id: event.id, label: event.sourceKey, values: { type: event.eventType, source: event.sourceKey, environment: event.environment, status: event.status }, actions: <Link href={event.eventType === "OBRIGACAO_ARQUIVO_GERADO" ? `/api/rh/obrigacoes/arquivos/${event.id}` : `/api/rh/integracoes/${event.id}`}>{event.eventType === "OBRIGACAO_ARQUIVO_GERADO" ? "Baixar bytes preservados" : "Baixar origem JSON"}</Link> }))} />
    </OperationalListFrame>;
  }
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
    <ErpPageTitle title="eSocial · preparação de RH/Folha" description="Parâmetros e origens segregados por ambiente. Não há transmissão ativa neste incremento." action={<Link href="/rh/operacoes">Operações</Link>} />
    <Link href="/rh/esocial" className="text-xs underline">Voltar às origens</Link>
    <div className="grid gap-2 sm:grid-cols-2">{readiness.map(row => <section key={row.environment} className="rounded border bg-white p-3 text-xs"><strong>{row.environment}</strong><p>{row.status}</p><p>{row.configured ? "Parâmetros preenchidos; cliente de transmissão pendente." : "Aguardando parâmetros oficiais."}</p></section>)}</div>
    <EsocialConfigurationForm />
    <section className="rounded border bg-white p-3 text-xs">
      <strong>Arquivos por layout configurável POC</strong>
      <p>CSV ou largura fixa ASCII, com validação de campos obrigatórios, largura, transformações e preservação dos bytes/hash. Configure uma regra OBRIGACAO_LAYOUT em Parametrizações. A geração interna requer validação do layout específico para homologação da obrigação.</p>
      <form action="/api/rh/obrigacoes/exportar" method="post" className="mt-2 flex flex-wrap items-center gap-2">
        <label>Ano <input name="year" type="number" min="1900" max="9999" defaultValue={new Date().getUTCFullYear()} required className="w-24 rounded border p-1" /></label>
        <label>Escopo <select name="scope" defaultValue="DEMONSTRACAO" className="rounded border p-1"><option>DEMONSTRACAO</option><option>HOMOLOGACAO</option><option>PRODUCAO</option></select></label>
        <label>Regra <input name="ruleId" required className="rounded border p-1" /></label>
        <button className="rounded border px-2 py-1">Gerar e baixar arquivo</button>
      </form>
    </section>
    <section className="rounded border bg-white p-3 text-xs">
      <strong>Histórico de conferência das obrigações</strong>
      <p>Exportação integral de cálculos oficiais fechados no ano/escopo, com identidade histórica, rubricas, bases, totais e hashes SHA-256. Referência pela competência calculada; classificações fiscais e data de pagamento têm apuração própria.</p>
      <form action="/api/rh/obrigacoes/historico" method="get" className="mt-2 flex flex-wrap items-center gap-2">
        <label>Ano <input name="year" type="number" min="1900" max="9999" defaultValue={new Date().getUTCFullYear()} required className="w-24 rounded border p-1" /></label>
        <label>Escopo <select name="scope" defaultValue="DEMONSTRACAO" className="rounded border p-1"><option value="DEMONSTRACAO">Demonstração POC</option><option value="HOMOLOGACAO">Homologação</option><option value="PRODUCAO">Produção</option></select></label>
        <button type="submit" className="rounded border px-2 py-1">Baixar histórico JSON</button>
      </form>
    </section>
  </div>;
}
