import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listEsocialEvents } from "@/lib/sst/esocial-service";
import { esocialReference } from "@/lib/sst/esocial-contract";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { sstColumn } from "../_components/operational-columns";
import { SstNewLink } from "../_components/SstNewLink";
import { SstForm } from "../SstForm";
import { configureEventAction, prepareEventAction } from "./actions";

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ budgetUnitId?: string; page?: string; view?: string }> }) {
  const context = await getTenantContextForModule("SST");
  const params = await searchParams;
  const { units, records, total, page } = await listEsocialEvents(context, params.budgetUnitId, Number(params.page));
  if (params.view !== "manage") {
    const columns = [sstColumn("kind", "Evento", 120, 90), sstColumn("environment", "Ambiente", 160, 120), sstColumn("source", "Origem", 290, 150, "identifier"), sstColumn("missing", "Pendências", 120, 100, "text", "right"), sstColumn("status", "Situação", 130, 100, "status"), sstColumn("actions", "Ficha", 90, 80, "actions")];
    return <OperationalListFrame label="Integrações SST / eSocial" actions={<>{!!units.length && <SstNewLink href={`/sst/integracoes?${new URLSearchParams({ budgetUnitId: params.budgetUnitId || "", view: "manage" })}`}>Preparar e configurar</SstNewLink>}<Link href="/sst/consolidado" className={styles.filterButton}>Relatórios consolidados</Link></>}
      toolbar={<><OperationalFilters label="Unidade gestora" activeCount={Number(!!params.budgetUnitId)}><form method="GET" className={styles.filterFields}><label>UG<select name="budgetUnitId" defaultValue={params.budgetUnitId}><option value="">UGs clínicas autorizadas</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label><button className={styles.primaryButton}>Aplicar</button><Link href="/sst/integracoes">Limpar</Link></form></OperationalFilters><OperationalFilters label="Estado da integração"><p>Origem → preparação e pendências → assinatura XMLDSig → envio → consulta de protocolo → recibo/rejeição oficial.</p><p>A1 e adaptador real indisponíveis. Nenhum envio ou aceite homologado. Biometria depende do SDK/leitor real. Configurar referências não ativa um conector.</p><p>Leiaute fixado: {esocialReference.layout}. <a href={esocialReference.documentation}>Referência oficial</a></p></OperationalFilters></>}
      pagination={<OperationalLinkPagination page={page} total={total} pathname="/sst/integracoes" values={{ budgetUnitId: params.budgetUnitId }} />}>
      <OperationalTable columns={columns} preferenceId="sst-integracoes" caption="Preparações eSocial SST" emptyMessage="Nenhuma preparação encontrada." rows={records.map(record => ({ id: record.id, label: `${record.kind} ${record.sourceId}`, values: { kind: record.kind, environment: record.environment, source: record.sourceId, missing: String(record.missingFields.length), status: "Preparação" }, actions: <Link href={`/sst/integracoes/${record.id}`}>Abrir</Link> }))} />
    </OperationalListFrame>;
  }
  const scopes = <label>UG<select required name="budgetUnitId" className="block w-full rounded border p-2">{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>;
  const environment = <label>Ambiente<select name="environment" className="block w-full rounded border p-2"><option value="RESTRICTED">Produção restrita — testes</option><option value="PRODUCTION">Produção</option></select></label>;
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Integrações SST / eSocial</h1>
    <p>Origem → preparação e pendências → assinatura XMLDSig → envio → consulta de protocolo → recibo/rejeição oficial.</p>
    <p className="rounded border p-3" role="status">A1 e adaptador real indisponíveis. Nenhum envio ou aceite homologado. Biometria depende do SDK/leitor real. Configurar referências não ativa um conector.</p>
    <p className="text-sm">Leiaute fixado: {esocialReference.layout}. <a href={esocialReference.documentation} className="underline">Referência oficial</a> · <Link href="/sst/consolidado" className="underline">Relatórios consolidados</Link></p>
    <Link href={`/sst/integracoes?budgetUnitId=${encodeURIComponent(params.budgetUnitId || "")}`}>Voltar à listagem</Link>
    <form className="flex flex-wrap gap-2"><input type="hidden" name="view" value="manage" /><select aria-label="UG" name="budgetUnitId" defaultValue={params.budgetUnitId} className="rounded border p-2"><option value="">UGs clínicas autorizadas</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select><button className="rounded border p-2">Filtrar</button></form>
    {!!units.length && <details className="rounded border p-3"><summary>Preparar evento a partir da origem ocupacional</summary><SstForm action={prepareEventAction} redirectBase="/sst/integracoes" label="Validar origem e registrar preparação">{scopes}{environment}<label>Evento<select name="kind" className="block w-full rounded border p-2"><option value="S2220">ASO → S-2220</option><option value="S2210">CAT → S-2210</option><option value="S2240">Exposição histórica → S-2240</option></select></label><label>ID da origem<input required name="sourceId" className="block w-full rounded border p-2"/></label><p>O ID é resolvido no servidor e na UG selecionada. Códigos fiscais ausentes não serão inferidos dos nomes.</p></SstForm></details>}
    {!!units.length && <details className="rounded border p-3"><summary>Nova versão de configuração externa</summary><SstForm action={configureEventAction}>{scopes}{environment}<label>Inscrição do empregador<input name="employerRegistration" required className="block w-full rounded border p-2"/></label><label>Referência de credencial no provedor de segredos<input name="credentialReference" required placeholder="IBEMA_ESOCIAL_A1" className="block w-full rounded border p-2"/></label><label>Referência de provedor no servidor<input name="providerReference" required placeholder="IBEMA_ESOCIAL_PROVIDER" className="block w-full rounded border p-2"/></label><p>Informe somente identificadores. Chave privada, senha, PFX e tokens ficam no provedor externo de segredos.</p></SstForm></details>}
  </div>;
}
