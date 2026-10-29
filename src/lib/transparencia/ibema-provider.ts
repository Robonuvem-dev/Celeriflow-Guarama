import "server-only";
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import type { PublicCollection, PublicDataset, PublicRecord, PublicCell, TransparencyQuery } from "./query-contract";
import type { TransparencySettings } from "./presentation-settings";
const base = "http://transparencia.pibema.pr.gov.br:8087/portaltransparencia-api";
const cache = new Map<string, { expires: number; value: Promise<PublicDataset> }>();
type ExternalRow = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";
const cell = (value: unknown): PublicCell => typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null;
const money = (value: unknown) => value === null || value === undefined || value === "" ? null : new Decimal(String(value)).toFixed(2);
function normalizeRow(slug: string, row: ExternalRow, query: TransparencyQuery, entity: "prefeitura" | "camara", index: number): PublicRecord {
  const number = text(row.empenhoExercicio || row.displayLicitacao || row.noOrdem || row.noLiquidacao || row.matricula || row.receita || row.id || index);
  const values: PublicRecord["values"] = { number, date: cell(row.data), name: cell(row.nome || row.descricao), description: cell(row.historico || row.objeto || row.observacao), beneficiary: cell(row.nome || row.fornecedor), unit: cell(row.unidadeOrcamentaria || row.descricaoLotacao), sourceCode: cell(row.fonteRecurso), status: cell(row.situacao || row.tipoCancelamento), type: cell(row.natureza), value: money(row.valor ?? row.valorMaximo), committed: money(row.valorEmpenhado), canceled: money(row.valorAnulado), settled: money(row.valorLiquidado), withheld: money(row.valorRetido ?? row.retido), paid: money(row.valorPago), balance: money(row.valorAPagar ?? row.saldo), commitment: cell(row.empenhoExercicio), originalYear: cell(row.exercicio), modality: cell(row.descricao), process: cell(row.displayProcessoAdm || row.displayProtocolo), invoice: cell(row.notasFiscais) };
   if (slug === "receitas") Object.assign(values, { number: text(row.receita), name: cell(row.descricao), date: cell(row.data),stage:"Resumo analítico da API", value: money(row.valorArrecadado), predicted: money(row.valorPrevisto ?? row.valorOrcado), updated: money(row.valorOrcadoAtualizado ?? row.valorAtualizado), deduction: money(row.valorDeducao), type: cell(row.idTipoOperacaoReceita), sourceCode: cell(row.fonteRecurso) });
  if (slug === "servidores") {
     const financial = Array.isArray(row.dadosFinanceiros) ? row.dadosFinanceiros.filter((item): item is ExternalRow => Boolean(item) && typeof item === "object").filter(item => Number(item.anoCompetencia) === query.year&&(!query.filters.competence||`${String(item.mesCompetencia).padStart(2,"0")}/${item.anoCompetencia}`===query.filters.competence)).sort((a, b) => Number(b.mesCompetencia) - Number(a.mesCompetencia)) : [];
     Object.assign(values, { number: text(row.matricula), name: cell(row.nome), registration: cell(row.matricula), role: cell(row.descricaoCargo), unit: cell(row.descricaoLotacao), regime: cell(row.descricaoNatureza || row.vinculo), class: cell(row.descricaoClasse), weeklyHours: cell(row.horasSemanais), date: cell(row.dataAdmissao), terminationDate: cell(row.dataDemissao), status: cell(row.situacao), value: money(row.remuneracao ?? financial[0]?.vencimentos), competence: financial[0] ? `${String(financial[0].mesCompetencia).padStart(2, "0")}/${financial[0].anoCompetencia}` : null });
     values.competenceDate=financial[0]?`${query.year}-${String(financial[0].mesCompetencia).padStart(2,"0")}-01`:null;
  }
  if (slug === "licitacoes") Object.assign(values, { date: cell(row.dataPublicacao), modality: cell(row.descricao), type: cell(row.natureza), status: cell(row.tipoCancelamento), value: money(row.valorMaximo), openingDate: cell(row.dataAbertura), openingTime: cell(row.horarioAbertura), description: cell(row.objeto) });
  if (slug === "liquidacoes") Object.assign(values, { number: text(row.noLiquidacao), date: cell(row.dataLiquidacao || row.data), beneficiary: cell(row.fornecedor), value: money(row.valor), status: row.dataPagamento ? "Paga" : "A pagar" });
  if (slug === "pagamentos") Object.assign(values, { number: text(row.noOrdem || row.noLiquidacao), date: cell(row.dataPagamento), beneficiary: cell(row.fornecedor), value: money(row.valorParametro ?? row.valor), netPaid: null, status: "Paga", originalYear: cell(row.exercicio) });
  const natural = `${entity}:${slug}:${query.year}:${number}:${text(row.sequencia || row.codigoCalculo || row.fonteRecurso)}`;
  return { key: createHash("sha256").update(natural).digest("hex").slice(0, 40), entity, year: query.year, values, events: [], items: [], links: [] };
}
async function loadExternalRows(path: string, query: TransparencyQuery, externalCode: number, fetcher: typeof fetch) {
  const params = new URLSearchParams({ entidade: String(externalCode), exercicio: String(query.year), size: "500", page: "0" });
  if (path === "/empenhos/lista") {
    const clauses = [`id.exercicio=='${query.year}'`, `id.entidade=='${externalCode}'`];
    if (query.from) clauses.push(`data>='${query.from}'`); if (query.until) clauses.push(`data<='${query.until}'`);
    params.set("search", clauses.join(" and "));
   } else if(path!=="/api/servidores") { if (query.from) params.set("dataInicial", query.from); if (query.until) params.set("dataFinal", query.until); }
  const headers = { entidade: String(externalCode), exercicio: String(query.year), Accept: "application/json" };
  async function page(number: number) {
    params.set("page", String(number));
    // Validate Next.js options while retaining narrow types for native/Undici overloads.
    const options = { headers, signal: AbortSignal.timeout(15000), next: { revalidate: 300 } } satisfies RequestInit;
    const response = await fetcher(`${base}${path}?${params}`, options);
    if (!response.ok) throw new Error(`Fonte retornou HTTP ${response.status}.`);
    return response.json() as Promise<unknown>;
  }
  const first = await page(0);
   if (Array.isArray(first)) {
     if (first.length > 20000 || first.some(row => !row || typeof row !== "object" || Array.isArray(row))) throw new Error("Conjunto externo inválido ou amplo demais.");
     return first as ExternalRow[];
   }
  if (!first || typeof first !== "object") throw new Error("Formato de origem não reconhecido.");
  const body = first as { content?: ExternalRow[]; totalPages?: number; totalElements?: number };
  if (!Array.isArray(body.content) || !Number.isInteger(body.totalPages) || !Number.isInteger(body.totalElements)) throw new Error("Envelope paginado da origem inválido.");
  if (body.totalElements! > 20000 || body.totalPages! > 200) throw new Error("Consulta externa ampla demais. Restrinja o período para carregar o conjunto completo.");
  const records = [...body.content];
  for (let start = 1; start < body.totalPages!; start += 3) {
    const batch = await Promise.all(Array.from({ length: Math.min(3, body.totalPages! - start) }, (_, index) => page(start + index)));
    for (const item of batch) { const next = item as { content?: ExternalRow[]; totalElements?: number }; if (!Array.isArray(next.content) || next.totalElements !== body.totalElements) throw new Error("Fonte mudou durante a paginação. Consulte novamente."); records.push(...next.content); }
  }
  if (records.length !== body.totalElements) throw new Error("Fonte não entregou todos os registros da consulta.");
  return records;
}
export async function loadIbemaTransparencyDataset(collection: PublicCollection, query: TransparencyQuery, settings: TransparencySettings, fetcher: typeof fetch = fetch): Promise<PublicDataset> {
  const entities = settings.entities.filter(entity => entity.enabled && (query.entity === "consolidado" || entity.key === query.entity));
  if (!collection.apiPath || !entities.length || entities.some(entity => entity.externalCode === null)) return { records: [], source: "API_IBEMA", status: "UNAVAILABLE", updatedAt: null, provenance: "API pública de Ibema / Elotech", complete: false, message: !collection.apiPath ? "Esta consulta não está documentada na API pública examinada. Selecione uma fonte nativa, documental ou dados de exemplo." : "Código externo da entidade não confirmado/configurado. Selecione dados de exemplo para o cenário da Câmara/consolidado." };
   const key = JSON.stringify([collection.slug, query.entity, query.year, query.from, query.until,query.filters.competence, entities.map(entity => entity.externalCode)]);
  const stored = cache.get(key); if (fetcher === fetch && stored && stored.expires > Date.now()) return stored.value;
  const pending = (async (): Promise<PublicDataset> => {
    try {
      const records: PublicRecord[] = [];
      for (const entity of entities) {
        let external = await loadExternalRows(collection.apiPath!, query, entity.externalCode!, fetcher);
        if (collection.slug === "receitas") external = external.filter(row => row.aceitaMovimentacao === "S");
        records.push(...external.map((row, index) => normalizeRow(collection.slug, row, query, entity.key, index)));
      }
      if (new Set(records.map(record => record.key)).size !== records.length) throw new Error("Chaves de origem ambíguas; consulta não confirmada para exportação integral.");
      return { records, source: "API_IBEMA", status: "AVAILABLE", updatedAt: new Date().toISOString(), provenance: `Exemplos da API pública de Ibema / Elotech — entidade(s) ${entities.map(entity => entity.externalCode).join(", ")}. Data de coleta não equivale à atualização oficial.`, complete: true };
    } catch (error) { return { records: [], source: "API_IBEMA", status: "UNAVAILABLE", updatedAt: null, provenance: "API pública de Ibema / Elotech", complete: false, message: error instanceof Error ? error.message : "Fonte externa indisponível. Não há substituição silenciosa por dados fictícios." }; }
  })();
  if (fetcher === fetch) { if (cache.size >= 32) cache.delete(cache.keys().next().value!); cache.set(key, { expires: Date.now() + 300000, value: pending }); }
  return pending;
}
