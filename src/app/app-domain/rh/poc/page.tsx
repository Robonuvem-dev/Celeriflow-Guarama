import Link from "next/link";
import { randomUUID } from "node:crypto";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { readPocPage } from "@/db/repositories/personnel-pages/workforce";
import { RH_POC_CODE } from "@/lib/rh/poc-bootstrap";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { OperationForm } from "../operacoes/OperationForm";

export const dynamic = "force-dynamic";
export default async function RhPocPage({ searchParams }: { searchParams: Promise<{ competence?: string }> }) {
  const context = await getTenantContextForModule("RH");
  const value = (await searchParams).competence;
  const competence = value && /^(0[1-9]|1[0-2])\/2026$/.test(value) ? value : "10/2026";
  const { set, payrolls, contracts, sources } = await readPocPage(context.database ?? db, context.user, competence, RH_POC_CODE);
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
    <ErpPageTitle title="RH/Folha — demonstração documental POC" description="Modelos municipais, regras de referência e parâmetros estimados com memória persistida." action={<Link href="/rh/operacoes">Operações</Link>} />
    <p className="rounded border bg-blue-50 p-3 text-sm">Pacote versionado: três pessoas fictícias, referências salariais, RGPS/IRRF 2026 e nove tipos de folha. O modo OFICIAL permite fechar e publicar o cálculo dentro do escopo DEMONSTRAÇÃO.</p>
    <form className="flex gap-2 text-xs"><input name="competence" defaultValue={competence} className="rounded border px-2" aria-label="Competência MM/2026" /><button className="rounded border px-3 py-2">Selecionar competência</button></form>
    <OperationForm command="poc-parametros" title="Instalar parâmetros documentais de demonstração" fields={[]} />
    <OperationForm command="poc-preparar" title="Preparar base fictícia e nove folhas desta competência" fields={[{ name: "competence", label: "Competência", value: competence, required: true }]} />
    <Link href="/rh/pensoes" className="text-xs underline">Configurar pensões alimentícias e emitir relatório por beneficiário</Link>
    <details className="rounded border bg-white p-3 text-xs"><summary>Vincular primeira parcela/final/diferença do 13º</summary><p>Nas folhas 13º e Diferença 13º, acrescente sourceRunId ao JSON, mantendo previousAdvance em zero. A fonte precisa estar fechada, no mesmo ano e com os mesmos contratos. A diferença ligada recalcula apenas o acréscimo e as retenções acumuladas menos as anteriores.</p>{sources.map(source => <p key={source.id}>{source.payroll.type} · {source.payroll.competence} · sourceRunId: {source.id}</p>)}</details>
    <details className="rounded border bg-white p-3 text-xs"><summary>Vincular férias aos aquisitivos reservados</summary><p>Na folha Férias, acrescente vacationEntryIds ao JSON: um objeto com o ID de cada contrato e a lista dos IDs de suas reservas de gozo. Os dias são obtidos das reservas, que devem iniciar na competência. O fechamento concilia cada reserva uma única vez e aproveita o débito já existente no ledger.</p><pre className="whitespace-pre-wrap">{'"vacationEntryIds": { "ID_CONTRATO": ["ID_RESERVA"] }'}</pre></details>
    <form action="/api/rh/relatorios" className="flex flex-wrap gap-2 text-xs"><input type="hidden" name="kind" value="INFORME_ANUAL_POC" /><label>Ano dos pagamentos <input name="year" type="number" defaultValue={2026} min={1900} max={2200} className="rounded border px-2 py-1" /></label><select name="format" className="rounded border px-2"><option>PDF</option><option>XLSX</option><option>CSV</option></select><button className="rounded border px-3 py-1">Emitir informe anual modelo POC</button></form>
    <nav className="flex flex-wrap gap-3 text-xs underline"><Link href="/rh/parametrizacoes">Parâmetros e fundamentos</Link><Link href="/rh/operacoes?tab=direitos">Férias, licença-prêmio, ATS e provisões</Link><Link href="/rh/diarias">Solicitação, autorização e prestação de diárias</Link><Link href="/rh/consignacoes">Consignações</Link><Link href="/rh/esocial">eSocial</Link><Link href="/rh/recadastramento">Recadastramento</Link></nav>
    {contracts.length > 0 && <section className="rounded border bg-white p-3 text-xs"><h2 className="font-semibold">Titulares do pacote</h2>{contracts.map(contract => <p key={contract.id}>{contract.registration} · {contract.employee.name} · R$ {contract.salary.toFixed(2)} · {contract.monthlyHours}h mensais · contrato {contract.id}</p>)}</section>}
    {payrolls.map(payroll => <section key={payroll.id} className="rounded border bg-white p-3 text-xs">
      <h2 className="mb-2 font-semibold">{payroll.type} · {payroll.competence} · {payroll.status}</h2>
      <OperationForm command="calcular-poc" title={`Calcular ${payroll.type} com os titulares selecionados`} fields={[
        { name: "payrollId", label: "Folha", type: "hidden", value: payroll.id },
        { name: "requestKey", label: "Chave da execução", value: randomUUID(), required: true },
        { name: "contractIds", label: "Contratos (IDs separados por vírgula)", type: "textarea", value: contracts.map(contract => contract.id).join(","), required: true },
        { name: "mode", label: "Modo", value: "OFICIAL", options: [{ value: "SIMULACAO", label: "Simular isoladamente" }, { value: "OFICIAL", label: "Calcular para fechamento demonstrativo" }] },
        ...(payroll.type === "Mensal" ? [{ name: "monthlyProration", label: "Rateio por dias civis/vigências", value: "SIM", options: [{ value: "SIM", label: "Aplicar rateio civil POC" }, { value: "NAO", label: "Critério anterior /30" }] }] : []),
        ...(payroll.type === "Mensal" ? [] : [{ name: "parameters", label: "Parâmetros substituíveis (JSON)", type: "textarea", value: JSON.stringify({ days: 30, vacationDays: 30, average: "0.00", variableAmount: "150.00", previousAdvance: "0.00", advanceRate: 40, rraMonths: 6, rraAmount: "18000.00", reason: "Demonstração com referências documentais e valores estimados" }), required: true }]),
      ]} />
      <Link href={`/rh/operacoes?tab=calculos&payrollId=${payroll.id}`} className="mt-2 block underline">Conferir execuções, fechar, emitir recibos e publicar no Portal</Link>
      <div className="mt-2 flex gap-2">{["PDF", "XLSX", "CSV"].map(format => <Link key={format} href={`/api/rh/relatorios?kind=FOLHA&format=${format}&payrollId=${payroll.id}`} className="underline">Folha {format}</Link>)}</div>
      <div className="mt-2 flex gap-3"><Link href={`/api/rh/relatorios?kind=IRRF&format=XLSX&payrollId=${payroll.id}`} className="underline">Conferência IRRF XLSX</Link><Link href={`/api/rh/relatorios?kind=REMESSA_SALARIAL_POC&format=CSV&payrollId=${payroll.id}`} className="underline">Modelo de remessa salarial CSV</Link></div>
    </section>)}
    {set && <details className="rounded border bg-white p-3 text-xs"><summary>Referências, políticas e estimativas instaladas</summary>{set.rules.map(rule => <section key={rule.id} className="mt-3"><h3 className="font-semibold">{rule.code} · {rule.id}</h3><pre className="whitespace-pre-wrap break-words">{JSON.stringify(rule.value, null, 2)}</pre></section>)}</details>}
  </div>;
}
