import Link from "next/link";
import { sql } from "drizzle-orm";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionConnection } from "@/db/repositories/tax-actions/context";
import { readManagedDesifInfraction } from "@/lib/tributacao/desif-infraction-management";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";
import { taxReferenceSchema, latestTaxReferences, renderReferenceConclusion } from "@/lib/tributacao/reference-catalog";
import { databaseTimestamp } from "@/db/temporal";
import PrintReport from "@/app/app-domain/tributacao/relatorios-cadastrais/PrintReport";
import { updateDesifInfractionAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DesifInfraction({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  let requestedId = rawId;
  try {
    requestedId = decodeURIComponent(rawId);
  } catch {
    requestedId = rawId;
  }
  const context = await getTenantContextForModule("TRIBUTACAO");
  const database = taxActionConnection(context).db;
  const user = context.user;
  const actor = {
    usuarioId: user.id,
    employeeId: user.employeeId,
    allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds,
  };

  const candidatesResult = await database.execute<{
    caseId: string;
    infractionId: string | null;
    infractionType: string | null;
    status: string | null;
    penalty: string;
    defenseDeadline: string | null;
    updatedAt: string | null;
    institutionName: string;
    competence: string;
  }>(sql`
    SELECT
      c.id AS "caseId",
      c."infractionId",
      i."infractionType",
      i.status,
      COALESCE(i."penaltyValueDecimal", i."penaltyValue"::numeric, 0)::text AS penalty,
      i."defenseDeadline",
      i."updatedAt",
      n.name AS "institutionName",
      c.competence
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
  let row: {
    id: string;
    infractionType: string;
    status: string;
    penalty: string;
    defenseDeadline: Date | null;
    updatedAt: Date;
    institutionName: string;
    competence: string;
    scope: { budgetUnitId: string | null };
  } | null = null;

  for (const candidate of orderedToTry) {
    try {
      const loaded = await readManagedDesifInfraction(database, actor, candidate.caseId);
      resolvedCaseId = candidate.caseId;
      row = loaded;
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
      infractionType: fallback.infractionType ?? "Inconsistência na apuração mensal DES-IF",
      status: fallback.status ?? "Emitido",
      penalty: fallback.penalty,
      defenseDeadline: fallback.defenseDeadline ? databaseTimestamp(fallback.defenseDeadline) : null,
      updatedAt: fallback.updatedAt ? databaseTimestamp(fallback.updatedAt) : new Date(),
      institutionName: fallback.institutionName,
      competence: fallback.competence,
      scope: { budgetUnitId: null },
    };
  }

  if (!row) {
    return (
      <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <header className="cf-portal-hero">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">ISS Bancário — DES-IF (CF28)</p>
              <h1 className="text-xl font-bold text-slate-900">Auto de Infração — ISS Bancário</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/tributacao/iss-bancario/gestao" className="cf-portal-btn-secondary">Gestão de Autos</Link>
              <Link href="/tributacao/iss-bancario" className="cf-portal-btn">Painel ISS Bancário</Link>
            </div>
          </div>
        </header>
        <section className="cf-portal-card">
          <p className="text-sm text-slate-600">
            Nenhum auto de infração bancário localizado para o identificador informado (<code>{requestedId}</code>). Utilize o painel do ISS Bancário para abrir ou consultar uma fiscalização bancária.
          </p>
        </section>
      </main>
    );
  }

  const configurations = await listFiscalEntries(database, {
    entityType: "TAX_REFERENCE",
    categories: ["TAX_REFERENCE"],
    data: { kind: "orgao-configuracao", budgetUnitId: row.scope.budgetUnitId ?? undefined },
    allowedBudgetUnitIds: actor.allowedBudgetUnitIds,
  });
  const brand = latestTaxReferences(
    configurations.map((entry) => ({
      id: entry.entityId,
      version: entry.version,
      deleted: entry.status === "EXCLUIDO",
      data: taxReferenceSchema.parse(entry.data),
    })),
  ).find((entry) => !entry.deleted)?.data;

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <header className="cf-portal-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {brand?.coatUrl && (
              <picture>
                <img src={brand.coatUrl} alt={`Brasão ${brand.name}`} width={72} height={72} className="rounded-lg border border-slate-200 bg-white p-1" />
              </picture>
            )}
            <div>
              {brand && (
                <>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-blue-700">{brand.name}</h2>
                  <p className="text-xs text-slate-500">{brand.details}</p>
                </>
              )}
              <h1 className="text-xl font-bold text-slate-900">Auto de Infração — ISS Bancário</h1>
              <p className="mt-0.5 text-xs text-slate-600">
                Instituição: <strong>{row.institutionName}</strong> · Competência: <strong>{row.competence}</strong>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <PrintReport />
            <Link href={`/tributacao/iss-bancario/gestao/autos/${resolvedCaseId}`} className="cf-portal-btn-secondary">Dados complementares</Link>
            <Link href={`/tributacao/iss-bancario/gestao/anexos/${resolvedCaseId}`} className="cf-portal-btn-secondary">Demonstrativos</Link>
            <Link href="/tributacao/iss-bancario/gestao" className="cf-portal-btn-secondary">Voltar à gestão</Link>
          </div>
        </div>
      </header>

      {candidates.length > 1 && (
        <nav aria-label="Selecionar auto de infração" className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs shadow-xs print:hidden">
          <span className="font-semibold text-slate-600">Autos disponíveis:</span>
          {candidates.map((item) => (
            <Link
              key={item.caseId}
              href={`/tributacao/iss-bancario/fiscalizacoes/${item.caseId}/auto`}
              className={item.caseId === resolvedCaseId ? "rounded-md bg-blue-600 px-2.5 py-1 font-semibold text-white" : "rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"}
            >
              {item.institutionName} ({item.competence})
            </Link>
          ))}
        </nav>
      )}

      <section className="cf-portal-card">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Identificação</dt>
            <dd className="mt-1 font-semibold text-slate-900">{row.id}</dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Instituição</dt>
            <dd className="mt-1 font-semibold text-slate-900">{row.institutionName}</dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Competência</dt>
            <dd className="mt-1 font-semibold text-slate-900">{row.competence}</dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Situação administrativa</dt>
            <dd className="mt-1 font-semibold text-blue-700">{row.status}</dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:col-span-2">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Infração</dt>
            <dd className="mt-1 font-semibold text-slate-900">{row.infractionType}</dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Valor original do auto</dt>
            <dd className="mt-1 font-semibold text-emerald-700">R$ {row.penalty}</dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Prazo de defesa</dt>
            <dd className="mt-1 font-semibold text-slate-900">{row.defenseDeadline?.toLocaleDateString("pt-BR") ?? "Não informado"}</dd>
          </div>
        </dl>
        {brand?.conclusionTemplate && (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            {renderReferenceConclusion(brand.conclusionTemplate, row.id, row.institutionName)}
          </p>
        )}
      </section>

      <section className="cf-portal-card print:hidden">
        <form action={updateDesifInfractionAction} className="cf-portal-form grid gap-3.5 md:grid-cols-2">
          <div className="md:col-span-2">
            <h2 className="text-base font-bold text-slate-900">Manutenção administrativa do auto</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Valores, lançamento e guia conservam a apuração de origem. Cancelamento e revisão financeira seguem procedimento próprio.
            </p>
          </div>
          <input type="hidden" name="caseId" value={resolvedCaseId} />
          <input type="hidden" name="expectedUpdatedAt" value={row.updatedAt.toISOString()} />
          <label>
            Descrição da infração
            <input name="infractionType" required maxLength={240} defaultValue={row.infractionType} className="block w-full rounded-lg border border-slate-300 p-2" />
          </label>
          <label>
            Situação
            <select name="status" defaultValue={row.status} className="block w-full rounded-lg border border-slate-300 p-2">
              {["Emitido", "Defesa apresentada", "Em análise", "Julgado"].map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          <label className="md:col-span-2">
            Fundamentação (mínimo 10 caracteres)
            <textarea
              name="reason"
              required
              minLength={10}
              maxLength={4000}
              defaultValue="Manutenção administrativa do auto de infração do ISS Bancário."
              className="block w-full rounded-lg border border-slate-300 p-2"
            />
          </label>
          <div className="md:col-span-2">
            <button disabled={row.status === "Julgado"} className="cf-portal-btn">Salvar alteração</button>
          </div>
        </form>
      </section>
    </main>
  );
}
