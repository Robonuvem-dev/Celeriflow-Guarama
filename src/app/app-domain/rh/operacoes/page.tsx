import Link from "next/link";
import { randomUUID } from "node:crypto";
import type { Decimal } from "@/db/decimal";
import { db } from "@/db/client";
import { readWorkforceOperations } from "@/db/repositories/personnel-pages/workforce";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { RhRemoteTablePanel } from "../_components/RhRemoteTablePanel";
import { readPanelPage } from "../_components/read-panel-page";
import type { PanelRow } from "../_components/usePanelPage";
import type { WorkforceOperationsPage } from "@/lib/contracts/personnel-pages";
import { rhColumn } from "../_components/operational-columns";
import operationalStyles from "@/components/app-ui/operational/operational.module.css";
import { OperationForm, type OperationField } from "./OperationForm";
import { contractCustomFieldsPolicySchema, contractCustomFieldsPolicyHash, type ContractCustomFieldValues } from "@/lib/rh/contract-custom-fields";

export const dynamic = "force-dynamic";
type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] || "" : value || "";
const field = (name: string, label: string, value = "", type = "text", required = true): OperationField => {
  const references: Record<string, string> = { employeeId: "employee", personId: "person", contractId: "contract", sourceContractId: "contract", targetContractId: "contract", sourceBankRuleId: "rule", targetBankRuleId: "rule", bankRuleId: "rule", departmentId: "department", costCenterId: "center", payrollId: "payroll", ruleId: "rule" };
  return { name, label: name === "contractIds" ? "Contratos selecionados" : label.replace("ID do ", "").replace("ID ", ""), value, type: name === "contractIds" ? "contracts" : type === "text" && references[name] ? `lookup:${references[name]}` : type, required };
};
const money = (value: Decimal) => `R$ ${value.toFixed(2)}`;
function workforceTableRows({ contracts, movements, rights, runs, events }: WorkforceOperationsPage): PanelRow[] {
  return [
    ...contracts.map(row => ({ id: row.id, label: row.employee.name, values: { registration: row.registration, employee: row.employee.name, salary: money(row.salary), status: row.status, version: String(row.version) }, links: [{ href: `/rh/operacoes?tab=contratos&id=${row.id}`, label: "Alterar" }, { href: `/rh/operacoes/contratos/${row.id}`, label: "Histórico" }] })),
    ...movements.map(row => ({ id: row.id, label: row.rubricCode, values: { registration: row.contract.registration, rubric: row.rubricCode, amount: money(row.amount), source: row.sourceKey, notes: row.notes } })),
    ...rights.map(row => ({ id: row.id, label: row.kind, values: { registration: row.contract.registration, kind: row.kind, quantity: row.quantity.toString(), amount: money(row.amount), id: row.id, source: row.sourceKey } })),
    ...runs.map(row => ({ id: row.id, label: row.payroll.competence, values: { competence: row.payroll.competence, mode: row.mode, net: money(row.net), status: row.status }, links: [{ href: `/rh/operacoes/calculos/${row.id}`, label: "Conferir memória e demonstrativos" }] })),
    ...events.map(row => ({ id: row.id, label: row.eventType, values: { domain: row.domain, type: row.eventType, status: row.status, environment: row.environment, source: row.sourceKey, hash: row.payloadHash } })),
  ];
}

export default async function WorkforcePage({ searchParams }: { searchParams: Promise<Params> }) {
  const context = await getTenantContextForModule("RH");
  const params = await searchParams;
  const tab = ["contratos", "movimentos", "direitos", "calculos", "integracoes"].includes(first(params.tab)) ? first(params.tab) : "contratos";
  const q = first(params.q).trim();
  const customCode = first(params.customCode).trim();
  const customValue = first(params.customValue).trim();
  const customType = first(params.customType) === "BOOLEANO" ? "BOOLEANO" : "TEXTO";
  const customFilterError = customCode && (!/^[A-Z][A-Z0-9_]{0,63}$/.test(customCode) || (customType === "BOOLEANO" && !["true", "false"].includes(customValue))) ? "Informe código válido e valor booleano true/false quando aplicável." : "";
  const tableInput = { tab, q, customCode, customValue, customType, customFilterError, payrollId: first(params.payrollId), id: first(params.id), page: first(params.page) };
  const initialData = await readWorkforceOperations(context.database ?? db, context.user, tableInput);
  const { total, page, selected, regimes, roles } = initialData;
  async function loadTablePage(requestedPage: number) {
    "use server";
    return readPanelPage(async () => {
      const current = await getTenantContextForModule("RH");
      const data = await readWorkforceOperations(current.database ?? db, current.user, { ...tableInput, page: String(requestedPage) });
      return { rows: workforceTableRows(data), total: data.total, page: data.page };
    });
  }
  const pagingValues = { tab, q, customCode, customValue, customType, payrollId: first(params.payrollId), id: first(params.id) };
  const columns = tab === "contratos"
    ? [rhColumn("registration", "Matrícula", 140, 90, "identifier"), rhColumn("employee", "Servidor", 260, 140), rhColumn("salary", "Salário", 150, 100, "text", "right"), rhColumn("status", "Situação", 130, 90, "status"), rhColumn("version", "Versão", 80, 65), rhColumn("actions", "Ficha", 170, 150, "actions")]
    : tab === "movimentos"
      ? [rhColumn("registration", "Matrícula", 140, 90, "identifier"), rhColumn("rubric", "Rubrica", 130, 90), rhColumn("amount", "Valor", 150, 100, "text", "right"), rhColumn("source", "Origem", 240, 110, "identifier"), rhColumn("notes", "Observação", 300, 140)]
      : tab === "direitos"
        ? [rhColumn("registration", "Matrícula", 130, 90, "identifier"), rhColumn("kind", "Direito", 160, 100), rhColumn("quantity", "Quantidade", 110, 80, "text", "right"), rhColumn("amount", "Valor", 140, 100, "text", "right"), rhColumn("id", "ID", 220, 110, "identifier"), rhColumn("source", "Origem", 240, 110, "identifier")]
        : tab === "calculos"
          ? [rhColumn("competence", "Competência", 160, 100), rhColumn("mode", "Modo", 150, 90), rhColumn("net", "Líquido", 170, 110, "text", "right"), rhColumn("status", "Situação", 150, 90, "status"), rhColumn("actions", "Memória", 290, 270, "actions")]
          : [rhColumn("domain", "Domínio", 130, 90), rhColumn("type", "Evento", 200, 110), rhColumn("status", "Situação", 130, 90, "status"), rhColumn("environment", "Ambiente", 130, 90), rhColumn("source", "Origem", 240, 110, "identifier"), rhColumn("hash", "Hash do payload", 260, 120, "identifier")];
  const customPolicyErrors: string[] = [];
  const customPolicies = Object.fromEntries(regimes.flatMap(regime => {
    const rule = regime.ruleSet.rules[0];
    if (!rule) return [];
    const parsed = contractCustomFieldsPolicySchema.safeParse(rule.value);
    if (!parsed.success) { customPolicyErrors.push(regime.name); return []; }
    const policy = parsed.data;
    return [[regime.id, { policy, hash: contractCustomFieldsPolicyHash(policy) }]];
  }));
  const customValues = (selected?.details as { customFields?: ContractCustomFieldValues } | undefined)?.customFields || {};
  const dt = (value: Date | null | undefined) => value?.toISOString().slice(0, 10) || "";
  const contractFields: OperationField[] = [field("id", "ID", selected?.id, "hidden", false), field("version", "Versão", selected?.version.toString(), "hidden", false), field("employeeId", "ID do servidor (Cadastro funcional)", selected?.employeeId), field("registration", "Matrícula do contrato", selected?.registration), { ...field("regimeId", "Regime", selected?.regimeId), options: [{ value: "", label: "Selecione" }, ...regimes.map(r => ({ value: r.id, label: `${r.name} · ${r.ruleSet.scope}` }))] }, { ...field("roleId", "Cargo", selected?.roleId), options: [{ value: "", label: "Selecione" }, ...roles.map(r => ({ value: r.id, label: r.name }))] }, field("departmentId", "ID do departamento", selected?.departmentId || "", "text", false), field("costCenterId", "ID do centro de custo", selected?.costCenterId || "", "text", false), field("workLocation", "Local de trabalho", selected?.workLocation), field("salaryLevel", "Nível salarial", selected?.salaryLevel || "", "text", false), field("admittedAt", "Admissão", dt(selected?.admittedAt), "date"), field("appointedAt", "Nomeação", dt(selected?.appointedAt), "date", false), field("swornAt", "Posse", dt(selected?.swornAt), "date", false), field("endsAt", "Término", dt(selected?.endsAt), "date", false), field("monthlyHours", "Jornada mensal", selected?.monthlyHours.toString() || "220", "number"), field("salary", "Salário (decimal)", selected?.salary.toFixed(2) || "0.00", "number"), field("details", "Informações adicionais (JSON)", JSON.stringify(selected?.details || {}), "textarea"), field("reason", "Motivo / ato", "", "textarea")];
  if (selected) contractFields.push(field("effectiveFrom", "Vigência da alteração (AAAA-MM-DD)", "", "date"));
  return <div className="flex h-full min-h-0 flex-1 flex-col gap-2 p-3">
    <ErpPageTitle title="Operações de RH e Folha" description="Contratos, movimentos, saldos, cálculos rastreáveis e integrações pendentes de configuração." action={<Link href="/rh/esocial">Preparação eSocial</Link>} />
    <nav className="flex flex-wrap gap-2 text-xs">{["contratos", "movimentos", "direitos", "calculos", "integracoes"].map(value => <Link key={value} href={`/rh/operacoes?tab=${value}`} className={`rounded border px-3 py-2 ${tab === value ? "bg-blue-100" : "bg-white"}`}>{value}</Link>)}</nav>
    <Link href="/rh/solicitacoes" className="text-xs underline">Analisar solicitações do Portal</Link>
    <Link href="/rh/poc" className="text-xs underline">Preparar e executar demonstração documental POC — nove tipos de folha</Link>
    <Link href="/rh/operacoes/medias" className="text-xs underline">Médias e seleção das maiores remunerações</Link>
    <Link href="/rh/recadastramento" className="text-xs underline">Campanhas e pendências de recadastramento</Link>
    <Link href="/rh/consignacoes" className="text-xs underline">Contratos, reservas e parcelas de consignação</Link>
    <Link href="/rh/quadro-cargos" className="text-xs underline">Quadro de cargos, vagas autorizadas e níveis salariais</Link>
    <Link href="/rh/ocorrencias" className="text-xs underline">Ocorrências funcionais, atos e anexos GED</Link>
    {customPolicyErrors.length > 0 && <p role="alert" className="rounded border border-amber-300 p-2 text-xs">Política de campos configuráveis inválida nos regimes: {customPolicyErrors.join(", ")}. Corrija a regra CAMPOS_CONTRATO em <Link href="/rh/parametrizacoes" className="underline">Parametrizações</Link> antes de salvar contratos nesses regimes.</p>}
    {customFilterError && <p role="alert" className="text-xs text-red-700">{customFilterError}</p>}
    {tab === "contratos" && <form className="flex flex-wrap gap-2 text-xs"><input type="hidden" name="tab" value="contratos" /><input type="hidden" name="q" value={q} /><input name="customCode" defaultValue={customCode} placeholder="Código do campo configurável" className="h-8 rounded border px-2" /><input name="customValue" defaultValue={customValue} placeholder="Valor exato" className="h-8 rounded border px-2" /><select name="customType" defaultValue={customType} className="rounded border px-2"><option value="TEXTO">Texto, número, data ou opção</option><option value="BOOLEANO">Booleano (true / false)</option></select><button className="rounded border px-3">Filtrar campo configurável</button></form>}
    {tab === "direitos" && <OperationForm command="ponto-banco-horas" title="Reconhecer créditos/débitos do ponto no banco de horas" fields={[field("contractId", "Contrato de alocação"), field("ruleId", "Política JSON de banco de horas"), field("competence", "Competência MM/AAAA")]} />}
    {tab === "direitos" && <OperationForm command="estornar-banco-horas" title="Estorno compensatório de banco de horas" fields={[field("entryId", "ID da entrada original"), field("reason", "Fundamento / motivo", "", "textarea")]} />}
    {tab === "direitos" && <OperationForm command="ferias-multiplos" title="Gozo conjunto com vários aquisitivos" fields={[field("sourceKey", "Chave estável do grupo", randomUUID()), field("contractId", "Contrato"), field("start", "Início do gozo", "", "date"), field("allocations", "Aquisitivos e dias (JSON)", '[{"periodStart":"2024-01-01","periodEnd":"2024-12-31","days":15},{"periodStart":"2025-01-01","periodEnd":"2025-12-31","days":15}]', "textarea"), field("reason", "Fundamento / ato", "", "textarea")]} />}
    {tab === "direitos" && <OperationForm command="cancelar-ferias-multiplos" title="Cancelar integralmente gozo de vários aquisitivos" fields={[field("groupSourceKey", "Origem completa FERIAS:MULTIPLOS:..."), field("reason", "Fundamento / motivo", "", "textarea")]} />}
    {tab === "direitos" && <OperationForm command="licenca-adquirir" title="Apurar aquisitivos de licença-prêmio" fields={[field("contractId", "Contrato"), field("ruleId", "Regra JSON LICENCA_PREMIO"), field("through", "Apurar até", "", "date")]} />}
    {tab === "direitos" && <OperationForm command="licenca-reservar" title="Reservar gozo ou pecúnia de licença-prêmio" fields={[field("contractId", "Contrato"), field("ruleId", "Regra JSON LICENCA_PREMIO"), field("sourceKey", "Chave estável", randomUUID()), field("periodStart", "Início aquisitivo", "", "date"), field("periodEnd", "Fim aquisitivo", "", "date"), field("start", "Início do gozo / referência pecúnia", "", "date"), field("days", "Dias", "15", "number"), field("kind", "GOZO ou PECUNIA", "GOZO"), field("reason", "Ato / fundamento", "", "textarea")]} />}
    {tab === "direitos" && <OperationForm command="licenca-cancelar" title="Cancelar reserva futura de licença-prêmio" fields={[field("entryId", "ID da reserva"), field("reason", "Ato / fundamento", "", "textarea")]} />}
    {tab === "direitos" && <OperationForm command="averbar-tempo" title="Averbar tempo anterior para ATS" fields={[field("contractId", "Contrato"), field("sourceKey", "Chave estável", randomUUID()), field("start", "Início anterior", "", "date"), field("end", "Fim anterior", "", "date"), field("recognizedDays", "Dias reconhecidos", "30", "number"), field("scope", "Escopo", "DEMONSTRACAO"), field("reason", "Ato / fundamento", "", "textarea")]} />}
    {tab === "direitos" && <OperationForm command="apurar-ats" title="Apurar ATS por tempo e salário temporal" fields={[field("contractId", "Contrato"), field("payrollId", "Folha mensal aberta"), field("ruleId", "Regra JSON ATS")]} />}
    {tab === "direitos" && <OperationForm command="estornar-averbacao" title="Estornar averbação de tempo anterior" fields={[field("entryId", "ID da averbação original"), field("reason", "Ato / fundamento", "", "textarea")]} />}
    {tab === "direitos" && <OperationForm command="estornar-ats" title="Estorno compensatório de ATS" fields={[field("originalSourceKey", "Origem ATS:contrato:competência"), field("reason", "Ato / fundamento", "", "textarea")]} />}
    {tab === "direitos" && <OperationForm command="provisionar" title="Apropriar provisões mensais" fields={[field("runId", "Cálculo mensal oficial fechado"), field("ruleId", "Regra JSON PROVISOES_FOLHA")]} />}
    {tab === "direitos" && <OperationForm command="contabilizar-provisao" title="Contabilizar férias/13º e encargos provisionados" fields={[field("entryId", "Apropriação original do ledger de provisões"), field("budgetUnitId", "Unidade gestora"), field("expenseAccountId", "Conta analítica de VPD da remuneração"), field("liabilityAccountId", "Conta analítica do passivo da remuneração"), { name: "employerExpenseAccountId", label: "VPD dos encargos (quando houver)" }, { name: "employerLiabilityAccountId", label: "Passivo dos encargos (quando houver)" }, field("date", "Último dia da competência", "", "date"), field("reason", "Fundamento da classificação", "", "textarea")]} />}
    {tab === "direitos" && <OperationForm command="estornar-provisao" title="Estorno compensatório de provisão" fields={[field("entryId", "ID da apropriação"), field("reason", "Ato / fundamento", "", "textarea")]} />}
    {tab === "direitos" && <OperationForm command="baixar-provisao-empenho" title="Baixar provisões contra empenho nativo" fields={[field("sourceKey", "Chave estável", randomUUID()), field("commitmentId", "ID do empenho originado da folha"), field("allocations", "Apropriações e valores (JSON)", '[{"entryId":"ID_APROPRIACAO","amount":"100.00"}]', "textarea"), field("reason", "Fundamento / conciliação", "", "textarea")]} />}
    {tab === "direitos" && <OperationForm command="estornar-baixa-provisao" title="Devolver provisão de empenho integralmente anulado" fields={[field("originalSourceKey", "Origem PROVISAO:BAIXA:..."), field("reason", "Fundamento", "", "textarea")]} />}
    {tab === "direitos" && <OperationForm command="expirar-banco-horas" title="Apurar/baixar lotes vencidos de banco de horas" fields={[field("employeeId", "Identidade funcional (Employee)"), field("ruleId", "Regra JSON BANCO_HORAS_EXPIRACAO"), field("through", "Apurar em", "", "date"), field("mode", "PREVIA ou APLICAR", "PREVIA")]} />}
    {tab === "direitos" && <OperationForm command="transferir-banco-horas" title="Transferir horas entre vínculos do mesmo titular" fields={[field("sourceKey", "Chave estável da transferência", randomUUID()), field("sourceContractId", "Contrato de origem"), field("targetContractId", "Contrato de destino"), field("ruleId", "Política JSON de transferência"), field("sourceBankRuleId", "Política de banco na origem"), field("targetBankRuleId", "Política de banco no destino"), field("date", "Data efetiva", "", "date"), field("hours", "Horas positivas (até quatro casas)", "", "text"), field("reason", "Fundamento / ato autorizador", "", "textarea")]} />}
    {tab === "direitos" && <OperationForm command="estornar-transferencia-horas" title="Estornar transferência de banco de horas" fields={[field("transferSourceKey", "Origem completa BANCO_HORAS:TRANSFERENCIA:..."), field("reason", "Fundamento / motivo", "", "textarea")]} />}
    {tab === "direitos" && <OperationForm command="pagar-banco-horas" title="Converter banco de horas em provento da folha mensal" fields={[field("sourceKey", "Chave estável da conversão", randomUUID()), field("contractId", "Contrato"), field("payrollId", "Folha Mensal aberta"), field("ruleId", "Política BANCO_HORAS_PAGAMENTO"), field("bankRuleId", "Política de banco de horas"), field("hours", "Horas positivas (até quatro casas)", "", "text"), field("reason", "Fundamento / ato autorizador", "", "textarea")]} />}
    {tab === "direitos" && <OperationForm command="estornar-pagamento-horas" title="Estornar conversão em folha aberta" fields={[field("conversionSourceKey", "Origem completa BANCO_HORAS:PAGAMENTO:..."), field("reason", "Fundamento / motivo", "", "textarea")]} />}
    {tab === "contratos" && <OperationForm command="contratos-coletivos" title="Alteração coletiva de dados funcionais com prévia" fields={[field("batchKey", "Chave estável do lote", randomUUID()), field("contractIds", "Contratos"), field("effectiveFrom", "Vigência", "", "date"), field("reason", "Fundamento / ato", "", "textarea"), field("changes", "Campos e valores (JSON): local, cargo, regime, centro, departamento, nível, salário, jornada ou término", '{"workLocation":"Novo local"}', "textarea"), { ...field("mode", "Operação"), options: [{ value: "PREVIA", label: "Conferir prévia" }, { value: "APLICAR", label: "Aplicar lote" }] }, field("previewHash", "Hash da prévia conferida", "", "text", false)]} />}
    <form action="/api/rh/relatorios" className="flex flex-wrap gap-2 text-xs">
      <select name="kind" className="rounded border px-2"><option value="RESUMO_CONTABIL">Resumo por rubrica/regime/centro/local</option><option value="PREVIDENCIA">Bases, segurado, patronal e FGTS</option><option value="IRRF">IRRF: renda, deduções, redução e imposto alocado</option><option value="REMESSA_SALARIAL_POC">Modelo de remessa salarial POC (contas fictícias)</option><option value="CONTRATOS_MULTIPLOS">Servidores com múltiplos contratos</option><option value="SERVIDORES_ATIVOS">Relação de servidores ativos (referência Ibema)</option><option value="QUANTIDADE_SERVIDORES">Quantidade de pessoas e vínculos ativos</option></select>
      <input name="q" placeholder="Nome/matrícula (opcional)" className="h-8 rounded border px-2" />
      <input name="competence" placeholder="MM/AAAA (opcional)" className="h-8 rounded border px-2" />
      <label className="flex items-center gap-1">Referência dos ativos <input name="referenceDate" type="date" className="h-8 rounded border px-2" /></label>
      <select name="format" className="rounded border px-2"><option>XLSX</option><option>CSV</option><option>PDF</option></select><button className="rounded border px-3">Exportar relatório integral</button>
    </form>
    {["contratos", "direitos", "calculos"].includes(tab) && <div className="flex gap-2 text-xs"><span>{tab === "calculos" ? "Exportar oficiais fechadas:" : "Exportar filtro integral:"}</span>{["CSV", "XLSX", "PDF"].map(format => {
      const args = new URLSearchParams({ kind: tab === "contratos" ? "CONTRATOS" : tab === "direitos" ? "DIREITOS" : "FOLHA", format, q: tab === "calculos" ? "" : q });
      if (tab === "contratos" && customCode) { args.set("customCode", customCode); args.set("customValue", customValue); args.set("customType", customType); }
      if (tab === "calculos" && /^(0[1-9]|1[0-2])\/\d{4}$/.test(q)) args.set("competence", q);
      if (tab === "calculos" && first(params.payrollId)) args.set("payrollId", first(params.payrollId));
      return <Link key={format} href={`/api/rh/relatorios?${args}`} className="underline">{format}</Link>;
    })}</div>}
    {tab === "contratos" && <><OperationForm key={`${selected?.id || "new"}:${selected?.version || 0}`} command="contrato" title={selected ? "Salvar revisão do contrato" : "Cadastrar contrato"} fields={contractFields} customPolicies={customPolicies} customValues={customValues} /><OperationForm command="vincular" title="Vincular servidor à pessoa física existente" fields={[field("employeeId", "ID servidor"), field("personId", "ID pessoa física")]} /></>}
    {tab === "contratos" && <OperationForm command="reajustar" title="Reajuste salarial coletivo com prévia" fields={[field("batchKey", "Chave estável do lote", randomUUID()), field("contractIds", "Contratos"), field("effectiveFrom", "Vigência", "", "date"), field("rate", "Percentual assinado (ex.: 5 ou -2)", "0"), field("reason", "Ato / fundamento", "", "textarea"), { ...field("mode", "Operação"), options: [{ value: "PREVIA", label: "Conferir prévia" }, { value: "APLICAR", label: "Aplicar lote" }] }, field("previewHash", "Hash da prévia conferida", "", "text", false)]} />}
    {tab === "movimentos" && <OperationForm command="movimento" title="Registrar movimento fixo/variável" fields={[field("contractId", "ID contrato"), field("sourceKey", "Chave única da origem", randomUUID()), field("rubricCode", "Código da rubrica"), field("startsAt", "Início", "", "date"), field("endsAt", "Fim", "", "date", false), field("amount", "Valor (BRL)", "0.00", "number"), field("reference", "Referência", "", "text", false), field("notes", "Observação / ato", "", "textarea")]} />}
    {tab === "movimentos" && <OperationForm command="importar" title="Validar / importar lote CSV de verbas fixas ou variáveis" fields={[field("batchKey", "Identificador estável do lote", randomUUID()), { ...field("mode", "Operação"), options: [{ value: "PREVIA", label: "Validar sem gravar" }, { value: "APLICAR", label: "Aplicar lote inteiro" }] }, field("csv", "CSV com cabeçalho e datas AAAA-MM-DD", "matricula;rubrica;valor;inicio;fim;referencia;observacao\n", "textarea")]} />}
    {tab === "movimentos" && <OperationForm command="beneficio" title="Calcular VT/VA pela regra e direito do servidor" fields={[field("contractId", "Contrato"), field("ruleId", "Regra JSON de benefício"), field("competence", "Competência MM/AAAA")]} />}
    {tab === "movimentos" && <OperationForm command="ponto-horas-extras" title="Gerar horas extras reconhecidas no ponto" fields={[field("contractId", "Contrato de alocação"), field("ruleId", "Regra JSON de horas extras"), field("competence", "Competência MM/AAAA")]} />}
    {tab === "direitos" && <OperationForm command="direito" title="Registrar aquisição, baixa ou compensação" fields={[field("contractId", "ID contrato"), field("sourceKey", "Chave única da origem", randomUUID()), { ...field("kind", "Direito"), options: ["FERIAS", "LICENCA_PREMIO", "ATS", "BANCO_HORAS", "PROVISAO_FERIAS", "PROVISAO_13", "PROVISAO_LICENCA"].map(value => ({ value, label: value })) }, field("periodStart", "Período início", "", "date"), field("periodEnd", "Período fim", "", "date"), field("quantity", "Quantidade assinada", "0", "number"), field("amount", "Valor assinado", "0.00", "number"), field("details", "Origem e justificativa (JSON)", "{}", "textarea")]} />}
    {tab === "direitos" && <OperationForm command="aquisitivos" title="Gerar aquisitivos de férias pela política" fields={[field("contractId", "Contrato"), field("asOf", "Data de referência", new Date().toISOString().slice(0, 10), "date")]} />}
    {tab === "direitos" && <OperationForm command="reservar-ferias" title="Programar gozo ou pecúnia de férias" fields={[field("contractId", "Contrato"), field("sourceKey", "Chave da solicitação", randomUUID()), field("periodStart", "Aquisitivo início", "", "date"), field("periodEnd", "Aquisitivo fim", "", "date"), { ...field("kind", "Modalidade"), options: ["GOZO", "PECUNIA"].map(value => ({ value, label: value })) }, field("start", "Data de início", "", "date"), field("days", "Dias", "15", "number"), field("reason", "Ato / autorização", "", "textarea")]} />}
    {tab === "direitos" && <OperationForm command="cancelar-ferias" title="Cancelar reserva futura e restaurar saldo" fields={[field("entryId", "ID da reserva de gozo"), field("reason", "Motivo do cancelamento", "", "textarea")]} />}
    {tab === "calculos" && <OperationForm command="calcular" title="Calcular seleção de contratos" fields={[field("payrollId", "ID folha", first(params.payrollId)), field("requestKey", "Chave da solicitação", randomUUID()), field("contractIds", "IDs de contratos separados por vírgula", "", "textarea"), { ...field("mode", "Modo"), options: ["SIMULACAO", "OFICIAL"].map(value => ({ value, label: value })) }, { ...field("scope", "Escopo"), options: ["DEMONSTRACAO", "HOMOLOGACAO", "PRODUCAO"].map(value => ({ value, label: value })) }]} />}
    {tab === "calculos" && <OperationForm command="simular-especial" title="Preparar cenário isolado de folha especial" fields={[field("payrollId", "Folha especial"), field("contractIds", "Contratos"), field("ruleId", "Política JSON de simulação"), field("requestKey", "Chave da simulação", randomUUID()), field("referenceDays", "Dias de referência explícitos", "0", "number"), { ...field("scope", "Escopo"), options: ["DEMONSTRACAO", "HOMOLOGACAO", "PRODUCAO"].map(value => ({ value, label: value })) }, field("parameters", "Parâmetros com value/sourceReference (JSON)", "{}", "textarea")]} />}
    <RhRemoteTablePanel title={`Operações de RH — ${tab}`} triggerLabel={`Consultar ${tab} em tela cheia`} description="Prévia, seleção coletiva e formulários permanecem montados ao fechar e paginar a consulta." columns={columns} initial={{ rows: workforceTableRows(initialData), page, total }} loadPageAction={loadTablePage} preferenceId={`rh-operacoes-${tab}`} emptyMessage="Nenhum registro neste filtro."
      toolbar={<form className={operationalStyles.searchForm}>{Object.entries(pagingValues).filter(([key]) => key !== "q").map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}<input name="q" aria-label="Buscar nome, matrícula, competência ou integração" defaultValue={q} placeholder="Nome, matrícula, competência ou integração" className={operationalStyles.searchInput} /><button className={operationalStyles.filterButton}>Buscar</button></form>} />
  </div>;
}
