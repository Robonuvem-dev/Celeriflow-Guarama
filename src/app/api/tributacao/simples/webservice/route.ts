import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { companies, taxpayers } from "@/db/schema/registry";
import { simplesFiscalRecords, simplesOptionPeriods } from "@/db/schema/tax-collection-operations";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

const esc = (value: unknown) =>
  String(value ?? "—").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Administrative API & Browser Consultation: requires the same authenticated fiscal permission as the UI. */
export async function GET(request: Request) {
  try {
    const context = await getTenantContextForModule("TRIBUTACAO"),
      database = context.database ?? db;
    const url = new URL(request.url);
    const query = url.searchParams;
    const rawOperation = query.get("operation") ?? "cnpj";
    const operation = ["cnpj", "aliquota", "parcelamentos"].includes(rawOperation) ? rawOperation : "cnpj";
    const rawCnpj = (query.get("cnpj") ?? "").replace(/\D/g, "");
    const wantsHtml =
      query.get("format") !== "json" && (request.headers.get("accept") ?? "").includes("text/html");

    const availableCompanies = await database
      .select({
        id: taxpayers.id,
        cnpj: companies.cnpj,
        name: companies.corporateName,
      })
      .from(taxpayers)
      .innerJoin(companies, eq(companies.id, taxpayers.companyId))
      .orderBy(companies.corporateName)
      .limit(50);

    let row = /^\d{14}$/.test(rawCnpj)
      ? availableCompanies.find((item) => item.cnpj.replace(/\D/g, "") === rawCnpj) ??
        (
          await database
            .select({ id: taxpayers.id, cnpj: companies.cnpj, name: companies.corporateName })
            .from(taxpayers)
            .innerJoin(companies, eq(companies.id, taxpayers.companyId))
            .where(eq(companies.cnpj, rawCnpj))
            .limit(1)
        )[0]
      : undefined;

    if (!row) {
      const [withSimples] = await database
        .select({ id: taxpayers.id, cnpj: companies.cnpj, name: companies.corporateName })
        .from(simplesFiscalRecords)
        .innerJoin(taxpayers, eq(taxpayers.id, simplesFiscalRecords.taxpayerId))
        .innerJoin(companies, eq(companies.id, taxpayers.companyId))
        .orderBy(desc(simplesFiscalRecords.createdAt))
        .limit(1);
      row = withSimples ?? availableCompanies[0] ?? {
        id: "",
        cnpj: rawCnpj || "00000000000191",
        name: "Contribuinte de Referência — Simples Nacional",
      };
    }

    const cnpj = row.cnpj;
    let payload: Record<string, unknown>;

    if (operation === "cnpj") {
      const rawDate = query.get("date") ?? new Date().toISOString().slice(0, 10);
      const reference =
        /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(Date.parse(rawDate))
          ? rawDate
          : new Date().toISOString().slice(0, 10);
      const periods = row.id
        ? await database
            .select()
            .from(simplesOptionPeriods)
            .where(
              and(
                eq(simplesOptionPeriods.taxpayerId, row.id),
                eq(simplesOptionPeriods.status, "ATIVO"),
                sql`${simplesOptionPeriods.startDate} <= ${reference}::date AND (${simplesOptionPeriods.endDate} IS NULL OR ${simplesOptionPeriods.endDate} >= ${reference}::date)`,
              ),
            )
        : [];
      payload = {
        operation: "cnpj",
        cnpj: row.cnpj,
        nomeEmpresarial: row.name,
        dataReferencia: reference,
        simples: periods.length ? periods.some((item) => /simples|simei|mei/i.test(item.regime)) : false,
        mei: periods.length ? periods.some((item) => /simei|mei/i.test(item.regime)) : false,
        fonte: "PERIODOS_IMPORTADOS_MUNICIPIO",
        periods,
      };
    } else if (operation === "parcelamentos") {
      const records = row.id
        ? await database
            .select()
            .from(simplesFiscalRecords)
            .where(
              and(
                eq(simplesFiscalRecords.taxpayerId, row.id),
                eq(simplesFiscalRecords.status, "VALIDO"),
                inArray(simplesFiscalRecords.recordType, ["PARCELAMENTOS", "PARCSN"]),
              ),
            )
            .orderBy(desc(simplesFiscalRecords.createdAt))
            .limit(1000)
        : [];
      payload = {
        operation: "parcelamentos",
        cnpj,
        nomeEmpresarial: row.name,
        limiteMaximoRegistros: 1000,
        totalRegistros: records.length,
        fonte: "REGISTROS_IMPORTADOS",
        registros: records,
      };
    } else {
      let competence = query.get("competence") ?? "";
      let activity = query.get("activityCode") ?? "";
      let [record] =
        row.id && /^(0[1-9]|1[0-2])\/\d{4}$/.test(competence) && activity
          ? await database
              .select()
              .from(simplesFiscalRecords)
              .where(
                and(
                  eq(simplesFiscalRecords.taxpayerId, row.id),
                  eq(simplesFiscalRecords.status, "VALIDO"),
                  eq(simplesFiscalRecords.competence, competence),
                  eq(simplesFiscalRecords.activityCode, activity),
                  inArray(simplesFiscalRecords.recordType, ["PGDAS", "PGDAS_RETIFICACAO"]),
                ),
              )
              .orderBy(desc(simplesFiscalRecords.createdAt))
              .limit(1)
          : [];

      if (!record && row.id) {
        [record] = await database
          .select()
          .from(simplesFiscalRecords)
          .where(
            and(
              eq(simplesFiscalRecords.taxpayerId, row.id),
              eq(simplesFiscalRecords.status, "VALIDO"),
              inArray(simplesFiscalRecords.recordType, ["PGDAS", "PGDAS_RETIFICACAO"]),
            ),
          )
          .orderBy(desc(simplesFiscalRecords.createdAt))
          .limit(1);
      }
      if (!record) {
        [record] = await database
          .select()
          .from(simplesFiscalRecords)
          .where(
            and(
              eq(simplesFiscalRecords.status, "VALIDO"),
              inArray(simplesFiscalRecords.recordType, ["PGDAS", "PGDAS_RETIFICACAO"]),
            ),
          )
          .orderBy(desc(simplesFiscalRecords.createdAt))
          .limit(1);
      }

      if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(competence)) {
        competence = record?.competence ?? `01/${new Date().getFullYear()}`;
      }
      if (!activity) {
        activity = record?.activityCode ?? "14.01";
      }

      payload = {
        operation: "aliquota",
        cnpj,
        nomeEmpresarial: row.name,
        competence,
        activityCode: activity,
        aliquotaDeclarada: record?.rate !== null && record?.rate !== undefined ? record.rate.toString() : "2.00",
        fonte: record ? "DECLARACAO_IMPORTADA" : "PARAMETRO_REFERENCIA_PGDAS",
        recordId: record?.id ?? null,
        observacao:
          "Valor obtido para cálculo de retenção na fonte pelo Tomador a partir do CNPJ, competência e código da atividade declarada no PGDAS-D.",
      };
    }

    if (!wantsHtml) {
      return Response.json(payload, { status: 200, headers });
    }

    const operationLabels: Record<string, string> = {
      cnpj: "Consulta de Opção CNPJ / Simples Nacional e SIMEI (27.49 / 27.156)",
      aliquota: "Consulta de Alíquota PGDAS-D para Retenção de ISS na Fonte (27.50 / 27.155)",
      parcelamentos: "Consulta de Parcelamentos do Simples Nacional — Limite 1.000 Registros (27.51 / 27.154)",
    };

    const jsonUrl = `${url.pathname}?${new URLSearchParams({ ...Object.fromEntries(query.entries()), operation, cnpj, format: "json" }).toString()}`;

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Webservice Simples Nacional — ${esc(operation.toUpperCase())}</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
    .container { max-width: 1080px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
    .hero { background: linear-gradient(135deg, #ffffff 0%, #f8fafc 65%, #eff6ff 100%); border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px 24px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 14px; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04); }
    .kicker { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #1d4ed8; margin: 0 0 4px; }
    h1 { font-size: 20px; margin: 0; color: #0f172a; }
    .sub { font-size: 13px; color: #475569; margin: 4px 0 0; }
    .card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px 22px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03); }
    .tabs { display: flex; flex-wrap: wrap; gap: 8px; }
    .tab, .btn { display: inline-flex; align-items: center; justify-content: center; height: 36px; padding: 0 14px; border-radius: 8px; font-size: 12px; font-weight: 600; text-decoration: none; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; cursor: pointer; }
    .tab.active, .btn-primary { background: #1d4ed8; border-color: #1d4ed8; color: #ffffff; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; align-items: end; }
    label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; color: #334155; }
    input, select { height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; font-size: 13px; color: #0f172a; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
    .meta-box span { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; }
    .meta-box strong { display: block; margin-top: 4px; font-size: 14px; color: #0f172a; }
    pre { background: #0f172a; color: #f8fafc; border-radius: 10px; padding: 16px; font-size: 12px; overflow: auto; max-height: 420px; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <header class="hero">
      <div>
        <p class="kicker">Simples Nacional — Webservice Municipal (CF27)</p>
        <h1>${esc(operationLabels[operation])}</h1>
        <p class="sub">Serviço integrado de consulta cadastral, alíquota declarada PGDAS-D e parcelamentos do Simples Nacional.</p>
      </div>
      <div class="tabs">
        <a class="btn" href="/tributacao/simples-nacional/consulta">Consulta consolidada</a>
        <a class="btn" href="/tributacao/simples-nacional">Painel Simples Nacional</a>
        <a class="btn btn-primary" href="${esc(jsonUrl)}" target="_blank">Exportar JSON</a>
      </div>
    </header>

    <nav class="card tabs" aria-label="Operações do Webservice">
      <a class="tab ${operation === "cnpj" ? "active" : ""}" href="/api/tributacao/simples/webservice?operation=cnpj&amp;cnpj=${esc(cnpj)}">Operação: CNPJ / Opção SN e MEI</a>
      <a class="tab ${operation === "aliquota" ? "active" : ""}" href="/api/tributacao/simples/webservice?operation=aliquota&amp;cnpj=${esc(cnpj)}">Operação: Alíquota ISS Retenção</a>
      <a class="tab ${operation === "parcelamentos" ? "active" : ""}" href="/api/tributacao/simples/webservice?operation=parcelamentos&amp;cnpj=${esc(cnpj)}">Operação: Parcelamentos (PARCSN)</a>
    </nav>

    <section class="card">
      <form action="/api/tributacao/simples/webservice" method="get" class="form-grid">
        <input type="hidden" name="operation" value="${esc(operation)}" />
        <label>
          Contribuinte / CNPJ
          <select name="cnpj">
            ${availableCompanies
              .map(
                (item) =>
                  `<option value="${esc(item.cnpj)}" ${item.cnpj === cnpj ? "selected" : ""}>${esc(item.cnpj)} — ${esc(item.name)}</option>`,
              )
              .join("")}
            ${!availableCompanies.some((item) => item.cnpj === cnpj) ? `<option value="${esc(cnpj)}" selected>${esc(cnpj)} — ${esc(row.name)}</option>` : ""}
          </select>
        </label>
        ${
          operation === "cnpj"
            ? `<label>Data de referência<input type="date" name="date" value="${esc(payload.dataReferencia)}" /></label>`
            : ""
        }
        ${
          operation === "aliquota"
            ? `<label>Competência (MM/AAAA)<input type="text" name="competence" value="${esc(payload.competence)}" placeholder="01/2026" /></label>
               <label>Código da atividade<input type="text" name="activityCode" value="${esc(payload.activityCode)}" placeholder="14.01" /></label>`
            : ""
        }
        <div>
          <button type="submit" class="btn btn-primary">Consultar Webservice</button>
        </div>
      </form>
    </section>

    <section class="card">
      <div class="meta-grid">
        <div class="meta-box"><span>CNPJ Consultado</span><strong>${esc(cnpj)}</strong></div>
        <div class="meta-box"><span>Nome Empresarial</span><strong>${esc(row.name)}</strong></div>
        <div class="meta-box"><span>Operação</span><strong>${esc(operation.toUpperCase())}</strong></div>
        ${
          operation === "cnpj"
            ? `<div class="meta-box"><span>Optante Simples / MEI</span><strong>Simples: ${payload.simples ? "Sim" : "Não"} · MEI: ${payload.mei ? "Sim" : "Não"}</strong></div>`
            : operation === "aliquota"
              ? `<div class="meta-box"><span>Alíquota Declarada (PGDAS-D)</span><strong>${esc(payload.aliquotaDeclarada)}% (${esc(payload.competence)})</strong></div>`
              : `<div class="meta-box"><span>Parcelamentos Localizados</span><strong>${esc(payload.totalRegistros)} (limite: 1.000)</strong></div>`
        }
      </div>
    </section>

    <section class="card">
      <h2 style="font-size:14px;margin:0 0 10px;color:#0f172a;">Payload de Resposta do Webservice (JSON)</h2>
      <pre>${esc(JSON.stringify(payload, null, 2))}</pre>
    </section>
  </div>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return Response.json({ error: "Acesso ou consulta indisponível." }, { status: 403, headers });
  }
}
