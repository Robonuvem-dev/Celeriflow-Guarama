import Link from "next/link";
import { randomUUID } from "node:crypto";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { OperationForm } from "../operacoes/OperationForm";
import { db } from "@/db/client";
import { readPensionConfiguration } from "@/db/repositories/personnel-pages/catalog";

export const dynamic = "force-dynamic";
export default async function PayrollPensionsPage() {
  const context = await getTenantContextForModule("RH");
  const { sets, contracts } = await readPensionConfiguration(context.database ?? db);
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
    <ErpPageTitle title="Pensões alimentícias — configuração e cálculo" description="Beneficiário, processo, vigência, valor fixo/percentual, base e dedução fiscal explícitos." action={<Link href="/rh/parametrizacoes">Parametrizações</Link>} />
    <p className="rounded border bg-blue-50 p-3 text-xs">Configure os beneficiários e critérios conforme a decisão judicial. Escolha BRUTO, APOS_PREVIDENCIA ou APOS_IRRF. A base APOS_IRRF não permite dedução do próprio IRRF. A política abaixo substitui a lista inteira do conjunto.</p>
    {sets.map(set => {
      const model = { origin: "PENSOES_FOLHA", legalReference: "Informar decisão judicial e vigência", entries: [] };
      return <section key={set.id} className="rounded border bg-white p-3 text-xs"><h2 className="mb-2 font-semibold">{set.name} · {set.id}</h2>
        <OperationForm command="pensoes-configurar" title="Gravar lista de pensões deste conjunto" fields={[{ name: "ruleSetId", label: "Conjunto", type: "hidden", value: set.id }, { name: "requestKey", label: "Chave da alteração", value: randomUUID(), required: true }, { name: "policy", label: "Política e beneficiários (JSON)", type: "textarea", value: JSON.stringify(set.rules[0]?.value ?? model, null, 2), required: true }]} />
      </section>;
    })}
    <section className="rounded border bg-white p-3 text-xs"><h2 className="font-semibold">Contratos e identidades disponíveis para os modelos</h2>{contracts.map(contract => <p key={contract.id}>{contract.registration} · {contract.employee.name} · contrato {contract.id} · pessoa {contract.employee.personId || "sem vínculo central"}</p>)}</section>
    <form action="/api/rh/relatorios" className="flex flex-wrap gap-2 text-xs"><input type="hidden" name="kind" value="PENSOES" /><label>Competência <input name="competence" placeholder="10/2026" className="rounded border px-2 py-1" /></label><select name="format" className="rounded border px-2"><option>PDF</option><option>XLSX</option><option>CSV</option></select><button className="rounded border px-3 py-1">Emitir relação de descontos e beneficiários</button></form>
  </div>;
}
