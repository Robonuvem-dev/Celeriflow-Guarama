import { syntheticPersonName, syntheticPhone } from "../src/lib/poc/fixture-catalog";

// Stable keys and fictional identities. Contact domains are reserved by IANA.
export const cadastroPeople = Array.from({ length: 21 }, (_, index) => ({
  name: syntheticPersonName(index),
  email: `cadastro.${String(index + 1).padStart(3, "0")}@auroradasveredas.example`,
  phone: syntheticPhone(index + 1),
}));

export const cadastroRoles = [
  ["proponente", "Elaboração de propostas"], ["aprovador", "Aprovação administrativa"],
  ["sancionador", "Sanção e autorização"], ["consulta", "Consulta e relatórios"],
  ["financeiro", "Gestão financeira"], ["controlador", "Controle interno"],
  ["notificado", "Acompanhamento de notificações"],
] as const;

export const executiveUnits = [
  "Gabinete do Prefeito", "Procuradoria Municipal", "Controladoria Municipal", "Secretaria de Administração",
  "Gestão de Pessoas", "Tecnologia da Informação", "Secretaria de Fazenda", "Contabilidade Municipal",
  "Tesouraria Municipal", "Compras e Licitações", "Secretaria de Educação", "Educação Infantil",
  "Ensino Fundamental", "Transporte Escolar", "Secretaria de Saúde", "Atenção Primária à Saúde",
  "Vigilância em Saúde", "Secretaria de Assistência Social", "Secretaria de Obras e Serviços Urbanos",
  "Secretaria de Agricultura e Meio Ambiente", "Secretaria de Cultura, Esporte e Turismo",
];
export const legislativeUnits = [
  "Presidência da Câmara", "Gabinete da Presidência", "Mesa Diretora", "Secretaria Legislativa",
  "Assessoria Parlamentar", "Comissões Permanentes", "Procuradoria Legislativa", "Controle Interno da Câmara",
  "Diretoria Administrativa", "Gestão de Pessoas da Câmara", "Contabilidade da Câmara", "Tesouraria da Câmara",
  "Compras e Contratos da Câmara", "Patrimônio da Câmara", "Tecnologia Legislativa", "Arquivo Legislativo",
  "Comunicação Institucional", "Ouvidoria Legislativa", "Escola do Legislativo", "Apoio às Sessões", "Manutenção da Câmara",
];

type Target = { model: string; id: string; values: Record<string, string>; fill?: string[] };
export const cadastroTargets: Target[] = [];
function add(model: string, id: string, values: Record<string, string>, fill?: string[]) {
  cadastroTargets.push({ model, id, values, fill });
}
for (const [suffix, units] of [["exe", executiveUnits], ["leg", legislativeUnits]] as const) {
  const jurisdiction = suffix === "exe" ? "Executivo" : "Legislativo";
  for (const [index, [role, label]] of cadastroRoles.entries()) {
    const id = `p0-current-${suffix}-${role}`;
    add("ConfiguracaoPerfil", id, { nome: `${label} — ${jurisdiction}` });
    add("Usuario", id, { nome: cadastroPeople[index + (suffix === "leg" ? 7 : 0)].name });
  }
  for (const [index, name] of units.entries()) {
    add("BudgetUnit", `p0-current-${suffix}-ug-${index + 1}`, { name });
    add("CostCenter", `p0-current-${suffix}-cc-${index + 1}`, { name: `${name} — Custeio` });
  }
}
for (const [index, person] of cadastroPeople.entries()) {
  add("Person", `p1-poc-person-${index + 1}`, { fullName: person.name, email: person.email, phonePrimary: person.phone }, ["email", "phonePrimary"]);
  add("Creditor", `p1-poc-creditor-${index + 1}`, { name: person.name });
  add("RealEstate", `p0-current-property-${index + 1}`, { streetName: ["Rua das Veredas", "Avenida do Ipê", "Rua Serra Clara", "Rua do Comércio", "Avenida das Nascentes", "Rua das Palmeiras", "Rua da Estação"][index % 7] });
}
for (const [index, name] of ["Ana Carolina Ribeiro", "Bruno Henrique Cardoso", "Carla Beatriz Almeida"].entries()) {
  add("Person", `rh-poc-person-v1-${index}`, { fullName: name, email: `rh.${index + 1}@auroradasveredas.example`, phonePrimary: syntheticPhone(30 + index) }, ["email", "phonePrimary"]);
  add("Employee", `rh-poc-employee-v1-${index}`, { name });
}
add("Usuario", "cmv2sbpnj000106lbisa3zhwf", { nome: "Marina Azevedo" });
add("Person", "construction-demo-person", { fullName: "Eduardo Augusto Figueiredo", email: "eduardo.figueiredo@auroradasveredas.example", phonePrimary: syntheticPhone(41) }, ["email", "phonePrimary"]);
add("Company", "construction-demo-company", { corporateName: "Veredas Engenharia e Construções Ltda.", tradeName: "Veredas Engenharia", emailPrimary: "contato@veredasengenharia.example", phone: syntheticPhone(42), contactPerson: "Eduardo Augusto Figueiredo" }, ["tradeName", "emailPrimary", "phone", "contactPerson"]);
for (const [key, name] of [["analyst", "Fernanda Cristina Moura"], ["manager", "Roberto Luiz Campos"], ["inspector", "Marcos Vinícius Teixeira"]]) add("Employee", `construction-demo-${key}`, { name });
add("ProcessType", "construction-demo-process-type", { name: "Licenciamento urbanístico" });
add("Subject", "construction-demo-subject", { name: "Obras e parcelamento do solo" });
add("RealEstate", "construction-demo-property", { streetName: "Rua das Nascentes" });
add("Person", "cemetery-demo-owner", { fullName: "Antônio Carlos Batista", email: "antonio.batista@auroradasveredas.example", phonePrimary: syntheticPhone(43) }, ["email", "phonePrimary"]);
add("Person", "cemetery-demo-person", { fullName: "Maria Helena Batista" });
for (const [suffix, name, address, employee] of [
  ["a", "Cemitério Municipal Jardim da Paz", "Rua dos Cedros, 240, Jardim das Acácias", "José Roberto Santana"],
  ["b", "Cemitério Municipal Parque das Veredas", "Avenida das Palmeiras, 680, Parque das Veredas", "Paulo Sérgio Moreira"],
]) {
  const id = `cemetery-demo-${suffix}`;
  add("TaxCemetery", id, { name, address, phone: syntheticPhone(suffix === "a" ? 44 : 45) }, ["phone"]);
  add("TaxCemeteryEmployee", `${id}-employee`, { name: employee });
  add("TaxCemeterySector", `${id}-sector`, { name: "Quadra das Acácias" });
  add("CemeteryChapel", `${id}-chapel`, { name: suffix === "a" ? "Capela São Miguel" : "Capela Nossa Senhora da Paz", address });
  add("CemeteryOssuary", `${id}-ossuary`, { address });
}
add("TaxFuneralHome", "cemetery-demo-funeral", { name: "Serviço Funerário Municipal de Aurora das Veredas", phone: syntheticPhone(46) }, ["phone"]);
for (const [kind, name] of [
  ["permit", "Taxa de análise e aprovação de projeto"], ["reanalysis", "Taxa de reanálise de projeto"],
  ["habite_se", "Taxa de vistoria para habite-se"], ["subdivision", "Taxa de análise de parcelamento"],
  ["inspection", "Taxa de vistoria de obra"], ["correction", "Taxa de retificação de licença"], ["renewal", "Taxa de renovação de licença"],
]) add("Tax", `construction-demo-tax-${kind}`, { name });
