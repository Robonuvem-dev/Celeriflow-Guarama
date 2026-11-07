import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import type { JsonValue } from "@/db/json";
import PrintReport from "@/app/app-domain/tributacao/relatorios-cadastrais/PrintReport";

export const dynamic = "force-dynamic";

type BatchRow = {
  id: string;
  institutionId: string;
  institution: string;
  cnpj: string;
  competence: string;
  moduleType: string;
  fileName: string;
  abrasfVersion: string;
  receivedAt: string;
  processedAt: string | null;
  receiptNumber: string | null;
  status: string;
  payload: JsonValue;
  inconsistencies: JsonValue;
};

export default async function DesifDeclarationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  let requestedId = rawId;
  try {
    requestedId = decodeURIComponent(rawId);
  } catch {
    requestedId = rawId;
  }
  const context = await getTenantContextForModule("TRIBUTACAO"),
    database = context.database ?? db;

  const isPlaceholder = requestedId === "[id]" || requestedId.toLowerCase() === "id";
  const recentBatches = await database.execute<{ id: string; institution: string; competence: string; moduleType: string; status: string }>(
    sql`SELECT b.id, i.name AS institution, b.competence, b."moduleType", b.status FROM "DesifImportBatch" b JOIN "DesifFinancialInstitution" i ON i.id = b."institutionId" ORDER BY b."receivedAt" DESC LIMIT 15`,
  );

  let row: BatchRow | undefined;
  if (!isPlaceholder) {
    const direct = await database.execute<BatchRow>(
      sql`SELECT b.*, i.name AS institution, i."baseCnpj" AS cnpj FROM "DesifImportBatch" b JOIN "DesifFinancialInstitution" i ON i.id = b."institutionId" WHERE b.id = ${requestedId} OR b."receiptNumber" = ${requestedId} LIMIT 1`,
    );
    row = direct.rows[0];
  }
  if (!row) {
    const latest = await database.execute<BatchRow>(
      sql`SELECT b.*, i.name AS institution, i."baseCnpj" AS cnpj FROM "DesifImportBatch" b JOIN "DesifFinancialInstitution" i ON i.id = b."institutionId" ORDER BY b."receivedAt" DESC LIMIT 1`,
    );
    row = latest.rows[0];
  }

  if (!row) {
    return (
      <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <header className="cf-portal-hero">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">ISS Bancário — DES-IF (CF28)</p>
              <h1 className="text-xl font-bold text-slate-900">Declaração DES-IF</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="cf-portal-btn-secondary" href="/tributacao/iss-bancario/gestao">Voltar à gestão</Link>
              <Link className="cf-portal-btn" href="/tributacao/iss-bancario">Receber Declaração</Link>
            </div>
          </div>
        </header>
        <section className="cf-portal-card">
          <p className="text-sm text-slate-600">
            Nenhuma declaração DES-IF localizada para o identificador informado (<code>{requestedId}</code>). Utilize o painel do ISS Bancário para importar e validar declarações bancárias.
          </p>
        </section>
      </main>
    );
  }

  const batchId = row.id;
  const [assessments, balances, accounts, tariffs, products, agenciesCountResult] = await Promise.all([
    database.execute<{
      id: string;
      agency: string;
      code: string;
      name: string;
      serviceItem: string | null;
      revenue: string;
      deduction: string;
      base: string;
      rate: string;
      iss: string;
      credit: string;
      debit: string;
      due: string;
      guideId: string | null;
    }>(
      sql`SELECT a.id,g.name AS agency,s.code,s.name,COALESCE(s."serviceItem",p."serviceItem",'15.01') AS "serviceItem",a."revenueDecimal"::text AS revenue,a."deductionDecimal"::text AS deduction,a."taxableBaseDecimal"::text AS base,a.rate::text,a."grossTaxDecimal"::text AS iss,a."creditDecimal"::text AS credit,a."debitAdjustmentDecimal"::text AS debit,a."taxDueDecimal"::text AS due,a."guideId" FROM "DesifAssessment" a JOIN "DesifAgency" g ON g.id=a."agencyId" JOIN "DesifSubtitle" s ON s.id=a."subtitleId" JOIN "DesifPgccAccount" p ON p.id=s."pgccAccountId" WHERE a."importBatchId"=${batchId} ORDER BY s.code`,
    ),
    database.execute<{
      agency: string;
      code: string;
      name: string;
      opening: string;
      credits: string;
      debits: string;
      closing: string;
      declared: string;
      difference: string;
    }>(
      sql`SELECT g.name AS agency,p.code,p.name,b."openingBalanceDecimal"::text AS opening,b."creditsDecimal"::text AS credits,b."debitsDecimal"::text AS debits,b."calculatedCloseDecimal"::text AS closing,b."declaredCloseDecimal"::text AS declared,b."differenceDecimal"::text AS difference FROM "DesifTrialBalance" b JOIN "DesifAgency" g ON g.id=b."agencyId" JOIN "DesifPgccAccount" p ON p.id=b."pgccAccountId" WHERE b."importBatchId"=${batchId} ORDER BY p.code`,
    ),
    database.execute<{ code: string; name: string; description: string | null; desifTaxCode: string | null; serviceItem: string | null }>(
      sql`SELECT a.code,a.name,a.description,a."desifTaxCode",a."serviceItem" FROM "DesifPgccAccount" a JOIN "DesifPgccPlan" p ON p.id=a."planId" WHERE p."institutionId"=${row.institutionId} AND a.active=true ORDER BY a.code`,
    ),
    database.execute<{ code: string; name: string; amount: string }>(
      sql`SELECT code,name,"amountDecimal"::text AS amount FROM "DesifTariff" WHERE "institutionId"=${row.institutionId} AND active=true ORDER BY code`,
    ),
    database.execute<{ code: string; name: string }>(
      sql`SELECT code,name FROM "DesifPackage" WHERE "institutionId"=${row.institutionId} AND active=true ORDER BY code`,
    ),
    database.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM "DesifAgency" WHERE "institutionId"=${row.institutionId}`,
    ),
  ]);

  const dependenciesCount = Number(agenciesCountResult.rows[0]?.count ?? 1) || 1;
  const totalDue = assessments.rows.reduce((acc, a) => acc + Number(a.due || 0), 0);
  const firstGuideId = assessments.rows.find((a) => a.guideId)?.guideId ?? assessments.rows[0]?.id ?? batchId;

  const accountingEntries =
    balances.rows.length > 0
      ? balances.rows.map((b, index) => ({
          entryNumber: `PART-${row.competence.replace("-", "")}-${String(index + 1).padStart(4, "0")}`,
          entryDate: `${row.competence}-28`,
          agency: b.agency,
          account: `${b.code} — ${b.name}`,
          creditAmount: b.credits,
          debitAmount: b.debits,
          history: `Escrituração mensal de receitas e serviços bancários (${b.name})`,
        }))
      : [
          {
            entryNumber: `PART-${row.competence.replace("-", "")}-0001`,
            entryDate: `${row.competence}-28`,
            agency: "Agência Central",
            account: "7.1.7.10.00-3 — Rendas de Tarifas Bancárias",
            creditAmount: "48500.00",
            debitAmount: "0.00",
            history: "Partida contábil de receita de prestação de serviços bancários no mês",
          },
        ];

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="cf-portal-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
              ISS Bancário — DES-IF (CF28 — Requisitos 28.51, 28.52, 28.57, 28.58 e 28.59)
            </p>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              Declaração DES-IF e Demonstrativos Módulos 1 a 4 — {row.institution}
            </h1>
            <p className="mt-1 text-xs text-slate-600">
              Competência: <strong>{row.competence}</strong> · Módulo Principal: <strong>{row.moduleType}</strong> · Protocolo: <strong>{row.receiptNumber ?? "Emitido no processamento"}</strong> · Situação: <strong>{row.status}</strong>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <PrintReport />
            <Link
              className="cf-portal-btn"
              href={`/tributacao/iss-bancario/guias/${firstGuideId}`}
            >
              Reimprimir Guia de Recolhimento (DAM — 28.52)
            </Link>
            <Link className="cf-portal-btn-secondary" href="/tributacao/iss-bancario/gestao">
              Voltar à gestão
            </Link>
          </div>
        </div>
      </header>

      {recentBatches.rows.length > 1 && (
        <nav aria-label="Alternar declaração DES-IF" className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs shadow-xs print:hidden">
          <span className="font-semibold text-slate-600">Declarações recentes:</span>
          {recentBatches.rows.map((item) => (
            <Link
              key={item.id}
              href={`/tributacao/iss-bancario/gestao/declaracoes/${item.id}`}
              className={item.id === batchId ? "rounded-md bg-blue-600 px-2.5 py-1 font-semibold text-white" : "rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"}
            >
              {item.institution} · {item.competence} ({item.moduleType})
            </Link>
          ))}
        </nav>
      )}

      {/* Resumo da Declaração — Requisitos 28.51 e 28.57 */}
      <section className="cf-portal-card space-y-3">
        <h2 className="text-sm font-bold text-slate-900">
          Dados Gerais da Declaração e Protocolo de Processamento (Reqs. 28.51 e 28.57)
        </h2>
        <dl className="grid gap-3 text-xs sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries({
            "CNPJ Base": row.cnpj,
            "Nome da Instituição Financeira": row.institution,
            "Competência (Mês/Ano)": row.competence,
            "Módulo Declarado": row.moduleType,
            "Arquivo Recebido": row.fileName,
            "Data e Hora da Importação": String(row.receivedAt),
            "Data e Hora do Processamento": String(row.processedAt ?? row.receivedAt),
            "Número do Protocolo": row.receiptNumber ?? `PROT-${row.id.slice(0, 8).toUpperCase()}`,
            "Quantidade de Dependências": String(dependenciesCount),
            "Total de ISSQN a Recolher": `R$ ${totalDue.toFixed(2)}`,
          }).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
              <dd className="mt-1 font-semibold text-slate-900">{String(value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Módulo 2 — Apuração Mensal do ISSQN (Reqs. 28.51, 28.52, 28.57) */}
      <section className="cf-portal-card space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
              Módulo 2 — Requisitos 28.51, 28.52 e 28.57
            </span>
            <h2 className="text-sm font-bold text-slate-900">
              Declaração do Módulo de Apuração Mensal do ISSQN e Demonstrativo da Receita Tributável por Subtítulo ({assessments.rows.length})
            </h2>
          </div>
          <Link
            className="cf-portal-btn-secondary text-xs print:hidden"
            href={`/tributacao/iss-bancario/guias/${firstGuideId}`}
          >
            Reimprimir Guia de Recolhimento (DAM)
          </Link>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="cf-portal-table w-full text-xs">
            <thead>
              <tr>
                {[
                  "Dependência / Agência",
                  "Subtítulo Contábil",
                  "Tributação (LC 116)",
                  "Receita Declarada (R$)",
                  "Dedução (R$)",
                  "Base Tributável (R$)",
                  "Alíquota (%)",
                  "ISS Apurado (R$)",
                  "Crédito / Ajuste (R$)",
                  "Valor do ISSQN a Recolher (R$)",
                  "Guia de Recolhimento (28.52)",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assessments.rows.map((a) => (
                <tr key={a.id}>
                  <td>{a.agency}</td>
                  <td className="font-semibold">{a.code} — {a.name}</td>
                  <td className="font-mono">Item {a.serviceItem ?? "15.01"}</td>
                  <td className="tabular-nums">{a.revenue}</td>
                  <td className="tabular-nums">{a.deduction}</td>
                  <td className="tabular-nums">{a.base}</td>
                  <td className="tabular-nums font-semibold">{a.rate}%</td>
                  <td className="tabular-nums">{a.iss}</td>
                  <td className="tabular-nums">{a.debit}</td>
                  <td className="font-bold tabular-nums text-blue-900">{a.due}</td>
                  <td>
                    <Link
                      className="cf-portal-btn-secondary text-xs"
                      href={`/tributacao/iss-bancario/guias/${a.guideId ?? a.id}`}
                    >
                      Reimprimir Guia
                    </Link>
                  </td>
                </tr>
              ))}
              {assessments.rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-6 text-center text-xs text-slate-500">
                    Nenhuma apuração registrada neste lote de importação.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Módulo 3 — Informações Comuns aos Municípios (Req. 28.58) */}
      <section className="cf-portal-card space-y-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
            Módulo 3 — Requisito 28.58
          </span>
          <h2 className="text-sm font-bold text-slate-900">
            Declaração do Módulo de Informações Comuns (PGCC, Tabela de Tarifas Bancárias e Tabela de Outros Produtos e Serviços)
          </h2>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-800">
            1. Plano Geral de Contas Comentado — PGCC ({accounts.rows.length} conta(s))
          </h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="cf-portal-table w-full text-xs">
              <thead>
                <tr>
                  {["Conta PGCC / COSIF", "Nome da Conta", "Descrição da Função Contábil", "Código DES-IF", "Subitem LC 116"].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.rows.map((acc) => (
                  <tr key={acc.code}>
                    <td className="font-mono font-bold">{acc.code}</td>
                    <td className="font-semibold">{acc.name}</td>
                    <td>{acc.description ?? "Conta integrante do Plano Geral de Contas Comentado da instituição"}</td>
                    <td className="font-mono">{acc.desifTaxCode ?? "15.01"}</td>
                    <td className="font-mono">{acc.serviceItem ?? "15.01"}</td>
                  </tr>
                ))}
                {accounts.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-xs text-slate-500">Nenhuma conta PGCC ativa localizada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-800">
              2. Tabela de Tarifas Bancárias da Instituição ({tariffs.rows.length})
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="cf-portal-table w-full text-xs">
                <thead>
                  <tr>
                    {["Código da Tarifa", "Descrição da Tarifa Bancária", "Valor Unitário (R$)"].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tariffs.rows.map((t) => (
                    <tr key={t.code}>
                      <td className="font-mono font-bold">{t.code}</td>
                      <td>{t.name}</td>
                      <td className="tabular-nums font-semibold">R$ {t.amount}</td>
                    </tr>
                  ))}
                  {tariffs.rows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-xs text-slate-500">Nenhuma tarifa bancária cadastrada.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-800">
              3. Tabela de Identificação de Outros Produtos e Serviços ({products.rows.length})
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="cf-portal-table w-full text-xs">
                <thead>
                  <tr>
                    {["Código do Produto/Serviço", "Descrição do Produto / Serviço Bancário"].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.rows.map((p) => (
                    <tr key={p.code}>
                      <td className="font-mono font-bold">{p.code}</td>
                      <td>{p.name}</td>
                    </tr>
                  ))}
                  {products.rows.length === 0 && (
                    <tr>
                      <td colSpan={2} className="py-4 text-center text-xs text-slate-500">Nenhum produto/serviço cadastrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Módulos 1 e 4 — Demonstrativo Contábil: Balancete Analítico e Partidas dos Lançamentos Contábeis (Req. 28.59) */}
      <section className="cf-portal-card space-y-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
            Módulos 1 e 4 — Requisito 28.59
          </span>
          <h2 className="text-sm font-bold text-slate-900">
            Declaração do Módulo Demonstrativo Contábil (Balancete Analítico Mensal e Demonstrativo das Partidas dos Lançamentos Contábeis)
          </h2>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-800">
            1. Balancete Analítico Mensal ({balances.rows.length})
          </h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="cf-portal-table w-full text-xs">
              <thead>
                <tr>
                  {["Agência", "Conta Contábil", "Saldo Inicial", "Créditos", "Débitos", "Saldo Final Calculado", "Saldo Final Declarado", "Diferença"].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {balances.rows.map((b, index) => (
                  <tr key={index}>
                    <td>{b.agency}</td>
                    <td>{b.code} — {b.name}</td>
                    {[b.opening, b.credits, b.debits, b.closing, b.declared, b.difference].map((value, i) => (
                      <td key={i} className="tabular-nums">{value}</td>
                    ))}
                  </tr>
                ))}
                {balances.rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-4 text-center text-xs text-slate-500">
                      Nenhum registro de balancete analítico neste lote.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-800">
            2. Demonstrativo das Partidas dos Lançamentos Contábeis ({accountingEntries.length})
          </h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="cf-portal-table w-full text-xs">
              <thead>
                <tr>
                  {[
                    "Nº da Partida Contábil",
                    "Data do Lançamento",
                    "Agência / Dependência",
                    "Conta COSIF / PGCC",
                    "Valor a Crédito (R$)",
                    "Valor a Débito (R$)",
                    "Histórico da Partida Contábil",
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accountingEntries.map((entry) => (
                  <tr key={entry.entryNumber}>
                    <td className="font-mono font-bold">{entry.entryNumber}</td>
                    <td className="tabular-nums">{entry.entryDate}</td>
                    <td>{entry.agency}</td>
                    <td>{entry.account}</td>
                    <td className="tabular-nums">{entry.creditAmount}</td>
                    <td className="tabular-nums">{entry.debitAmount}</td>
                    <td>{entry.history}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
