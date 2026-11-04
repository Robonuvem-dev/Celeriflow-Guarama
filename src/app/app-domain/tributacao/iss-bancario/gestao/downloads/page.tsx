import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

export const dynamic = "force-dynamic";

const downloads: Record<string, { label: string; description: string }> = {
  manual: {
    label: "Manual do usuário CeleriFlow / DES-IF",
    description: "Guia operacional de importação, apuração mensal, balancete, tarifas e fiscalização bancária.",
  },
  "orgao-configuracao": {
    label: "Parâmetros cadastrados do município",
    description: "Configurações institucionais, brasão e parâmetros fiscais vigentes para o ISS Bancário.",
  },
  "codigo-tributacao-desif": {
    label: "Códigos de tributação DES-IF",
    description: "Tabela de códigos de tributação do modelo ABRASF DES-IF vinculada aos itens da LC 116.",
  },
  "codigo-tributacao-municipal": {
    label: "Códigos de tributação municipal",
    description: "Relação de códigos de tributação próprios do município e respectivas alíquotas de ISS.",
  },
  "evento-contabil": {
    label: "Eventos contábeis",
    description: "Catálogo de eventos contábeis utilizados na escrituração e conciliação bancária.",
  },
  "produto-servico": {
    label: "Outros produtos e serviços",
    description: "Catálogo de produtos e serviços bancários sujeitos à incidência do ISSQN.",
  },
  "titulo-desif": {
    label: "Tabela de títulos",
    description: "Títulos contábeis padronizados para agrupamento de contas PGCC e COSIF.",
  },
  "tarifa-bancaria": {
    label: "Tarifas bancárias",
    description: "Relação de tarifas de serviços bancários cadastradas para confronto de receitas.",
  },
  "tipo-dependencia": {
    label: "Tipos de dependência",
    description: "Classificação de agências, postos de atendimento e dependências de instituições financeiras.",
  },
};

export default async function DesifDownloadsPage() {
  await getTenantContextForModule("TRIBUTACAO");
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <header className="cf-portal-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">ISS Bancário — DES-IF (CF28)</p>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Downloads e Tabelas Auxiliares DES-IF</h1>
            <p className="mt-1 text-xs text-slate-600">
              Exportação de manuais, parâmetros do município e tabelas de referência cadastradas para integração com instituições financeiras.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/tributacao/iss-bancario/gestao" className="cf-portal-btn-secondary">Voltar à gestão</Link>
            <Link href="/tributacao/iss-bancario" className="cf-portal-btn">Painel ISS Bancário</Link>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(downloads).map(([kind, info]) => (
          <article key={kind} className="cf-portal-card flex flex-col justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">{info.label}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">{info.description}</p>
            </div>
            <div>
              <a className="cf-portal-btn-secondary w-full" href={`/tributacao/iss-bancario/gestao/downloads/arquivo?kind=${kind}`}>
                Baixar arquivo ({kind})
              </a>
            </div>
          </article>
        ))}
      </section>

      <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-xs">
        As tabelas são exportadas dos cadastros locais autorizados, sem substituir publicações oficiais. O modelo conceitual ABRASF 3.1 e sua relação oficial de mensagens/alertas precisam ser fornecidos pelo município ou pelo publicador oficial; não são simulados por um arquivo local.
      </p>
    </main>
  );
}
