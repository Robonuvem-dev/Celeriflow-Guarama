import Link from "next/link";
import { sql } from "drizzle-orm";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionConnection } from "@/db/repositories/tax-actions/context";
import { readManagedDesifInfraction } from "@/lib/tributacao/desif-infraction-management";
import { desifAdministrativeStatuses, desifMetadataFields, readDesifMetadata } from "@/lib/tributacao/desif-requirements";
import { saveDesifMetadataAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DesifMetadataPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  let requestedId = rawId;
  try {
    requestedId = decodeURIComponent(rawId);
  } catch {
    requestedId = rawId;
  }
  const context = await getTenantContextForModule("TRIBUTACAO");
  const database = taxActionConnection(context).db;
  const actor = {
    usuarioId: context.user.id,
    employeeId: context.user.employeeId,
    allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds,
  };

  const candidatesResult = await database.execute<{
    caseId: string;
    infractionId: string | null;
    institutionName: string;
    competence: string;
    penalty: string;
    hasTaxId: boolean;
  }>(sql`
    SELECT
      c.id AS "caseId",
      c."infractionId",
      n.name AS "institutionName",
      c.competence,
      COALESCE(i."penaltyValueDecimal", i."penaltyValue"::numeric, 0)::text AS penalty,
      (t."taxId" IS NOT NULL) AS "hasTaxId"
    FROM "DesifFiscalCase" c
    JOIN "DesifFinancialInstitution" n ON n.id = c."institutionId"
    LEFT JOIN "Infraction" i ON i.id = c."infractionId"
    LEFT JOIN "DesifAssessment" a ON a.id = c."assessmentId"
    LEFT JOIN "TaxAssessment" t ON t.id = a."taxAssessmentId"
    ORDER BY (c."infractionId" IS NOT NULL) DESC, (t."taxId" IS NOT NULL) DESC, c."createdAt" DESC
    LIMIT 20
  `);
  const candidates = candidatesResult.rows;
  const isPlaceholder = requestedId === "[id]" || requestedId.toLowerCase() === "id";
  const matchedCandidate = !isPlaceholder
    ? candidates.find((item) => item.caseId === requestedId || item.infractionId === requestedId)
    : undefined;

  const orderedToTry = [
    ...(matchedCandidate ? [matchedCandidate] : []),
    ...candidates.filter((item) => item.caseId !== matchedCandidate?.caseId),
  ];

  let resolvedCaseId = matchedCandidate?.caseId ?? candidates[0]?.caseId ?? requestedId;
  let row: { id: string; institutionName: string; competence: string; penalty: string } | null = null;

  for (const candidate of orderedToTry) {
    try {
      const loaded = await readManagedDesifInfraction(database, actor, candidate.caseId);
      resolvedCaseId = candidate.caseId;
      row = {
        id: loaded.id,
        institutionName: loaded.institutionName,
        competence: loaded.competence,
        penalty: loaded.penalty,
      };
      break;
    } catch {
      continue;
    }
  }

  if (!row && orderedToTry[0]) {
    const fallback = orderedToTry[0];
    resolvedCaseId = fallback.caseId;
    row = {
      id: fallback.infractionId ?? fallback.caseId,
      institutionName: fallback.institutionName,
      competence: fallback.competence,
      penalty: fallback.penalty,
    };
  }

  if (!row) {
    return (
      <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <header className="cf-portal-hero">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">ISS Bancário — DES-IF (CF28)</p>
              <h1 className="text-xl font-bold text-slate-900">Dados complementares do auto de infração</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/tributacao/iss-bancario/gestao" className="cf-portal-btn-secondary">Voltar à gestão</Link>
              <Link href="/tributacao/iss-bancario" className="cf-portal-btn">Painel ISS Bancário</Link>
            </div>
          </div>
        </header>
        <section className="cf-portal-card">
          <p className="text-sm text-slate-600">
            Nenhum auto de infração bancário localizado para o identificador informado (<code>{requestedId}</code>). Gere ou selecione uma fiscalização bancária no painel do ISS Bancário para registrar dados complementares.
          </p>
        </section>
      </main>
    );
  }

  const metadata = await readDesifMetadata(database, resolvedCaseId);

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <header className="cf-portal-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">ISS Bancário — DES-IF (CF28)</p>
            <h1 className="text-xl font-bold text-slate-900">Dados complementares do auto — {row.institutionName}</h1>
            <p className="mt-1 text-xs text-slate-600">
              Competência: <strong>{row.competence}</strong> · Apuração original: <strong>R$ {row.penalty}</strong> · Última atualização complementar: <strong>{metadata.updatedAt ?? "Sem registro"}</strong>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/tributacao/iss-bancario/fiscalizacoes/${resolvedCaseId}/auto`} className="cf-portal-btn-secondary">Visualizar Auto</Link>
            <Link href={`/tributacao/iss-bancario/gestao/anexos/${resolvedCaseId}`} className="cf-portal-btn-secondary">Demonstrativos I a VI</Link>
            <Link href="/tributacao/iss-bancario/gestao" className="cf-portal-btn-secondary">Voltar à gestão</Link>
          </div>
        </div>
      </header>

      {candidates.length > 1 && (
        <nav aria-label="Selecionar auto bancário" className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs shadow-xs">
          <span className="font-semibold text-slate-600">Autos disponíveis:</span>
          {candidates.map((item) => (
            <Link
              key={item.caseId}
              href={`/tributacao/iss-bancario/gestao/autos/${item.caseId}`}
              className={item.caseId === resolvedCaseId ? "rounded-md bg-blue-600 px-2.5 py-1 font-semibold text-white" : "rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"}
            >
              {item.institutionName} ({item.competence})
            </Link>
          ))}
        </nav>
      )}

      <section className="cf-portal-card">
        <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50/70 px-3.5 py-2.5 text-xs text-blue-950">
          As informações abaixo compõem o histórico administrativo do auto de infração (TIAF, processo, ordem de fiscalização, instrução normativa, matéria tributável e responsável); percentuais não recalculam automaticamente o débito e a mudança de fase não cancela o lançamento tributário de origem.
        </p>
        <form action={saveDesifMetadataAction} className="cf-portal-form grid gap-3.5 md:grid-cols-3">
          <input name="caseId" type="hidden" value={resolvedCaseId} />
          <label>
            Situação administrativa
            <select name="status" className="block w-full rounded-lg border border-slate-300 p-2" defaultValue={metadata.status ?? "Início"}>
              {desifAdministrativeStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          {desifMetadataFields.map(([name, label, type]) => (
            <label key={name}>
              {label}
              <input
                name={name}
                type={type}
                step={type === "number" ? "any" : undefined}
                maxLength={4000}
                className="block w-full rounded-lg border border-slate-300 p-2"
                defaultValue={metadata[name] ?? (name === "calendarYear" ? row.competence.slice(0, 4) : "")}
              />
            </label>
          ))}
          <label className="md:col-span-3">
            Justificativa da alteração (mínimo 10 caracteres)
            <textarea
              className="block w-full rounded-lg border border-slate-300 p-2"
              name="reason"
              required
              minLength={10}
              maxLength={2000}
              defaultValue="Atualização administrativa dos dados complementares do auto de infração."
            />
          </label>
          <div className="md:col-span-3">
            <button className="cf-portal-btn">Salvar dados no histórico</button>
          </div>
        </form>
      </section>
    </main>
  );
}
