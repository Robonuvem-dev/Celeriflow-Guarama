import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { readCat, readAccidentEvidence, readAccidentLedger, assertAccidentOperation } from "@/lib/sst/accident-service";
import { PrintCat } from "./PrintCat";
import Link from "next/link";
export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("SST"), { id } = await params;
  assertAccidentOperation(context, "issueReports");
  const cat = await readCat(context, id), evidence = await readAccidentEvidence(context, id, true), ledger = await readAccidentLedger(context, id);
  return <main className="mx-auto max-w-4xl space-y-5 bg-white p-6 text-black"><PrintCat /><h1 className="text-center text-xl font-bold">Comunicação e investigação de acidente de trabalho</h1>
    <p className="border p-2 text-sm">Relatório conjunto da comunicação e investigação. Protocolo interno: {id}. <Link href={`/sst/acidentes/${id}/imprimir/inss`} className="underline print:hidden">Abrir CAT no formulário original INSS</Link></p>
    <h2 className="font-bold">I — Identificação</h2><p>{cat.snapshot.unitName} · {cat.snapshot.employeeName} · Matrícula {cat.snapshot.registration} · Cargo {cat.snapshot.roleName}</p>
    <h2 className="font-bold">II — Comunicação</h2><dl>{Object.entries(cat.data).filter(([k]) => !["submissionKey","employeeId","budgetUnitId"].includes(k)).map(([k,v]) => <div className="mb-2 break-inside-avoid" key={k}><dt className="font-semibold">{k}</dt><dd className="whitespace-pre-wrap break-words">{typeof v === "string" ? v : JSON.stringify(v)}</dd></div>)}</dl>
    <h2 className="font-bold">III — Investigação, pareceres e atendimento</h2>{evidence.map(e => <section className="border-t py-3" key={e.id}><h3 className="font-semibold">{e.kind} · revisão {e.version}</h3><p>Registrado em {e.createdAt.toISOString()} · responsável {e.personId || e.createdById}</p><pre className="whitespace-pre-wrap break-words font-sans">{JSON.stringify(e.data, null, 2)}</pre></section>)}
    <h2 className="font-bold">IV — Despesas e reembolsos registrados</h2>{ledger.map(l => <p key={l.id}>{l.kind}: R$ {l.amount} — {l.description}</p>)}
    <p>Não constitui comprovante de pagamento nem recibo de transmissão eSocial.</p>
    <p className="pt-10">Assinatura dos responsáveis: __________________________________________________</p>
  </main>;
}
