import Link from "next/link";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import type { readBenefitStatement } from "@/lib/sst/benefit-query";
import { benefitFiscalReadiness } from "@/lib/sst/benefit-fiscal";
import { ExactDecimal } from "@/lib/sst/benefit-policy";
import type { Prisma } from "@prisma/client";

type Statement = NonNullable<Awaited<ReturnType<typeof readBenefitStatement>>>;
const text = (snapshot: Prisma.JsonValue, key: string) => snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) && typeof snapshot[key] === "string" ? String(snapshot[key]) : "—";
const pending = (snapshot: Prisma.JsonValue) => snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) && Array.isArray(snapshot.blockers) ? snapshot.blockers.filter((value) => typeof value === "string").join(" · ") : "Configuração não disponível";
export function BenefitStatement({ data, base }: { data: Statement; base: string }) {
  const fiscal = benefitFiscalReadiness(Number(data.to.split("/")[1]));
  const annual = new Map<string, { beneficiaryId: string; year: string; monthly: Prisma.Decimal; extraordinary: Prisma.Decimal; refunds: Prisma.Decimal }>();
  for (const row of data.summary) {
    const year = row.competence.split("/")[1];
    const key = `${row.beneficiaryId}:${year}`;
    const group = annual.get(key) ?? { beneficiaryId: row.beneficiaryId, year, monthly: new ExactDecimal(0), extraordinary: new ExactDecimal(0), refunds: new ExactDecimal(0) };
    group.monthly = group.monthly.plus(row.monthly); group.extraordinary = group.extraordinary.plus(row.extraordinary); group.refunds = group.refunds.plus(row.refunds);
    annual.set(key, group);
  }
  const name = (id: string) => { const person = data.beneficiaries.find((item) => item.id === id); return person ? `${person.dependentId ? "Dependente" : "Titular"}: ${text(person.snapshot, "beneficiaryName")}` : id; };
  const href = (page: number) => `${base}?${new URLSearchParams({ from: data.from, to: data.to, page: String(page) })}`;
  return <div className="space-y-4">
    <section className="rounded border p-4"><h2 className="font-semibold">Identificação e cobertura preservadas</h2>
      <p>{text(data.beneficiary.snapshot, "employeeName")} · matrícula {text(data.beneficiary.snapshot, "registration")}</p>
      <p>{text(data.beneficiary.snapshot, "beneficiaryName")} · {data.beneficiary.dependentId ? "Dependente" : "Titular"} · carteirinha {data.beneficiary.cardNumber}</p>
      <p>Adesão {data.beneficiary.admissionDate.toISOString().slice(0, 10)} · cobertura {data.beneficiary.startsAt.toISOString().slice(0, 10)} — {data.beneficiary.endsAt.toISOString().slice(0, 10)}</p>
      <p>Plano ANS {data.beneficiary.plan.ansPlanNumber} · operadora ANS {data.beneficiary.plan.ansOperatorNumber} · contrato {data.beneficiary.contractReference}</p>
      <p>Mensalidade contratual: R$ {data.beneficiary.monthlyAmount.toFixed(2)}</p>
    </section>
    <form className="flex flex-wrap items-end gap-3 print:hidden"><label>Competência inicial<input required name="from" defaultValue={data.from} pattern="(0[1-9]|1[0-2])/[0-9]{4}" className="block rounded border p-2"/></label><label>Competência final<input required name="to" defaultValue={data.to} pattern="(0[1-9]|1[0-2])/[0-9]{4}" className="block rounded border p-2"/></label><button className="rounded border p-2">Consultar período</button></form>
    <section className="space-y-3"><h2 className="font-semibold">Demonstrativo mensal por beneficiário — {data.from} a {data.to}</h2>
      <p className="text-sm">Cobranças e devoluções contratuais. Saldo líquido = mensalidades + despesas − devoluções. A postagem financeira é comprovada pelo vínculo da origem ao item de folha; pagamento fiscal exige evidência datada.</p>
      {!data.summary.length && <p>Nenhum lançamento no período.</p>}
      <div className="grid gap-3 sm:grid-cols-2">{data.summary.map((row) => <article className="min-w-0 rounded border p-3" key={`${row.beneficiaryId}:${row.competence}`}><h3 className="break-words font-semibold">{name(row.beneficiaryId)} · {row.competence}</h3><p>Mensalidades: R$ {row.monthly}</p><p>Extraordinárias: R$ {row.extraordinary}</p><p>Devoluções: R$ {row.refunds}</p><p className="font-semibold">Saldo: R$ {row.net}</p></article>)}</div>
    </section>
    <section className="space-y-3"><h2 className="font-semibold">Preparação anual de rendimentos — período selecionado</h2>
      {[...annual.values()].map((row) => <p className="break-words" key={`${row.beneficiaryId}:${row.year}`}>{name(row.beneficiaryId)} · ano {row.year} · mensalidades R$ {row.monthly.toFixed(2)} · despesas R$ {row.extraordinary.toFixed(2)} · devoluções R$ {row.refunds.toFixed(2)}</p>)}
      <p>{fiscal.explanation}</p><p>Saída fiscal bloqueada: {fiscal.blockers.join(" · ")}</p>
      <Link href={fiscal.sources.layouts} className="underline">RFB: leiautes por exercício</Link>{" · "}<Link href={fiscal.sources.obligation} className="underline">RFB: verificação da obrigação anual</Link>
      {" · "}<Link href={fiscal.sources.replacementFrom2025} className="underline">eSocial: substituição da DIRF desde 2025</Link>
    </section>
    <section className="space-y-3"><h2 className="font-semibold">Lançamentos e rastreabilidade (20 por página)</h2>
      {data.entries.map((entry) => { const origin = data.origins.find((row) => row.entryId === entry.id); return <article className="min-w-0 rounded border p-3" key={entry.id}><h3 className="break-words">{name(entry.beneficiaryId)} · {entry.competence} · {entry.kind} · R$ {entry.amount.toFixed(2)}</h3><p className="break-words">Origem {entry.sourceReference} · {entry.reason}</p><p className="break-all text-xs">ID: {entry.id}{entry.refundOfId && ` · cobrança devolvida: ${entry.refundOfId}`}</p>{origin ? <p className="break-all text-xs font-semibold">Postado: item {origin.payrollItemId} · folha {origin.payrollId} · {origin.status}</p> : <p className="break-words text-xs">Pendente de aprovação financeira. Validações na criação: {pending(entry.candidateSnapshot)}</p>}</article>; })}
      <ErpPagination page={data.page} pageSize={20} total={data.total} previousHref={href(Math.max(1, data.page - 1))} nextHref={href(Math.min(Math.max(1, Math.ceil(data.total / 20)), data.page + 1))} jumpTo={{ pathname: base, values: { from: data.from, to: data.to } }}/>
    </section>
  </div>;
}
