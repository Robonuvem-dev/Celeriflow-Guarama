import type { MasterDataCatalog, MasterDataColumn, MasterDataField, MasterDataOption } from "../src/app/app-domain/cadastros/master-data-types";

type Metadata = { columns: MasterDataColumn[]; fields: MasterDataField[] };
type Options = Record<string, MasterDataOption[]>;
const columns = (...pairs: [string, string][]): MasterDataColumn[] => pairs.map(([key, label]) => ({ key, label }));
const field = (name: string, label: string, required = false): MasterDataField => required ? { name, label, required: true } : { name, label };
const typed = (name: string, label: string, type: MasterDataField["type"], required = false): MasterDataField => ({ ...field(name, label, required), type });
const select = (name: string, label: string, options: MasterDataOption[], required = false): MasterDataField => ({ ...typed(name, label, "select", required), options });
const choices = (values: string[]) => values.map(value => ({ value, label: value }));

// Frozen metadata of the previously compared page. Expected metadata never
// reads the live page, calls a repository, or depends on a generated client.
export function expectedMasterMetadata(catalog: MasterDataCatalog, options: Options): Metadata {
  switch (catalog) {
    case "families": return {
      columns: columns(["code", "Código"], ["responsible", "Responsável"], ["members", "Membros"], ["address", "Endereço"]),
      fields: [field("code", "Código"), select("responsiblePersonId", "Responsável", options.people), { name: "memberIds", label: "Membros", type: "multiselect", options: options.people }, select("status", "Situação", [{ value: "ATIVA", label: "Ativa" }, { value: "INATIVA", label: "Inativa" }])],
    };
    case "entities": return {
      columns: columns(["code", "Código"], ["name", "Entidade"], ["type", "Tipo"], ["parent", "Entidade pai"]),
      fields: [field("code", "Código", true), field("name", "Nome", true), select("type", "Tipo", choices(["PREFEITURA", "CAMARA", "AUTARQUIA", "FUNDACAO", "CONSORCIO"]), true), field("cnpj", "CNPJ"), select("companyId", "Pessoa jurídica", options.companies), select("parentId", "Entidade pai", options.parents)],
    };
    case "costCenters": return {
      columns: columns(["code", "Código"], ["name", "Centro de custo"], ["entity", "Entidade"], ["secretariat", "Secretaria"], ["parent", "Pai"]),
      fields: [field("code", "Código", true), field("name", "Nome", true), typed("description", "Descrição", "textarea"), select("parentId", "Centro pai", options.parents), select("governmentEntityId", "Entidade", options.entities), select("secretariatId", "Secretaria", options.secretariats), select("departmentId", "Departamento", options.departments), select("administrativeUnitId", "Unidade administrativa", options.units)],
    };
    case "cities": return {
      columns: columns(["ibgeCode", "IBGE"], ["name", "Cidade"], ["state", "Estado"]),
      fields: [field("ibgeCode", "Código IBGE", true), field("name", "Nome", true), select("stateId", "Estado", options.states, true)],
    };
    case "neighborhoods": return {
      columns: columns(["name", "Bairro/localidade"], ["type", "Tipo"], ["city", "Cidade"], ["adminRegion", "Região"]),
      fields: [field("name", "Nome", true), field("type", "Tipo", true), select("cityId", "Cidade", options.cities), field("adminRegion", "Região administrativa"), typed("notes", "Observações", "textarea")],
    };
    case "streets": return {
      columns: columns(["name", "Logradouro"], ["type", "Tipo"], ["city", "Cidade"], ["neighborhood", "Bairro"], ["zipCode", "CEP"]),
      fields: [field("name", "Nome", true), field("type", "Tipo", true), field("zipCode", "CEP"), select("cityId", "Cidade", options.cities), select("neighborhoodId", "Bairro", options.neighborhoods)],
    };
    case "banks": return {
      columns: columns(["compe", "COMPE"], ["ispb", "ISPB"], ["name", "Banco"], ["shortName", "Nome curto"]),
      fields: [field("compe", "COMPE", true), field("ispb", "ISPB", true), field("name", "Nome", true), field("shortName", "Nome curto", true)],
    };
    case "branches": return {
      columns: columns(["bank", "Banco"], ["code", "Agência"], ["name", "Nome"], ["city", "Cidade"]),
      fields: [select("bankId", "Banco", options.banks, true), field("code", "Código", true), field("name", "Nome", true), field("cnpj", "CNPJ"), select("cityId", "Cidade", options.cities)],
    };
    case "taxes": return {
      columns: columns(["code", "Código"], ["name", "Tributo"], ["taxType", "Tipo"], ["governmentLevel", "Esfera"], ["effectiveFrom", "Vigência"]),
      fields: [field("code", "Código"), field("name", "Nome", true), field("taxType", "Tipo", true), field("governmentLevel", "Esfera"), field("revenueNature", "Natureza da receita"), typed("effectiveFrom", "Início da vigência", "date"), typed("effectiveUntil", "Fim da vigência", "date"), typed("description", "Descrição", "textarea")],
    };
    case "currencies": return {
      columns: columns(["isoCode", "ISO"], ["name", "Moeda"], ["symbol", "Símbolo"], ["decimalPlaces", "Decimais"], ["isDefault", "Padrão"]),
      fields: [field("isoCode", "Código ISO", true), field("name", "Nome", true), field("symbol", "Símbolo", true), typed("decimalPlaces", "Casas decimais", "number", true), typed("isDefault", "Moeda padrão", "checkbox")],
    };
    case "products": return {
      columns: columns(["code", "Código"], ["name", "Produto"], ["productKind", "Natureza"], ["category", "Categoria"], ["unit", "Unidade"]),
      fields: [field("code", "Código"), field("name", "Nome", true), select("productKind", "Natureza", choices(["MATERIAL", "SERVICO", "PATRIMONIO"]), true), field("unit", "Unidade", true), field("category", "Categoria"), field("externalCode", "Código externo"), typed("description", "Descrição", "textarea"), typed("specification", "Especificação", "textarea")],
    };
    case "cbos": return {
      columns: columns(["code", "Código CBO"], ["description", "Ocupação"]), fields: [field("code", "Código CBO", true), field("description", "Descrição", true)],
    };
    case "signers": return {
      columns: columns(["signer", "Signatário"], ["signingRole", "Função na assinatura"], ["reportTypes", "Relatórios"], ["entity", "Entidade"], ["effectiveFrom", "Vigência"]),
      fields: [select("personId", "Pessoa", options.people), select("employeeId", "Servidor", options.employees), select("governmentEntityId", "Entidade", options.entities), field("signingRole", "Função na assinatura", true), { name: "reportTypes", label: "Tipos de relatório", type: "multiselect", required: true, options: ["BALANCO", "RREO", "RGF", "PRESTACAO_CONTAS", "RELATORIO_GESTAO"].map(value => ({ value, label: value.replaceAll("_", " ") })) }, typed("signatureOrder", "Ordem", "number", true), typed("effectiveFrom", "Início da vigência", "date", true), typed("effectiveUntil", "Fim da vigência", "date")],
    };
    case "legalTexts": return {
      columns: columns(["type", "Tipo"], ["number", "Número"], ["summary", "Ementa"], ["issuingBody", "Órgão"], ["version", "Versão"]),
      fields: [field("type", "Tipo", true), field("number", "Número", true), typed("summary", "Ementa", "textarea", true), field("governmentLevel", "Esfera", true), field("issuingBody", "Órgão emissor", true), select("governmentEntityId", "Entidade", options.entities), typed("publicationDate", "Publicação", "date"), typed("effectiveFrom", "Início da vigência", "date"), typed("effectiveUntil", "Fim da vigência", "date"), typed("content", "Conteúdo consolidado", "textarea", true)],
    };
  }
}
