import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listEsocialEvents } from "@/lib/sst/esocial-service";
import { esocialReference } from "@/lib/sst/esocial-contract";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { SstForm } from "../SstForm";
import { configureEventAction, prepareEventAction } from "./actions";

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ budgetUnitId?: string; page?: string }> }) {
  const context = await getTenantContextForModule("SST");
  const params = await searchParams;
  const { units, records, total, page } = await listEsocialEvents(context, params.budgetUnitId, Number(params.page));
  const href = (value: number) => `/sst/integracoes?${new URLSearchParams({ budgetUnitId: params.budgetUnitId || "", page: String(value) })}`;
  const scopes = <label>UG<select required name="budgetUnitId" className="block w-full rounded border p-2">{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>;
  const environment = <label>Ambiente<select name="environment" className="block w-full rounded border p-2"><option value="RESTRICTED">Produção restrita — testes</option><option value="PRODUCTION">Produção</option></select></label>;
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Integrações SST / eSocial</h1>
    <p>Origem → preparação e pendências → assinatura XMLDSig → envio → consulta de protocolo → recibo/rejeição oficial.</p>
    <p className="rounded border p-3" role="status">A1 e adaptador real indisponíveis. Nenhum envio ou aceite homologado. Biometria depende do SDK/leitor real. Configurar referências não ativa um conector.</p>
    <p className="text-sm">Leiaute fixado: {esocialReference.layout}. <a href={esocialReference.documentation} className="underline">Referência oficial</a> · <Link href="/sst/consolidado" className="underline">Relatórios consolidados</Link></p>
    <form className="flex flex-wrap gap-2"><select name="budgetUnitId" defaultValue={params.budgetUnitId} className="rounded border p-2"><option value="">UGs clínicas autorizadas</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select><button className="rounded border p-2">Filtrar</button></form>
    {!!units.length && <details className="rounded border p-3"><summary>Preparar evento a partir da origem ocupacional</summary><SstForm action={prepareEventAction} redirectBase="/sst/integracoes" label="Validar origem e registrar preparação">{scopes}{environment}<label>Evento<select name="kind" className="block w-full rounded border p-2"><option value="S2220">ASO → S-2220</option><option value="S2210">CAT → S-2210</option><option value="S2240">Exposição histórica → S-2240</option></select></label><label>ID da origem<input required name="sourceId" className="block w-full rounded border p-2"/></label><p>O ID é resolvido no servidor e na UG selecionada. Códigos fiscais ausentes não serão inferidos dos nomes.</p></SstForm></details>}
    {!!units.length && <details className="rounded border p-3"><summary>Nova versão de configuração externa</summary><SstForm action={configureEventAction}>{scopes}{environment}<label>Inscrição do empregador<input name="employerRegistration" required className="block w-full rounded border p-2"/></label><label>Referência de credencial no provedor de segredos<input name="credentialReference" required placeholder="IBEMA_ESOCIAL_A1" className="block w-full rounded border p-2"/></label><label>Referência de provedor no servidor<input name="providerReference" required placeholder="IBEMA_ESOCIAL_PROVIDER" className="block w-full rounded border p-2"/></label><p>Informe somente identificadores. Chave privada, senha, PFX e tokens ficam no provedor externo de segredos.</p></SstForm></details>}
    <p>{total} preparação(ões) · 20 por página</p><table className="w-full table-fixed text-left text-sm"><thead><tr><th>Evento / ambiente</th><th>Origem</th><th>Pendências</th><th>Ficha</th></tr></thead><tbody>{records.map((record) => <tr key={record.id} className="border-b"><td className="break-words p-2">{record.kind}<br/>{record.environment}</td><td className="break-words p-2">{record.sourceId}</td><td className="p-2">{record.missingFields.length} · preparação</td><td className="p-2"><Link className="underline" href={`/sst/integracoes/${record.id}`}>Abrir</Link></td></tr>)}</tbody></table>
    <ErpPagination page={page} total={total} pageSize={20} previousHref={href(page - 1)} nextHref={href(page + 1)}/>
  </div>;
}
