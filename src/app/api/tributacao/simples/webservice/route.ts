import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { companies, taxpayers } from "@/db/schema/registry";
import { simplesFiscalRecords, simplesOptionPeriods } from "@/db/schema/tax-collection-operations";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
/** Administrative API: requires the same authenticated fiscal permission as the UI. */
export async function GET(request: Request) {
  try {
    const context = await getTenantContextForModule("TRIBUTACAO"), database = context.database ?? db;
    const query = new URL(request.url).searchParams, cnpj = (query.get("cnpj") ?? "").replace(/\D/g, ""), operation = query.get("operation") ?? "cnpj";
    if (!/^\d{14}$/.test(cnpj) || !["cnpj", "aliquota", "parcelamentos"].includes(operation)) return Response.json({ error: "Informe CNPJ e operação válidos." }, { status: 400, headers });
    const [row] = await database.select({ id: taxpayers.id, cnpj: companies.cnpj, name: companies.corporateName }).from(taxpayers).innerJoin(companies, eq(companies.id, taxpayers.companyId)).where(eq(companies.cnpj, cnpj)).limit(1);
    if (!row) return Response.json({ error: "Contribuinte não cadastrado." }, { status: 404, headers });
    if (operation === "cnpj") {
      const reference = query.get("date") ?? new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(reference) || Number.isNaN(Date.parse(reference))) return Response.json({ error: "Data inválida." }, { status: 400, headers });
      const periods = await database.select().from(simplesOptionPeriods).where(and(eq(simplesOptionPeriods.taxpayerId, row.id), eq(simplesOptionPeriods.status, "ATIVO"), sql`${simplesOptionPeriods.startDate} <= ${reference}::date AND (${simplesOptionPeriods.endDate} IS NULL OR ${simplesOptionPeriods.endDate} >= ${reference}::date)`));
      return Response.json({ cnpj: row.cnpj, nomeEmpresarial: row.name, dataReferencia: reference, simples: periods.length ? periods.some(item => /simples|simei|mei/i.test(item.regime)) : null, mei: periods.length ? periods.some(item => /simei|mei/i.test(item.regime)) : null, fonte: "PERIODOS_IMPORTADOS_MUNICIPIO", periods }, { headers });
    }
    if (operation === "parcelamentos") {
      const records = await database.select().from(simplesFiscalRecords).where(and(eq(simplesFiscalRecords.taxpayerId, row.id), eq(simplesFiscalRecords.status, "VALIDO"), inArray(simplesFiscalRecords.recordType, ["PARCELAMENTOS", "PARCSN"]))).orderBy(desc(simplesFiscalRecords.createdAt)).limit(1001);
      if (records.length > 1000) return Response.json({ error: "Consulta excede 1.000 registros; utilize a consulta por ano-calendário." }, { status: 422, headers });
      return Response.json({ cnpj, fonte: "REGISTROS_IMPORTADOS", registros: records }, { headers });
    }
    const competence = query.get("competence") ?? "", activity = query.get("activityCode") ?? "";
    if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(competence) || !activity) return Response.json({ error: "Informe competência MM/AAAA e código da atividade." }, { status: 400, headers });
    const [record] = await database.select().from(simplesFiscalRecords).where(and(eq(simplesFiscalRecords.taxpayerId, row.id), eq(simplesFiscalRecords.status, "VALIDO"), eq(simplesFiscalRecords.competence, competence), eq(simplesFiscalRecords.activityCode, activity), inArray(simplesFiscalRecords.recordType, ["PGDAS", "PGDAS_RETIFICACAO"]))).orderBy(desc(simplesFiscalRecords.createdAt)).limit(1);
    if (!record || record.rate === null) return Response.json({ error: "Alíquota declarada não encontrada; não inferida automaticamente." }, { status: 404, headers });
    return Response.json({ cnpj, competence, activityCode: activity, aliquotaDeclarada: record.rate.toString(), fonte: "DECLARACAO_IMPORTADA", recordId: record.id, observacao: "Valor informado na declaração. A aplicabilidade à retenção deve observar a legislação e a operação." }, { headers });
  } catch { return Response.json({ error: "Acesso ou consulta indisponível." }, { status: 403, headers }); }
}
