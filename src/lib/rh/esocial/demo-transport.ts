import { accepted, type Batch, type DemoState, type Event, type Occurrence, type TotalizerType } from "./contract";
import { array, buildXml, parseDemoXml } from "./xml";

const roots: Record<TotalizerType, string> = { "S-5001": "evtBasesTrab", "S-5002": "evtIrrfBenef", "S-5003": "evtBasesFGTS", "S-5011": "evtCS", "S-5012": "evtIrrf", "S-5013": "evtFGTS" };
export function validateEvent(event: Event, rubrics: string[]): Occurrence[] {
  const issues: Occurrence[] = [];
  if (["S-1200", "S-1202"].includes(event.type) && !rubrics.includes(event.rubric)) issues.push({ tipo: 1, codigo: "DEMO-RUB-001", descricao: `Rubrica ${event.rubric} não cadastrada no cenário.`, localizacao: "/eSocial/evtRemun/itensRemun/codRubr", correctionUrl: "/rh/esocial?tab=validacao" });
  if (event.type === "S-1210" && !/^\d{4}-\d{2}$/.test(event.period)) issues.push({ tipo: 1, codigo: "DEMO-PER-001", descricao: "S-1210 exige competência mensal de pagamento, inclusive para 13º.", localizacao: "/ideEvento/perApur", correctionUrl: "/rh/esocial?tab=validacao" });
  if (event.warning) issues.push({ tipo: 2, codigo: "DEMO-CAD-001", descricao: "Conferir informação cadastral complementar; advertência não impeditiva.", localizacao: "/trabalhador", correctionUrl: event.sourceUrl });
  return issues;
}
export function eligibleTotalizers(event: Event, state: DemoState): { type: TotalizerType; value: number; base: number }[] {
  const a = event.amounts;
  if (event.type === "S-1200" && event.regime === "RGPS") return [{ type: "S-5001", value: a.cp, base: a.base }, { type: "S-5003", value: a.fgts, base: a.base }];
  if (event.type === "S-1210") return [{ type: "S-5002", value: a.irrf, base: a.base }];
  if (event.type !== "S-1299") return [];
  const current = state.totalizers.filter(t => { const e = state.events.find(e => e.id === t.eventId)!; return !e.alternative && e.revision === t.revision && accepted(e.status); });
  const sum = (type: TotalizerType) => current.filter(t => t.type === type).reduce((n, t) => n + t.value, 0);
  return [{ type: "S-5011", value: sum("S-5001"), base: 0 }, { type: "S-5012", value: sum("S-5002"), base: 0 }, { type: "S-5013", value: sum("S-5003"), base: 0 }];
}
/** Deliberately has no HTTP/client/certificate dependency. Never implements SST's REAL transport. */
export class DemoEsocialTransport {
  readonly mode = "DEMO";
  consultBatch(state: DemoState, batch: Batch, now: string): string {
    if (!batch.protocol) throw new Error("Consulta exige protocolo de recepção.");
    const pending = batch.queries === 0;
    return buildXml({ retornoProcessamentoLoteEventos: {
      status: { cdResposta: pending ? 101 : 201, descResposta: pending ? "Aguardando processamento (simulação)." : "Lote processado (simulação)." },
      dadosRecepcaoLote: { protocoloEnvio: batch.protocol },
      retornoEventos: pending ? {} : { evento: batch.eventIds.map(id => {
        const event = state.events.find(e => e.id === id)!, attempt = event.attempts.at(-1)!;
        const issues = validateEvent(event, state.rubrics), rejected = issues.some(i => i.tipo === 1), warning = issues.some(i => i.tipo === 2);
        const receipt = rejected ? null : `DEMO-REC-${state.generation}-${event.id}-${event.revision}`;
        return { "@_Id": event.id, "@_evtDupl": attempt.duplicated,
          retornoEvento: { processamento: { cdResposta: rejected ? 401 : warning ? 202 : 201, dhProcessamento: now }, ...(receipt ? { recibo: { nrRecibo: receipt } } : {}), ocorrencias: { ocorrencia: issues } },
          tot: rejected ? [] : eligibleTotalizers(event, state).map(t => ({ "@_tipo": t.type, eSocial: { "@_xmlns": "urn:celeriflow:esocial:demo:totalizador", [roots[t.type]]: { ideEvento: { nrRecArqBase: receipt, perApur: event.period }, ideTrabalhador: { matricula: event.registration || "" }, resumoDemonstrativo: { valorCentavos: t.value, baseCentavos: t.base }, referenciaSimulacao: { eventoOrigem: event.id, fonte: "SIMULATED", tipo: "RETORNO_NAO_TRANSMITIDO" } } } })) };
      }) },
    } });
  }
}
export class OfficialEsocialTransport {
  sendBatch(): never { throw new Error("Transporte oficial desativado. Esta implantação opera exclusivamente em DEMO."); }
  consultBatch(): never { throw new Error("Consulta governamental não configurada."); }
}
export function parseConsultation(xml: string, protocol: string) {
  const body = parseDemoXml(xml).retornoProcessamentoLoteEventos;
  if (!body || body.dadosRecepcaoLote?.protocoloEnvio !== protocol || ![101, 201, 202].includes(Number(body.status?.cdResposta))) throw new Error("Retorno incompatível com o protocolo de consulta.");
  return { code: Number(body.status.cdResposta), events: array<Record<string, any>>(body.retornoEventos?.evento) };
}
