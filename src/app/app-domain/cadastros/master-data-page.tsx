import Link from "next/link";
import { Database } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { MasterDataCatalogClient } from "./MasterDataCatalogClient";
import type { MasterDataCatalog, MasterDataColumn, MasterDataField } from "./master-data-types";
import { db } from "@/db/client";
import { loadMasterDataPage } from "@/db/repositories/registry/master-data-queries";
export type MasterDataSearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function renderMasterDataPage(input: {
  catalog: MasterDataCatalog;
  title: string;
  pathname: string;
  searchParams: MasterDataSearchParams;
  tabs?: { value: string; label: string; catalog: MasterDataCatalog }[];
}) {
  const params = await input.searchParams;
  const query = firstParam(params.q)?.trim() || "";
  const page = Math.max(1, Number.parseInt(firstParam(params.page) || "1", 10) || 1);
  const requestedTab = firstParam(params.tab);
  const activeTab = input.tabs?.some(tab => tab.value === requestedTab) ? requestedTab : input.tabs?.[0]?.value;
  const catalog = input.tabs?.find(tab => tab.value === activeTab)?.catalog || input.catalog;
  const context = await getTenantContextForModule("CADASTROS");
  const { rows, total, options } = await loadMasterDataPage(context.database ?? db, catalog, query, page);
  let columns: MasterDataColumn[] = [];
  let fields: MasterDataField[] = [];

  if (catalog === "families") {
    const peopleOptions = options.people;
    columns = [{ key: "code", label: "Código" }, { key: "responsible", label: "Responsável" }, { key: "members", label: "Membros" }, { key: "address", label: "Endereço" }];
    fields = [{ name: "code", label: "Código" }, { name: "responsiblePersonId", label: "Responsável", type: "select", options: peopleOptions }, { name: "memberIds", label: "Membros", type: "multiselect", options: peopleOptions }, { name: "status", label: "Situação", type: "select", options: [{ value: "ATIVA", label: "Ativa" }, { value: "INATIVA", label: "Inativa" }] }];
  } else if (catalog === "entities") {
    columns = [{ key: "code", label: "Código" }, { key: "name", label: "Entidade" }, { key: "type", label: "Tipo" }, { key: "parent", label: "Entidade pai" }];
    fields = [{ name: "code", label: "Código", required: true }, { name: "name", label: "Nome", required: true }, { name: "type", label: "Tipo", type: "select", required: true, options: ["PREFEITURA", "CAMARA", "AUTARQUIA", "FUNDACAO", "CONSORCIO"].map(value => ({ value, label: value })) }, { name: "cnpj", label: "CNPJ" }, { name: "companyId", label: "Pessoa jurídica", type: "select", options: options.companies }, { name: "parentId", label: "Entidade pai", type: "select", options: options.parents }];
  } else if (catalog === "costCenters") {
    columns = [{ key: "code", label: "Código" }, { key: "name", label: "Centro de custo" }, { key: "entity", label: "Entidade" }, { key: "secretariat", label: "Secretaria" }, { key: "parent", label: "Pai" }];
    fields = [{ name: "code", label: "Código", required: true }, { name: "name", label: "Nome", required: true }, { name: "description", label: "Descrição", type: "textarea" }, { name: "parentId", label: "Centro pai", type: "select", options: options.parents }, { name: "governmentEntityId", label: "Entidade", type: "select", options: options.entities }, { name: "secretariatId", label: "Secretaria", type: "select", options: options.secretariats }, { name: "departmentId", label: "Departamento", type: "select", options: options.departments }, { name: "administrativeUnitId", label: "Unidade administrativa", type: "select", options: options.units }];
  } else if (catalog === "cities") {
    columns = [{ key: "ibgeCode", label: "IBGE" }, { key: "name", label: "Cidade" }, { key: "state", label: "Estado" }]; fields = [{ name: "ibgeCode", label: "Código IBGE", required: true }, { name: "name", label: "Nome", required: true }, { name: "stateId", label: "Estado", type: "select", required: true, options: options.states }];
  } else if (catalog === "neighborhoods") {
    columns = [{ key: "name", label: "Bairro/localidade" }, { key: "type", label: "Tipo" }, { key: "city", label: "Cidade" }, { key: "adminRegion", label: "Região" }]; fields = [{ name: "name", label: "Nome", required: true }, { name: "type", label: "Tipo", required: true }, { name: "cityId", label: "Cidade", type: "select", options: options.cities }, { name: "adminRegion", label: "Região administrativa" }, { name: "notes", label: "Observações", type: "textarea" }];
  } else if (catalog === "streets") {
    columns = [{ key: "name", label: "Logradouro" }, { key: "type", label: "Tipo" }, { key: "city", label: "Cidade" }, { key: "neighborhood", label: "Bairro" }, { key: "zipCode", label: "CEP" }]; fields = [{ name: "name", label: "Nome", required: true }, { name: "type", label: "Tipo", required: true }, { name: "zipCode", label: "CEP" }, { name: "cityId", label: "Cidade", type: "select", options: options.cities }, { name: "neighborhoodId", label: "Bairro", type: "select", options: options.neighborhoods }];
  } else if (catalog === "banks") {
    columns = [{ key: "compe", label: "COMPE" }, { key: "ispb", label: "ISPB" }, { key: "name", label: "Banco" }, { key: "shortName", label: "Nome curto" }]; fields = [{ name: "compe", label: "COMPE", required: true }, { name: "ispb", label: "ISPB", required: true }, { name: "name", label: "Nome", required: true }, { name: "shortName", label: "Nome curto", required: true }];
  } else if (catalog === "branches") {
    columns = [{ key: "bank", label: "Banco" }, { key: "code", label: "Agência" }, { key: "name", label: "Nome" }, { key: "city", label: "Cidade" }]; fields = [{ name: "bankId", label: "Banco", type: "select", required: true, options: options.banks }, { name: "code", label: "Código", required: true }, { name: "name", label: "Nome", required: true }, { name: "cnpj", label: "CNPJ" }, { name: "cityId", label: "Cidade", type: "select", options: options.cities }];
  } else if (catalog === "taxes") {
    columns = [{ key: "code", label: "Código" }, { key: "name", label: "Tributo" }, { key: "taxType", label: "Tipo" }, { key: "governmentLevel", label: "Esfera" }, { key: "effectiveFrom", label: "Vigência" }]; fields = [{ name: "code", label: "Código" }, { name: "name", label: "Nome", required: true }, { name: "taxType", label: "Tipo", required: true }, { name: "governmentLevel", label: "Esfera" }, { name: "revenueNature", label: "Natureza da receita" }, { name: "effectiveFrom", label: "Início da vigência", type: "date" }, { name: "effectiveUntil", label: "Fim da vigência", type: "date" }, { name: "description", label: "Descrição", type: "textarea" }];
  } else if (catalog === "currencies") {
    columns = [{ key: "isoCode", label: "ISO" }, { key: "name", label: "Moeda" }, { key: "symbol", label: "Símbolo" }, { key: "decimalPlaces", label: "Decimais" }, { key: "isDefault", label: "Padrão" }]; fields = [{ name: "isoCode", label: "Código ISO", required: true }, { name: "name", label: "Nome", required: true }, { name: "symbol", label: "Símbolo", required: true }, { name: "decimalPlaces", label: "Casas decimais", type: "number", required: true }, { name: "isDefault", label: "Moeda padrão", type: "checkbox" }];
  } else if (catalog === "products") {
    columns = [{ key: "code", label: "Código" }, { key: "name", label: "Produto" }, { key: "productKind", label: "Natureza" }, { key: "category", label: "Categoria" }, { key: "unit", label: "Unidade" }]; fields = [{ name: "code", label: "Código" }, { name: "name", label: "Nome", required: true }, { name: "productKind", label: "Natureza", type: "select", required: true, options: ["MATERIAL", "SERVICO", "PATRIMONIO"].map(value => ({ value, label: value })) }, { name: "unit", label: "Unidade", required: true }, { name: "category", label: "Categoria" }, { name: "externalCode", label: "Código externo" }, { name: "description", label: "Descrição", type: "textarea" }, { name: "specification", label: "Especificação", type: "textarea" }];
  } else if (catalog === "cbos") {
    columns = [{ key: "code", label: "Código CBO" }, { key: "description", label: "Ocupação" }]; fields = [{ name: "code", label: "Código CBO", required: true }, { name: "description", label: "Descrição", required: true }];
  } else if (catalog === "signers") {
    columns = [{ key: "signer", label: "Signatário" }, { key: "signingRole", label: "Função na assinatura" }, { key: "reportTypes", label: "Relatórios" }, { key: "entity", label: "Entidade" }, { key: "effectiveFrom", label: "Vigência" }];
    fields = [
      { name: "personId", label: "Pessoa", type: "select", options: options.people },
      { name: "employeeId", label: "Servidor", type: "select", options: options.employees },
      { name: "governmentEntityId", label: "Entidade", type: "select", options: options.entities },
      { name: "signingRole", label: "Função na assinatura", required: true },
      { name: "reportTypes", label: "Tipos de relatório", type: "multiselect", required: true, options: ["BALANCO", "RREO", "RGF", "PRESTACAO_CONTAS", "RELATORIO_GESTAO"].map(value => ({ value, label: value.replaceAll("_", " ") })) },
      { name: "signatureOrder", label: "Ordem", type: "number", required: true },
      { name: "effectiveFrom", label: "Início da vigência", type: "date", required: true },
      { name: "effectiveUntil", label: "Fim da vigência", type: "date" },
    ];
  } else if (catalog === "legalTexts") {
    columns = [{ key: "type", label: "Tipo" }, { key: "number", label: "Número" }, { key: "summary", label: "Ementa" }, { key: "issuingBody", label: "Órgão" }, { key: "version", label: "Versão" }];
    fields = [{ name: "type", label: "Tipo", required: true }, { name: "number", label: "Número", required: true }, { name: "summary", label: "Ementa", type: "textarea", required: true }, { name: "governmentLevel", label: "Esfera", required: true }, { name: "issuingBody", label: "Órgão emissor", required: true }, { name: "governmentEntityId", label: "Entidade", type: "select", options: options.entities }, { name: "publicationDate", label: "Publicação", type: "date" }, { name: "effectiveFrom", label: "Início da vigência", type: "date" }, { name: "effectiveUntil", label: "Fim da vigência", type: "date" }, { name: "content", label: "Conteúdo consolidado", type: "textarea", required: true }];
  }

  const tabLinks = input.tabs && <div className="mb-2 flex gap-1 border-b border-slate-200">{input.tabs.map(tab => <Link key={tab.value} href={`${input.pathname}?tab=${tab.value}`} className={`border-b-2 px-3 py-1.5 text-xs font-semibold ${activeTab === tab.value ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{tab.label}</Link>)}</div>;
  return <PageFrame className="flex h-full min-h-0 flex-col"><PageHeader title={input.title} icon={<Database className="size-4 text-emerald-700" />} />{tabLinks}<MasterDataCatalogClient catalog={catalog} pathname={input.pathname} rows={rows} columns={columns} fields={fields} page={page} total={total} query={query} extraQuery={activeTab ? { tab: activeTab } : undefined} /></PageFrame>;
}
