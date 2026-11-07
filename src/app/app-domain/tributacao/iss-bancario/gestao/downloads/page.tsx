import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

export const dynamic = "force-dynamic";

const downloads: Record<string, { req: string; label: string; description: string }> = {
  manual: {
    req: "Req. 28.18",
    label: "Manual do Usuário DES-IF / CeleriFlow",
    description: "Guia operacional completo de importação dos Módulos 1 a 4, apuração mensal, balancete, tarifas, emissão de DAM e fiscalização bancária.",
  },
  "modelo-conceitual-abrasf": {
    req: "Req. 28.19",
    label: "Modelo Conceitual ABRASF DES-IF (Versão 3.1)",
    description: "Especificação técnica da estrutura dos Módulos 1, 2, 3 e 4, blocos e registros padronizados do Modelo Conceitual ABRASF DES-IF.",
  },
  "orgao-configuracao": {
    req: "Req. 28.20",
    label: "Parâmetros do Município",
    description: "Configurações institucionais do órgão tributário, vigências, alíquotas e parâmetros fiscais vigentes para o ISS Bancário.",
  },
  "codigo-tributacao-desif": {
    req: "Req. 28.21",
    label: "Códigos de Tributação DES-IF",
    description: "Tabela de códigos de tributação do modelo ABRASF DES-IF vinculada aos subitens da Lista de Serviços da LC 116/2003.",
  },
  "evento-contabil": {
    req: "Req. 28.22",
    label: "Relação de Eventos Contábeis",
    description: "Catálogo de eventos contábeis utilizados na escrituração de partidas e conciliação bancária.",
  },
  "mensagens-erros-alertas": {
    req: "Req. 28.23",
    label: "Relação de Mensagens de Erros e Alertas",
    description: "Tabela oficial de códigos de erros impeditivos e alertas de validação na importação e processamento dos arquivos DES-IF.",
  },
  "produto-servico": {
    req: "Req. 28.24",
    label: "Relação de Outros Produtos e Serviços Bancários",
    description: "Catálogo de produtos e serviços bancários sujeitos à incidência do ISSQN (Módulo 3 — Registro 0300).",
  },
  "titulo-desif": {
    req: "Req. 28.25",
    label: "Tabela de Títulos Contábeis",
    description: "Títulos contábeis padronizados para agrupamento de contas PGCC e COSIF das instituições financeiras.",
  },
  "tarifa-bancaria": {
    req: "Req. 28.26",
    label: "Relação de Tarifas Bancárias",
    description: "Relação padronizada de tarifas de serviços bancários cadastradas para confronto de receitas (Módulo 3 — Registro 0200).",
  },
  "tipo-dependencia": {
    req: "Req. 28.27",
    label: "Relação de Tipos de Dependência",
    description: "Classificação de agências, postos de atendimento (PA), unidades administrativas e dependências de instituições financeiras.",
  },
  "codigo-tributacao-municipal": {
    req: "Req. 28.33",
    label: "Códigos de Tributação Municipal",
    description: "Relação de códigos de tributação próprios do município e respectivas alíquotas de ISSQN.",
  },
};

export default async function DesifDownloadsPage() {
  await getTenantContextForModule("TRIBUTACAO");
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <header className="cf-portal-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
              ISS Bancário — DES-IF (CF28 — Requisitos 28.18 a 28.27)
            </p>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              Downloads de Manuais, Modelo Conceitual ABRASF e Tabelas Auxiliares DES-IF
            </h1>
            <p className="mt-1 text-xs text-slate-600">
              Disponibilização para download do Manual do Usuário, Modelo Conceitual ABRASF, Parâmetros do Município, Mensagens de Erros e Alertas e todas as Tabelas Auxiliares DES-IF.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/tributacao/iss-bancario/gestao" className="cf-portal-btn-secondary">
              Voltar à gestão
            </Link>
            <Link href="/tributacao/iss-bancario" className="cf-portal-btn">
              Painel ISS Bancário
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(downloads).map(([kind, info]) => (
          <article key={kind} className="cf-portal-card flex flex-col justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                {info.req}
              </span>
              <h2 className="mt-0.5 text-sm font-bold text-slate-900">{info.label}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">{info.description}</p>
            </div>
            <div>
              <a
                className="cf-portal-btn-secondary w-full"
                href={`/tributacao/iss-bancario/gestao/downloads/arquivo?kind=${kind}`}
              >
                Baixar arquivo ({kind})
              </a>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
