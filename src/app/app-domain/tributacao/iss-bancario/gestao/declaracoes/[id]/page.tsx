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
  const [assessments, balances, accounts, tariffs, products] = await Promise.all([
    database.execute<{
      id: string;
      agency: string;
      code: string;
      name: string;
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
      sql`SELECT a.id,g.name AS agency,s.code,s.name,a."revenueDecimal"::text AS revenue,a."deductionDecimal"::text AS deduction,a."taxableBaseDecimal"::text AS base,a.rate::text,a."grossTaxDecimal"::text AS iss,a."creditDecimal"::text AS credit,a."debitAdjustmentDecimal"::text AS debit,a."taxDueDecimal"::text AS due,a."guideId" FROM "DesifAssessment" a JOIN "DesifAgency" g ON g.id=a."agencyId" JOIN "DesifSubtitle" s ON s.id=a."subtitleId" WHERE a."importBatchId"=${batchId} ORDER BY s.code`,
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
  ]);

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <header className="cf-portal-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">ISS Bancário — DES-IF (CF28)</p>
            <h1 className="text-xl font-bold text-slate-900">Declaração DES-IF — {row.institution}</h1>
            <p className="mt-1 text-xs text-slate-600">
              Competência: <strong>{row.competence}</strong> · Módulo: <strong>{row.moduleType}</strong> · Situação: <strong>{row.status}</strong>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <PrintReport />
            <Link className="cf-portal-btn-secondary" href="/tributacao/iss-bancario/gestao">Voltar à gestão</Link>
            <Link className="cf-portal-btn-secondary" href="/tributacao/iss-bancario">Painel ISS Bancário</Link>
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

      <section className="cf-portal-card">
        <dl className="grid gap-3 text-xs sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries({
            "CNPJ base": row.cnpj,
            Competência: row.competence,
            Módulo: row.moduleType,
            "Versão informada": row.abrasfVersion,
            Arquivo: row.fileName,
            Importação: row.receivedAt,
            Processamento: row.processedAt ?? "Não processada",
            Protocolo: row.receiptNumber ?? "Não emitido",
            Situação: row.status,
          }).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
              <dd className="mt-1 font-semibold text-slate-900">{String(value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="cf-portal-card space-y-2">
        <h2 className="text-sm font-bold text-slate-900">Apuração mensal por subtítulo ({assessments.rows.length})</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="cf-portal-table w-full text-sm">
            <thead>
              <tr>
                {["Agência", "Subtítulo", "Receita", "Dedução", "Base", "Alíquota", "ISS", "Crédito", "Débito", "A recolher", "Guia"].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assessments.rows.map((a) => (
                <tr key={a.id}>
                  <td>{a.agency}</td>
                  <td>{a.code} — {a.name}</td>
                  {[a.revenue, a.deduction, a.base, a.rate, a.iss, a.credit, a.debit, a.due].map((value, index) => (
                    <td key={index} className="tabular-nums">{value}</td>
                  ))}
                  <td>
                    {a.guideId ? (
                      <Link className="cf-portal-btn-secondary" href={`/tributacao/iss-bancario/guias/${a.guideId}`}>Reimprimir</Link>
                    ) : (
                      "Guia não emitida"
                    )}
                  </td>
                </tr>
              ))}
              {assessments.rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-6 text-center text-xs text-slate-500">Nenhuma apuração registrada neste lote de importação.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="cf-portal-card space-y-2">
        <h2 className="text-sm font-bold text-slate-900">Balancete analítico mensal ({balances.rows.length})</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="cf-portal-table w-full text-sm">
            <thead>
              <tr>
                {["Agência", "Conta", "Inicial", "Créditos", "Débitos", "Final calculado", "Final declarado", "Diferença"].map((label) => (
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
                  <td colSpan={8} className="py-6 text-center text-xs text-slate-500">Nenhum registro de balancete analítico neste lote.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="cf-portal-card space-y-3">
        <details className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <summary className="cursor-pointer text-xs font-bold text-slate-800">PGCC, tarifas e produtos vigentes cadastrados na instituição</summary>
          <p className="mt-1 text-xs text-slate-500">Consulta ao cadastro atual; estes dados não são apresentados como cópia histórica do arquivo recebido.</p>
          <pre className="mt-2 max-h-80 overflow-auto rounded border border-slate-200 bg-white p-3 text-xs whitespace-pre-wrap">
            {JSON.stringify({ pgcc: accounts.rows, tarifas: tariffs.rows, produtos: products.rows }, null, 2)}
          </pre>
        </details>
        <details open className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <summary className="cursor-pointer text-xs font-bold text-slate-800">Dados originais recebidos e inconsistências</summary>
          <p className="mt-1 text-xs text-slate-500">Conteúdo interno preservado; a versão declarada não comprova validação de todos os registros ABRASF 3.1.</p>
          <pre className="mt-2 max-h-96 overflow-auto rounded border border-slate-200 bg-white p-3 text-xs whitespace-pre-wrap">
            {JSON.stringify({ dados: row.payload, inconsistencias: row.inconsistencies }, null, 2)}
          </pre>
        </details>
      </section>
    </main>
  );
}
