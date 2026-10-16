import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { describeHrExternalReadiness } from "@/lib/rh/external-configuration";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { EsocialConfigurationForm } from "./ConfigurationForm";

export const dynamic = "force-dynamic";
export default async function RhEsocialPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { prisma } = await getTenantContextForModule("RH");
  const readiness = await describeHrExternalReadiness(prisma);
  const where = { OR: [{ domain: "ESOCIAL" }, { domain: "AUDITORIA", eventType: "OBRIGACAO_ARQUIVO_GERADO" }] };
  const total = await prisma.hrIntegrationEvent.count({ where });
  const page = Math.min(Math.max(1, Number.parseInt((await searchParams).page || "1") || 1), Math.max(1, Math.ceil(total / 20)));
  const events = await prisma.hrIntegrationEvent.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 20, skip: (page - 1) * 20 });
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
    <ErpPageTitle title="eSocial · preparação de RH/Folha" description="Parâmetros e origens segregados por ambiente. Não há transmissão ativa neste incremento." action={<Link href="/rh/operacoes">Operações</Link>} />
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
    <table className="w-full border bg-white text-left text-xs"><thead><tr><th className="p-2">Origem</th><th>Ambiente</th><th>Estado</th><th>Conferência</th></tr></thead><tbody>{events.map(event => <tr key={event.id} className="h-7 border-t"><td className="truncate px-2" title={event.sourceKey}>{event.eventType} · {event.sourceKey}</td><td>{event.environment}</td><td>{event.status}</td><td><Link href={event.eventType === "OBRIGACAO_ARQUIVO_GERADO" ? `/api/rh/obrigacoes/arquivos/${event.id}` : `/api/rh/integracoes/${event.id}`}>{event.eventType === "OBRIGACAO_ARQUIVO_GERADO" ? "Baixar bytes preservados" : "Baixar origem JSON"}</Link></td></tr>)}</tbody></table>
    <ErpPagination page={page} total={total} pageSize={20} label="origens" previousHref={`?page=${page - 1}`} nextHref={`?page=${page + 1}`} />
  </div>;
}
