import type { PrismaClient } from "@prisma/client";
import { cadastroPeople, cadastroRoles } from "./plausible-cadastro-data";
import { payrollReferenceNames as payrollNames, payrollRuleReferenceNames as ruleNames } from "../src/lib/rh/payroll-labels";
import { syntheticPersonName } from "../src/lib/poc/fixture-catalog";
import { key, systemPersonName } from "./municipal-system-dataset";

export type MunicipalNameTarget = { model: string; id: string; values: Record<string, string>; fill?: string[]; expected?: Record<string, string> };
export const referenceNames = {
  ResourceSource: ["Recursos ordinários", "Manutenção da educação básica", "Atenção primária à saúde", "Assistência social", "Infraestrutura urbana", "Conservação de estradas", "Cultura e patrimônio", "Esporte e lazer", "Gestão ambiental", "Saneamento básico", "Transporte escolar", "Alimentação escolar", "Vigilância em saúde", "Proteção social básica", "Proteção social especial", "Desenvolvimento rural", "Modernização administrativa", "Segurança comunitária", "Habitação de interesse social", "Iluminação pública", "Desenvolvimento econômico"],
  RevenueNature: ["Imposto sobre a propriedade urbana", "Imposto sobre serviços", "Imposto sobre transmissão de imóveis", "Taxas de fiscalização", "Taxas de serviços administrativos", "Contribuição de melhoria", "Transferências constitucionais", "Transferências estaduais", "Transferências para educação", "Transferências para saúde", "Transferências para assistência social", "Receita patrimonial", "Remuneração de depósitos bancários", "Receitas de serviços", "Multas administrativas", "Juros de créditos municipais", "Receita de dívida ativa", "Transferências de convênios", "Alienação de bens", "Indenizações e restituições", "Outras receitas correntes"],
  ExpenseNature: ["Remuneração de servidores", "Obrigações patronais", "Diárias de servidores", "Material de expediente", "Gêneros alimentícios", "Medicamentos e materiais de saúde", "Combustíveis e lubrificantes", "Material de manutenção predial", "Material de conservação viária", "Serviços de tecnologia", "Serviços de limpeza", "Manutenção de veículos", "Serviços técnicos especializados", "Energia elétrica", "Água e esgoto", "Comunicação e conectividade", "Locação de equipamentos", "Obras e instalações", "Equipamentos de informática", "Mobiliário administrativo", "Auxílios assistenciais"],
  AccountingPlan: ["Disponibilidades em caixa", "Obrigações de pessoal", "Depósitos bancários", "Encargos sociais a recolher", "Créditos tributários", "Fornecedores a pagar", "Estoques de materiais", "Retenções a recolher", "Adiantamentos a responsáveis", "Consignações a recolher", "Bens móveis", "Restituições a pagar", "Bens imóveis", "Obrigações contratuais", "Investimentos permanentes", "Provisões trabalhistas", "Créditos administrativos", "Obrigações de convênios", "Direitos de curto prazo", "Obrigações de curto prazo", "Outros ativos patrimoniais"],
} as const;

export async function getMunicipalNameTargets(db: PrismaClient): Promise<MunicipalNameTarget[]> {
  const targets: MunicipalNameTarget[] = [];
  const add = (model: string, id: string, values: Record<string, string>) => targets.push({ model, id, values });
  const instance = await db.configuracaoInstancia.findUnique({ where: { id: "rh-poc-ibema-instance-v1" }, select: { id: true, cnpj: true, municipio: true } });
  if (instance) targets.push({ model: "ConfiguracaoInstancia", id: instance.id, values: instance.cnpj ? { nomePrefeitura: `Prefeitura Municipal de ${instance.municipio || "Ibema"}` } : { nomePrefeitura: "Prefeitura Municipal de Aurora das Veredas", municipio: "Aurora das Veredas", uf: "MG" }, expected: instance.cnpj ? {} : { municipio: "Ibema", uf: "PR" } });
  for (let i = 36; i < 60; i++) targets.push({ model: "Person", id: key("person", i), values: { fullName: systemPersonName(i) }, expected: { fullName: syntheticPersonName(i + 81) } });
  for (const i of [16, 17]) targets.push({ model: "Employee", id: key("employee", i), values: { name: systemPersonName(i + 20) }, expected: { name: syntheticPersonName(i + 101) } });
  targets.push({ model: "SegurancaGuarda", id: key("guard", 1), values: { nome: systemPersonName(36) }, expected: { nome: syntheticPersonName(117) } });
  for (const [model, names] of Object.entries(referenceNames)) {
    const suffix = { ResourceSource: "source", RevenueNature: "revenue", ExpenseNature: "expense", AccountingPlan: "account" }[model as keyof typeof referenceNames];
    for (const [i, name] of names.entries()) add(model, `p0-current-${suffix}-${i + 1}`, { name, code: `AV.${suffix.toUpperCase()}.${String(i + 1).padStart(3, "0")}` });
  }
  for (const entity of ["exe", "leg"]) {
    for (let i = 1; i <= 21; i++) {
      add("BudgetUnit", `p0-current-${entity}-ug-${i}`, { code: `AV.${entity === "exe" ? "01" : "02"}.${String(i).padStart(3, "0")}` });
      add("CostCenter", `p0-current-${entity}-cc-${i}`, { code: `AV.${entity === "exe" ? "01" : "02"}.CC.${String(i).padStart(3, "0")}` });
    }
    add("MultiYearPlan", `p0-current-${entity}-ppa`, { name: `Plano Plurianual 2024–2027 — ${entity === "exe" ? "Executivo" : "Legislativo"}`, code: `AV.${entity.toUpperCase()}.2024-2027` });
    const instruments = await db.planningInstrument.findMany({ where: { id: { startsWith: `p0-current-${entity}-piece-` }, OR: [{ multiYearPlan: { status: "DRAFT" } }, { budgetGuideline: { status: "DRAFT" } }, { annualBudgetLaw: { status: "DRAFT" } }] }, select: { id: true, kind: true, startYear: true, endYear: true } });
    for (const row of instruments) add("PlanningInstrument", row.id, { title: `${{ PPA: "Plano Plurianual", LDO: "Diretrizes Orçamentárias", LOA: "Orçamento Anual" }[row.kind] || row.kind} ${row.startYear}${row.endYear !== row.startYear ? `–${row.endYear}` : ""}`, code: `AV-${row.kind}-${row.startYear}` });
  }
  for (let i = 1; i <= 21; i++) {
    add("Taxpayer", `p0-current-taxpayer-${i}`, { municipalInsc: `AV.PF.${String(1000 + i)}`, fiscalNotes: "Cadastro municipal de referência, com identidade vinculada e documentação sujeita à conferência cadastral." });
    add("RealEstate", `p0-current-property-${i}`, { municipalInsc: `01.02.${String(i).padStart(4, "0")}.001` });
    add("EconomicRegistration", `p0-current-economic-${i}`, { municipalInsc: `AV.EC.${String(2000 + i)}` });
    add("Supplier", `p1-poc-supplier-${i}`, { notes: "Prestador cadastrado para participação em solicitações e contratações municipais." });
  }
  add("Company", "construction-demo-company", { municipalInsc: "AV.PJ.003001" });
  add("Person", "construction-demo-person", { profession: "Engenheiro civil" });
  add("Taxpayer", "construction-demo-taxpayer", { municipalInsc: "AV.PF.001501", fiscalNotes: "Cadastro municipal de referência para acompanhamento de solicitações urbanísticas." });
  add("RealEstate", "construction-demo-property", { municipalInsc: "01.03.0045.001", registration: "AV-URB-0045", propertyUse: "Residencial" });
  add("Department", "construction-demo-department", { description: "Análise de projetos, acompanhamento de obras e fiscalização urbanística." });
  for (const [i, description] of ["Execução de atividades administrativas, atendimento e conferência de cadastros.", "Planejamento e execução de atividades pedagógicas e acompanhamento dos estudantes.", "Apoio ao atendimento de enfermagem e organização dos serviços de saúde."].entries()) add("Role", `rh-poc-role-v1-${i}`, { description });
  for (const kind of ["permit", "reanalysis", "habite_se", "subdivision", "inspection", "correction", "renewal"]) add("Tax", `construction-demo-tax-${kind}`, { code: `AV-CIVIL-${kind.toUpperCase()}`, description: "Receita vinculada à análise, vistoria ou atualização de procedimentos urbanísticos; parâmetros mantidos na edição de referência." });
  for (const [suffix, name] of [["a", "Jardim da Paz"], ["b", "Parque das Veredas"]]) {
    add("TaxCemetery", `cemetery-demo-${suffix}`, { code: `AV-CEM-${suffix.toUpperCase()}`, observations: `Estrutura municipal de atendimento funerário — ${name}.` });
    add("TaxCemeterySector", `cemetery-demo-${suffix}-sector`, { code: "Q-01" });
    add("CemeteryOssuary", `cemetery-demo-${suffix}-ossuary`, { code: "O-01" });
    for (let i = 1; i <= 2; i++) add("TaxGrave", `cemetery-demo-${suffix}-grave-${i}`, { code: `S-${String(i).padStart(3, "0")}` });
  }
  add("TaxDeathCause", "cemetery-demo-cause", { code: "CAUSA-NAO-INFORMADA", description: "Causa não informada; depende de documentação do declarante." });
  for (const id of ["cemetery-demo-owner-taxpayer", "cemetery-demo-person-taxpayer"]) add("Taxpayer", id, { fiscalNotes: "Cadastro municipal de referência para atendimento funerário." });
  const employees = await db.employee.findMany({ where: { id: { in: ["construction-demo-analyst", "construction-demo-manager", "construction-demo-inspector", "rh-poc-employee-v1-0", "rh-poc-employee-v1-1", "rh-poc-employee-v1-2"] } }, select: { id: true } });
  for (const [i, row] of employees.entries()) add("Employee", row.id, { registration: `AV-RH-${String(4101 + i)}` });
  const sets = await db.hrPayrollRuleSet.findMany({ where: { code: "RH_POC_DOCUMENTAL_2026_V1" }, include: { rules: true, rubrics: true, socialSecuritySchemes: true, vacationPolicies: true, employmentRegimes: true } });
  for (const set of sets) {
    add("HrPayrollRuleSet", set.id, { name: "Aurora das Veredas — parâmetros de pessoal e folha" });
    for (const rule of set.rules) if (ruleNames[rule.code]) add("HrPayrollRule", rule.id, { name: ruleNames[rule.code] });
    for (const rubric of set.rubrics) if (payrollNames[rubric.code]) {
      const legacy = { VENCIMENTO: "Vencimento", CONSIGNADO: "Parcela consignada", POC_ABATIMENTO: "Abatimento de valores já adiantados" }[rubric.code] || rubric.code.replaceAll("POC_", "").replaceAll("_", " ");
      targets.push({ model: "HrPayrollRubric", id: rubric.id, values: { name: payrollNames[rubric.code] }, expected: { name: legacy } });
    }
    for (const row of set.socialSecuritySchemes) add("HrSocialSecurityScheme", row.id, { name: "Regime Geral de Previdência Social — referência 2026" });
    for (const row of set.vacationPolicies) add("HrVacationPolicy", row.id, { name: "Férias anuais — aquisição e fracionamento" });
    for (const row of set.employmentRegimes) add("HrEmploymentRegime", row.id, { name: { EFETIVO_POC: "Servidor efetivo", COMISSIONADO_POC: "Cargo em comissão", TEMPORARIO_POC: "Contratação temporária" }[row.code] || row.name });
  }
  for (const event of await db.payrollEvent.findMany({ where: { code: { startsWith: "POC_" } }, select: { id: true, code: true } })) {
    const code = event.code.startsWith("POC_V1_") ? event.code.slice(7) : event.code;
    if (payrollNames[code]) add("PayrollEvent", event.id, { name: payrollNames[code] });
    else if (code.includes("PENSAO")) add("PayrollEvent", event.id, { name: "Pensão alimentícia" });
  }
  for (const user of await db.usuario.findMany({ where: { id: { startsWith: "p0-current-" }, firebaseUid: null }, select: { id: true, nome: true, email: true } })) {
    const match = /^p0-current-(exe|leg)-(.+)$/.exec(user.id);
    if (!match) continue;
    const index = cadastroRoles.findIndex(([role]) => role === match[2]);
    if (index < 0) continue;
    const contact = cadastroPeople[index + (match[1] === "leg" ? 7 : 0)];
    // Seed-created accounts were never provisioned. Verify absence in Firebase before changing email.
    const { adminAuth } = await import("../src/lib/firebase/server");
    try { await adminAuth.getUserByEmail(user.email); }
    catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "auth/user-not-found") { add("Usuario", user.id, { email: contact.email }); continue; }
      throw error;
    }
    throw new Error(`A conta ${user.id} possui credencial Firebase: migração vinculada necessária.`);
  }
  return targets;
}
