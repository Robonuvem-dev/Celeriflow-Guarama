import { Decimal } from "@/db/decimal";
import { preventionLabels } from "@/lib/sst/prevention-fields";
import { preventionKinds, type PreventionPayload } from "@/lib/sst/prevention-policy";
import type { MeetingArtifact } from "@/lib/sst/prevention-service";
const labels: Record<string, string> = { ...preventionLabels, formScope: "Escopo do formulário", answers: "Respostas", section: "Seção", key: "Chave", required: "Obrigatória", choices: "Opções", questions: "Perguntas", registrationStartsAt: "Início das inscrições", registrationEndsAt: "Fim das inscrições" };
function Content({ value, names, name = "" }: { value: unknown; names: Record<string, string>; name?: string }) {
  if (value === null || value === undefined || value === "") return <span>Não informado</span>;
  if (Array.isArray(value)) return <ol className="grid gap-3">{value.map((v, i) => <li key={i} className="rounded border p-3"><Content value={v} names={names} name={name} /></li>)}</ol>;
  if (typeof value === "object") return <dl className="grid gap-3">{Object.entries(value).filter(([k]) => !["kind", "attachments", "base64"].includes(k)).map(([k, v]) => <div key={k} className="break-words"><dt className="font-semibold">{labels[k] || k}</dt><dd className="whitespace-pre-wrap"><Content value={v} names={names} name={k} /></dd></div>)}</dl>;
  if (typeof value === "boolean") return <span>{value ? "Sim" : "Não"}</span>;
  if (typeof value === "string" && names[value]) return <span>{names[value]}</span>;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return <time dateTime={value}>{new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília)</time>;
  if (name === "cost") return <span>R$ {String(value).replace(".", ",")}</span>;
  const translations: Record<string, string> = { EMPLOYER: "Empregador", EMPLOYEE: "Empregado", ORDINARY: "Ordinária", EXTRAORDINARY: "Extraordinária", COLLECTIVE: "Coletiva", INDIVIDUAL: "Individual", RECHARGE: "Recarga", HYDROSTATIC_TEST: "Teste hidrostático", SST_OPERATIONAL_INSPECTION: "Inspeção operacional SST" };
  return <span>{translations[String(value)] || String(value)}</span>;
}
export function PreventionDocument({ title, payload, names, meeting }: { title: string; payload: PreventionPayload; names: Record<string, string>; meeting?: MeetingArtifact }) {
  const cost = payload.kind === "SIPAT" ? payload.activities.reduce((sum, a) => sum.plus(a.cost), new Decimal(0)).toFixed(2) : null;
  return <article className="space-y-5 rounded border bg-white p-5 text-sm text-slate-900"><h1 className="text-xl font-semibold">{title}</h1><h2>{preventionKinds[payload.kind]}</h2>{cost && <p className="font-semibold">Custo total da programação: R$ {cost.replace(".", ",")}</p>}<Content value={payload} names={names} />{meeting && <section className="space-y-3 border-t pt-4"><h2 className="text-lg font-semibold">Ata, presenças e adiamentos</h2><p>Data original: {new Date(meeting.originalAt).toLocaleString("pt-BR")}</p><p>Data vigente: {new Date(meeting.at).toLocaleString("pt-BR")}</p>{meeting.postponements.map((p, i) => <p key={i}>Adiado de {new Date(p.from).toLocaleString("pt-BR")} para {new Date(p.to).toLocaleString("pt-BR")}: {p.reason}</p>)}<ul>{meeting.participants.map(p => <li key={p.employeeId}>{p.name} — {p.function}: {p.present === null ? "Presença pendente" : p.present ? "Presente" : "Ausente"}</li>)}</ul><p className="whitespace-pre-wrap">{meeting.minutes || "Ata pendente."}</p></section>}</article>;
}
