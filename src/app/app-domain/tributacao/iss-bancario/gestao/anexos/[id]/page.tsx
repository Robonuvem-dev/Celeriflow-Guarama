import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import PrintReport from "@/app/app-domain/tributacao/relatorios-cadastrais/PrintReport";

export const dynamic = "force-dynamic";

export default async function DesifAnnexes({ params }: { params: Promise<{ id: string }> }) {
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
  const casesList = await database.execute<{ id: string; institutionId: string; institution: string; year: string }>(
    sql`SELECT c.id, c."institutionId", i.name AS institution, left(c.competence, 4) AS year FROM "DesifFiscalCase" c JOIN "DesifFinancialInstitution" i ON i.id = c."institutionId" ORDER BY c."createdAt" DESC LIMIT 20`,
  );

  let row: { id?: string; institutionId: string; institution: string; year: string } | undefined = !isPlaceholder
    ? casesList.rows.find((item) => item.id === requestedId || item.institutionId === requestedId)
    : undefined;

  if (!row && !isPlaceholder) {
    const direct = await database.execute<{ id: string; institutionId: string; institution: string; year: string }>(
      sql`SELECT c.id, c."institutionId", i.name AS institution, left(c.competence, 4) AS year FROM "DesifFiscalCase" c JOIN "DesifFinancialInstitution" i ON i.id = c."institutionId" WHERE c.id = ${requestedId} OR c."infractionId" = ${requestedId} OR c."institutionId" = ${requestedId} LIMIT 1`,
    );
    row = direct.rows[0];
  }

  if (!row) {
    row = casesList.rows[0];
  }

  if (!row) {
    const instFallback = await database.execute<{ institutionId: string; institution: string; year: string }>(
      sql`SELECT i.id AS "institutionId", i.name AS institution, COALESCE((SELECT left(a.competence, 4) FROM "DesifAssessment" a JOIN "DesifAgency" g ON g.id = a."agencyId" WHERE g."institutionId" = i.id ORDER BY a.competence DESC LIMIT 1), to_char(CURRENT_DATE, 'YYYY')) AS year FROM "DesifFinancialInstitution" i ORDER BY i.name ASC LIMIT 1`,
    );
    row = instFallback.rows[0] ?? {
      institutionId: "",
      institution: "Instituição Financeira",
      year: String(new Date().getFullYear()),
    };
  }

  const [monthly, annual] = row.institutionId
    ? await Promise.all([
        database.execute<{
          competence: string;
          account: string;
          accountName: string;
          subtitle: string;
          subtitleName: string;
          taxCode: string | null;
          item: string | null;
          rate: string;
          revenue: string;
          base: string;
          tax: string;
          credit: string;
          debit: string;
          due: string;
        }>(
          sql`SELECT a.competence,p.code AS account,p.name AS "accountName",s.code AS subtitle,s.name AS "subtitleName",p."desifTaxCode" AS "taxCode",COALESCE(s."serviceItem",p."serviceItem") AS item,a.rate::text,sum(a."revenueDecimal")::text AS revenue,sum(a."taxableBaseDecimal")::text AS base,sum(a."grossTaxDecimal")::text AS tax,sum(a."creditDecimal")::text AS credit,sum(a."debitAdjustmentDecimal")::text AS debit,sum(a."taxDueDecimal")::text AS due FROM "DesifAssessment" a JOIN "DesifAgency" g ON g.id=a."agencyId" JOIN "DesifSubtitle" s ON s.id=a."subtitleId" JOIN "DesifPgccAccount" p ON p.id=s."pgccAccountId" WHERE g."institutionId"=${row.institutionId} AND left(a.competence,4)=${row.year} GROUP BY a.competence,p.code,p.name,s.code,s.name,p."desifTaxCode",s."serviceItem",p."serviceItem",a.rate ORDER BY a.competence,p.code,s.code,a.rate`,
        ),
        database.execute<{ tax: string | null; credit: string | null; debit: string | null; due: string | null }>(
          sql`SELECT sum(a."grossTaxDecimal")::text AS tax,sum(a."creditDecimal")::text AS credit,sum(a."debitAdjustmentDecimal")::text AS debit,sum(a."taxDueDecimal")::text AS due FROM "DesifAssessment" a JOIN "DesifAgency" g ON g.id=a."agencyId" WHERE g."institutionId"=${row.institutionId} AND left(a.competence,4)=${row.year}`,
        ),
      ])
    : [{ rows: [] }, { rows: [{ tax: "0.00", credit: "0.00", debit: "0.00", due: "0.00" }] }];

  const total = annual.rows[0];

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <header className="cf-portal-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">ISS Bancário — DES-IF (CF28)</p>
            <h1 className="text-xl font-bold text-slate-900">Demonstrativos do ISS Bancário — {row.institution} / {row.year}</h1>
            <p className="mt-1 text-xs text-slate-600">
              Anexos I a VI de apuração mensal e anual de receitas, bases tributáveis, alíquotas, ajustes e enquadramentos PGCC / LC 116.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <PrintReport />
            <Link className="cf-portal-btn-secondary" href="/tributacao/iss-bancario/gestao">Voltar à gestão</Link>
            <Link className="cf-portal-btn-secondary" href="/tributacao/iss-bancario">Painel ISS Bancário</Link>
          </div>
        </div>
      </header>

      {casesList.rows.length > 1 && (
        <nav aria-label="Selecionar demonstrativo de fiscalização" className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs shadow-xs print:hidden">
          <span className="font-semibold text-slate-600">Fiscalizações disponíveis:</span>
          {casesList.rows.map((item) => (
            <Link
              key={item.id}
              href={`/tributacao/iss-bancario/gestao/anexos/${item.id}`}
              className={item.id === row?.id ? "rounded-md bg-blue-600 px-2.5 py-1 font-semibold text-white" : "rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"}
            >
              {item.institution} ({item.year})
            </Link>
          ))}
        </nav>
      )}

      <p className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2.5 text-xs text-blue-950">
        Dados efetivamente processados para a instituição e ano da fiscalização. Este demonstrativo não calcula correção, juros ou multa sem regra e valores individualizados; ajustes agregados não são apresentados como esses acréscimos legais.
      </p>

      <section className="cf-portal-card space-y-2">
        <h2 className="text-sm font-bold text-slate-900">I / II — Receita declarada, base tributável, alíquotas e imposto apurado por conta/subconta</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="cf-portal-table w-full text-sm">
            <thead>
              <tr>
                {["Competência", "Conta", "Subconta", "Receita", "Base", "Alíquota", "ISS apurado"].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthly.rows.map((a, index) => (
                <tr key={index}>
                  <td>{a.competence}</td>
                  <td>{a.account} — {a.accountName}</td>
                  <td>{a.subtitle} — {a.subtitleName}</td>
                  <td className="tabular-nums">{a.revenue}</td>
                  <td className="tabular-nums">{a.base}</td>
                  <td className="tabular-nums">{a.rate}%</td>
                  <td className="font-semibold tabular-nums">{a.tax}</td>
                </tr>
              ))}
              {monthly.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-xs text-slate-500">Nenhuma apuração mensal processada para o período selecionado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="cf-portal-card space-y-2">
        <h2 className="text-sm font-bold text-slate-900">III / IV — ISS original e ajustes registrados, mensal e anual</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="cf-portal-table w-full text-sm">
            <thead>
              <tr>
                {["Competência / conta / subconta", "ISS original", "Créditos", "Ajustes a débito", "A recolher"].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthly.rows.map((a, index) => (
                <tr key={index}>
                  <td>{a.competence} / {a.account} / {a.subtitle}</td>
                  <td className="tabular-nums">{a.tax}</td>
                  <td className="tabular-nums">{a.credit}</td>
                  <td className="tabular-nums">{a.debit}</td>
                  <td className="font-semibold tabular-nums">{a.due}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold">
                <td>Total anual</td>
                <td className="tabular-nums">{total?.tax ?? "Sem dados"}</td>
                <td className="tabular-nums">{total?.credit ?? "Sem dados"}</td>
                <td className="tabular-nums">{total?.debit ?? "Sem dados"}</td>
                <td className="tabular-nums">{total?.due ?? "Sem dados"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="cf-portal-card space-y-2">
        <h2 className="text-sm font-bold text-slate-900">V / VI — Enquadramentos de contas, códigos DES-IF e lista de serviços</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="cf-portal-table w-full text-sm">
            <thead>
              <tr>
                {["Conta/subconta", "Descrição", "Código tributação DES-IF cadastrado", "Item LC116 cadastrado", "Alíquota aplicada"].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthly.rows.map((a, index) => (
                <tr key={index}>
                  <td>{a.account} / {a.subtitle}</td>
                  <td>{a.subtitleName}</td>
                  <td>{a.taxCode ?? "Não informado"}</td>
                  <td>{a.item ?? "Não informado"}</td>
                  <td className="tabular-nums">{a.rate}%</td>
                </tr>
              ))}
              {monthly.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-xs text-slate-500">Nenhum enquadramento com movimento apurado no período selecionado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
