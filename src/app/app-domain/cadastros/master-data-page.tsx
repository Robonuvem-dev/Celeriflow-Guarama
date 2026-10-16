import Link from "next/link";
import { Database } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { MasterDataCatalogClient } from "./MasterDataCatalogClient";
import type { MasterDataCatalog, MasterDataColumn, MasterDataField, MasterDataRow } from "./master-data-types";

const PAGE_SIZE = 20;
export type MasterDataSearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function dateValue(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function options(records: { id: string; label: string }[]) {
  return records.map(record => ({ value: record.id, label: record.label }));
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
  const { prisma } = await getTenantContextForModule("CADASTROS");
  let rows: MasterDataRow[] = [];
  let total = 0;
  let columns: MasterDataColumn[] = [];
  let fields: MasterDataField[] = [];
  const skip = (page - 1) * PAGE_SIZE;

  if (catalog === "families") {
    const where = query ? { OR: [{ code: { contains: query, mode: "insensitive" as const } }, { responsiblePerson: { fullName: { contains: query, mode: "insensitive" as const } } }] } : {};
    const [records, count, people] = await Promise.all([
      prisma.family.findMany({ where, include: { responsiblePerson: { select: { fullName: true } }, members: { where: { status: "ATIVO" }, select: { personId: true, person: { select: { fullName: true } } } }, socialProfile: { select: { address: { select: { streetName: true, number: true } } } } }, orderBy: { updatedAt: "desc" }, skip, take: PAGE_SIZE }),
      prisma.family.count({ where }),
      prisma.person.findMany({ where: { status: { not: "Inativo" } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 500 }),
    ]);
    total = count;
    rows = records.map(record => ({ id: record.id, active: record.status === "ATIVA", values: { code: record.code || "", responsiblePersonId: record.responsiblePersonId || "", responsible: record.responsiblePerson?.fullName || "-", memberIds: record.members.map(member => member.personId), members: record.members.map(member => member.person.fullName).join(", "), address: record.socialProfile?.address ? `${record.socialProfile.address.streetName || ""}, ${record.socialProfile.address.number || ""}` : "-", status: record.status } }));
    const peopleOptions = options(people.map(person => ({ id: person.id, label: person.fullName })));
    columns = [{ key: "code", label: "Código" }, { key: "responsible", label: "Responsável" }, { key: "members", label: "Membros" }, { key: "address", label: "Endereço" }];
    fields = [{ name: "code", label: "Código" }, { name: "responsiblePersonId", label: "Responsável", type: "select", options: peopleOptions }, { name: "memberIds", label: "Membros", type: "multiselect", options: peopleOptions }, { name: "status", label: "Situação", type: "select", options: [{ value: "ATIVA", label: "Ativa" }, { value: "INATIVA", label: "Inativa" }] }];
  } else if (catalog === "entities") {
    const where = query ? { OR: [{ code: { contains: query, mode: "insensitive" as const } }, { name: { contains: query, mode: "insensitive" as const } }] } : {};
    const [records, count, parents, companies] = await Promise.all([prisma.governmentEntity.findMany({ where, include: { parent: { select: { name: true } }, company: { select: { corporateName: true } } }, orderBy: { name: "asc" }, skip, take: PAGE_SIZE }), prisma.governmentEntity.count({ where }), prisma.governmentEntity.findMany({ where: { status: "ATIVA" }, select: { id: true, name: true }, orderBy: { name: "asc" } }), prisma.company.findMany({ where: { status: "Ativo" }, select: { id: true, corporateName: true }, orderBy: { corporateName: "asc" }, take: 500 })]);
    total = count; rows = records.map(record => ({ id: record.id, active: record.status === "ATIVA", values: { code: record.code, name: record.name, type: record.type, cnpj: record.cnpj || "", companyId: record.companyId || "", company: record.company?.corporateName || "-", parentId: record.parentId || "", parent: record.parent?.name || "-" } }));
    columns = [{ key: "code", label: "Código" }, { key: "name", label: "Entidade" }, { key: "type", label: "Tipo" }, { key: "parent", label: "Entidade pai" }];
    fields = [{ name: "code", label: "Código", required: true }, { name: "name", label: "Nome", required: true }, { name: "type", label: "Tipo", type: "select", required: true, options: ["PREFEITURA", "CAMARA", "AUTARQUIA", "FUNDACAO", "CONSORCIO"].map(value => ({ value, label: value })) }, { name: "cnpj", label: "CNPJ" }, { name: "companyId", label: "Pessoa jurídica", type: "select", options: options(companies.map(record => ({ id: record.id, label: record.corporateName }))) }, { name: "parentId", label: "Entidade pai", type: "select", options: options(parents.map(record => ({ id: record.id, label: record.name }))) }];
  } else if (catalog === "costCenters") {
    const where = query ? { OR: [{ code: { contains: query, mode: "insensitive" as const } }, { name: { contains: query, mode: "insensitive" as const } }] } : {};
    const [records, count, parents, entities, secretariats, departments, units] = await Promise.all([prisma.costCenter.findMany({ where, include: { parent: { select: { name: true } }, governmentEntity: { select: { name: true } }, secretariat: { select: { name: true } }, department: { select: { name: true } }, administrativeUnit: { select: { name: true } } }, orderBy: { code: "asc" }, skip, take: PAGE_SIZE }), prisma.costCenter.count({ where }), prisma.costCenter.findMany({ where: { isActive: true }, select: { id: true, name: true } }), prisma.governmentEntity.findMany({ where: { status: "ATIVA" }, select: { id: true, name: true } }), prisma.secretariat.findMany({ where: { isActive: true }, select: { id: true, name: true } }), prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true } }), prisma.administrativeUnit.findMany({ where: { isActive: true }, select: { id: true, name: true } })]);
    total = count; rows = records.map(record => ({ id: record.id, active: record.isActive, values: { code: record.code, name: record.name, description: record.description || "", parentId: record.parentId || "", parent: record.parent?.name || "-", governmentEntityId: record.governmentEntityId || "", entity: record.governmentEntity?.name || "-", secretariatId: record.secretariatId || "", secretariat: record.secretariat?.name || "-", departmentId: record.departmentId || "", administrativeUnitId: record.administrativeUnitId || "" } }));
    columns = [{ key: "code", label: "Código" }, { key: "name", label: "Centro de custo" }, { key: "entity", label: "Entidade" }, { key: "secretariat", label: "Secretaria" }, { key: "parent", label: "Pai" }];
    const opt = (items: { id: string; name: string }[]) => options(items.map(item => ({ id: item.id, label: item.name })));
    fields = [{ name: "code", label: "Código", required: true }, { name: "name", label: "Nome", required: true }, { name: "description", label: "Descrição", type: "textarea" }, { name: "parentId", label: "Centro pai", type: "select", options: opt(parents) }, { name: "governmentEntityId", label: "Entidade", type: "select", options: opt(entities) }, { name: "secretariatId", label: "Secretaria", type: "select", options: opt(secretariats) }, { name: "departmentId", label: "Departamento", type: "select", options: opt(departments) }, { name: "administrativeUnitId", label: "Unidade administrativa", type: "select", options: opt(units) }];
  } else if (catalog === "cities") {
    const where = query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { ibgeCode: { contains: query } }] } : {};
    const [records, count, states] = await Promise.all([prisma.city.findMany({ where, include: { state: true }, orderBy: { name: "asc" }, skip, take: PAGE_SIZE }), prisma.city.count({ where }), prisma.state.findMany({ where: { status: "ATIVO" }, orderBy: { name: "asc" } })]);
    total = count; rows = records.map(record => ({ id: record.id, active: record.status === "ATIVA", values: { name: record.name, ibgeCode: record.ibgeCode, stateId: record.stateId, state: `${record.state.uf} - ${record.state.name}` } })); columns = [{ key: "ibgeCode", label: "IBGE" }, { key: "name", label: "Cidade" }, { key: "state", label: "Estado" }]; fields = [{ name: "ibgeCode", label: "Código IBGE", required: true }, { name: "name", label: "Nome", required: true }, { name: "stateId", label: "Estado", type: "select", required: true, options: options(states.map(record => ({ id: record.id, label: `${record.uf} - ${record.name}` }))) }];
  } else if (catalog === "neighborhoods") {
    const where = query ? { name: { contains: query, mode: "insensitive" as const } } : {};
    const [records, count, cities] = await Promise.all([prisma.neighborhood.findMany({ where, include: { cityRef: true }, orderBy: { name: "asc" }, skip, take: PAGE_SIZE }), prisma.neighborhood.count({ where }), prisma.city.findMany({ where: { status: "ATIVA" }, include: { state: true }, orderBy: { name: "asc" } })]); total = count; rows = records.map(record => ({ id: record.id, active: record.status === "Ativo", values: { name: record.name, type: record.type, cityId: record.cityId || "", city: record.cityRef?.name || record.city, adminRegion: record.adminRegion || "", notes: record.notes || "" } })); columns = [{ key: "name", label: "Bairro/localidade" }, { key: "type", label: "Tipo" }, { key: "city", label: "Cidade" }, { key: "adminRegion", label: "Região" }]; fields = [{ name: "name", label: "Nome", required: true }, { name: "type", label: "Tipo", required: true }, { name: "cityId", label: "Cidade", type: "select", options: options(cities.map(record => ({ id: record.id, label: `${record.name}/${record.state.uf}` }))) }, { name: "adminRegion", label: "Região administrativa" }, { name: "notes", label: "Observações", type: "textarea" }];
  } else if (catalog === "streets") {
    const where = query ? { name: { contains: query, mode: "insensitive" as const } } : {};
    const [records, count, cities, neighborhoods] = await Promise.all([prisma.street.findMany({ where, include: { cityRef: true, neighborhood: true }, orderBy: { name: "asc" }, skip, take: PAGE_SIZE }), prisma.street.count({ where }), prisma.city.findMany({ where: { status: "ATIVA" }, include: { state: true }, orderBy: { name: "asc" } }), prisma.neighborhood.findMany({ where: { cityId: { not: null }, status: "Ativo" }, orderBy: { name: "asc" }, take: 1000 })]); total = count; rows = records.map(record => ({ id: record.id, active: record.status === "Ativo", values: { name: record.name, type: record.type, zipCode: record.zipCode || "", cityId: record.cityId || "", city: record.cityRef?.name || record.city, neighborhoodId: record.neighborhoodId || "", neighborhood: record.neighborhood?.name || "-" } })); columns = [{ key: "name", label: "Logradouro" }, { key: "type", label: "Tipo" }, { key: "city", label: "Cidade" }, { key: "neighborhood", label: "Bairro" }, { key: "zipCode", label: "CEP" }]; fields = [{ name: "name", label: "Nome", required: true }, { name: "type", label: "Tipo", required: true }, { name: "zipCode", label: "CEP" }, { name: "cityId", label: "Cidade", type: "select", options: options(cities.map(record => ({ id: record.id, label: `${record.name}/${record.state.uf}` }))) }, { name: "neighborhoodId", label: "Bairro", type: "select", options: options(neighborhoods.map(record => ({ id: record.id, label: record.name }))) }];
  } else if (catalog === "banks") {
    const where = query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { compe: { contains: query } }, { ispb: { contains: query } }] } : {};
    const [records, count] = await Promise.all([prisma.bank.findMany({ where, orderBy: { compe: "asc" }, skip, take: PAGE_SIZE }), prisma.bank.count({ where })]); total = count; rows = records.map(record => ({ id: record.id, active: record.status === "ATIVO", values: { compe: record.compe, ispb: record.ispb, name: record.name, shortName: record.shortName } })); columns = [{ key: "compe", label: "COMPE" }, { key: "ispb", label: "ISPB" }, { key: "name", label: "Banco" }, { key: "shortName", label: "Nome curto" }]; fields = [{ name: "compe", label: "COMPE", required: true }, { name: "ispb", label: "ISPB", required: true }, { name: "name", label: "Nome", required: true }, { name: "shortName", label: "Nome curto", required: true }];
  } else if (catalog === "branches") {
    const where = query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { code: { contains: query } }] } : {};
    const [records, count, banks, cities] = await Promise.all([prisma.bankBranch.findMany({ where, include: { bank: true, city: true }, orderBy: [{ bank: { name: "asc" } }, { code: "asc" }], skip, take: PAGE_SIZE }), prisma.bankBranch.count({ where }), prisma.bank.findMany({ where: { status: "ATIVO" }, orderBy: { name: "asc" } }), prisma.city.findMany({ where: { status: "ATIVA" }, orderBy: { name: "asc" } })]); total = count; rows = records.map(record => ({ id: record.id, active: record.status === "ATIVA", values: { bankId: record.bankId, bank: record.bank.shortName, code: record.code, name: record.name, cnpj: record.cnpj || "", cityId: record.cityId || "", city: record.city?.name || "-" } })); columns = [{ key: "bank", label: "Banco" }, { key: "code", label: "Agência" }, { key: "name", label: "Nome" }, { key: "city", label: "Cidade" }]; fields = [{ name: "bankId", label: "Banco", type: "select", required: true, options: options(banks.map(record => ({ id: record.id, label: `${record.compe} - ${record.shortName}` }))) }, { name: "code", label: "Código", required: true }, { name: "name", label: "Nome", required: true }, { name: "cnpj", label: "CNPJ" }, { name: "cityId", label: "Cidade", type: "select", options: options(cities.map(record => ({ id: record.id, label: record.name }))) }];
  } else if (catalog === "taxes") {
    const where = query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { code: { contains: query, mode: "insensitive" as const } }] } : {};
    const [records, count] = await Promise.all([prisma.tax.findMany({ where, orderBy: { name: "asc" }, skip, take: PAGE_SIZE }), prisma.tax.count({ where })]); total = count; rows = records.map(record => ({ id: record.id, active: record.isActive, values: { code: record.code || "", name: record.name, taxType: record.taxType, governmentLevel: record.governmentLevel || "", revenueNature: record.revenueNature || "", effectiveFrom: dateValue(record.effectiveFrom), effectiveUntil: dateValue(record.effectiveUntil), description: record.description || "" } })); columns = [{ key: "code", label: "Código" }, { key: "name", label: "Tributo" }, { key: "taxType", label: "Tipo" }, { key: "governmentLevel", label: "Esfera" }, { key: "effectiveFrom", label: "Vigência" }]; fields = [{ name: "code", label: "Código" }, { name: "name", label: "Nome", required: true }, { name: "taxType", label: "Tipo", required: true }, { name: "governmentLevel", label: "Esfera" }, { name: "revenueNature", label: "Natureza da receita" }, { name: "effectiveFrom", label: "Início da vigência", type: "date" }, { name: "effectiveUntil", label: "Fim da vigência", type: "date" }, { name: "description", label: "Descrição", type: "textarea" }];
  } else if (catalog === "currencies") {
    const where = query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { isoCode: { contains: query, mode: "insensitive" as const } }] } : {};
    const [records, count] = await Promise.all([prisma.currency.findMany({ where, orderBy: [{ isDefault: "desc" }, { isoCode: "asc" }], skip, take: PAGE_SIZE }), prisma.currency.count({ where })]); total = count; rows = records.map(record => ({ id: record.id, active: record.status === "ATIVA", values: { isoCode: record.isoCode, name: record.name, symbol: record.symbol, decimalPlaces: String(record.decimalPlaces), isDefault: record.isDefault } })); columns = [{ key: "isoCode", label: "ISO" }, { key: "name", label: "Moeda" }, { key: "symbol", label: "Símbolo" }, { key: "decimalPlaces", label: "Decimais" }, { key: "isDefault", label: "Padrão" }]; fields = [{ name: "isoCode", label: "Código ISO", required: true }, { name: "name", label: "Nome", required: true }, { name: "symbol", label: "Símbolo", required: true }, { name: "decimalPlaces", label: "Casas decimais", type: "number", required: true }, { name: "isDefault", label: "Moeda padrão", type: "checkbox" }];
  } else if (catalog === "products") {
    const where = query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { code: { contains: query, mode: "insensitive" as const } }] } : {};
    const [records, count] = await Promise.all([prisma.catalogItem.findMany({ where, orderBy: { name: "asc" }, skip, take: PAGE_SIZE }), prisma.catalogItem.count({ where })]); total = count; rows = records.map(record => ({ id: record.id, active: record.isActive, values: { code: record.code || "", name: record.name, description: record.description || "", unit: record.unit, category: record.category || "", productKind: record.productKind, specification: record.specification || "", externalCode: record.externalCode || "" } })); columns = [{ key: "code", label: "Código" }, { key: "name", label: "Produto" }, { key: "productKind", label: "Natureza" }, { key: "category", label: "Categoria" }, { key: "unit", label: "Unidade" }]; fields = [{ name: "code", label: "Código" }, { name: "name", label: "Nome", required: true }, { name: "productKind", label: "Natureza", type: "select", required: true, options: ["MATERIAL", "SERVICO", "PATRIMONIO"].map(value => ({ value, label: value })) }, { name: "unit", label: "Unidade", required: true }, { name: "category", label: "Categoria" }, { name: "externalCode", label: "Código externo" }, { name: "description", label: "Descrição", type: "textarea" }, { name: "specification", label: "Especificação", type: "textarea" }];
  } else if (catalog === "cbos") {
    const where = query ? { OR: [{ description: { contains: query, mode: "insensitive" as const } }, { code: { contains: query } }] } : {};
    const [records, count] = await Promise.all([prisma.healthCbo.findMany({ where, orderBy: { code: "asc" }, skip, take: PAGE_SIZE }), prisma.healthCbo.count({ where })]); total = count; rows = records.map(record => ({ id: record.id, active: record.isActive, values: { code: record.code, description: record.description } })); columns = [{ key: "code", label: "Código CBO" }, { key: "description", label: "Ocupação" }]; fields = [{ name: "code", label: "Código CBO", required: true }, { name: "description", label: "Descrição", required: true }];
  } else if (catalog === "signers") {
    const where = query ? { signingRole: { contains: query, mode: "insensitive" as const } } : {};
    const [records, count, people, employees, entities] = await Promise.all([
      prisma.legalReportSigner.findMany({ where, include: { person: { select: { fullName: true } }, employee: { select: { name: true } }, governmentEntity: { select: { name: true } } }, orderBy: [{ signatureOrder: "asc" }, { createdAt: "desc" }], skip, take: PAGE_SIZE }),
      prisma.legalReportSigner.count({ where }),
      prisma.person.findMany({ where: { status: { not: "Inativo" } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 500 }),
      prisma.employee.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
      prisma.governmentEntity.findMany({ where: { status: "ATIVA" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    total = count;
    rows = records.map(record => ({ id: record.id, active: record.status === "ATIVO", values: { personId: record.personId || "", employeeId: record.employeeId || "", signer: record.person?.fullName || record.employee?.name || "-", governmentEntityId: record.governmentEntityId || "", entity: record.governmentEntity?.name || "-", signingRole: record.signingRole, reportTypes: record.reportTypes, signatureOrder: String(record.signatureOrder), effectiveFrom: dateValue(record.effectiveFrom), effectiveUntil: dateValue(record.effectiveUntil) } }));
    columns = [{ key: "signer", label: "Signatário" }, { key: "signingRole", label: "Função na assinatura" }, { key: "reportTypes", label: "Relatórios" }, { key: "entity", label: "Entidade" }, { key: "effectiveFrom", label: "Vigência" }];
    fields = [
      { name: "personId", label: "Pessoa", type: "select", options: options(people.map(record => ({ id: record.id, label: record.fullName }))) },
      { name: "employeeId", label: "Servidor", type: "select", options: options(employees.map(record => ({ id: record.id, label: record.name }))) },
      { name: "governmentEntityId", label: "Entidade", type: "select", options: options(entities.map(record => ({ id: record.id, label: record.name }))) },
      { name: "signingRole", label: "Função na assinatura", required: true },
      { name: "reportTypes", label: "Tipos de relatório", type: "multiselect", required: true, options: ["BALANCO", "RREO", "RGF", "PRESTACAO_CONTAS", "RELATORIO_GESTAO"].map(value => ({ value, label: value.replaceAll("_", " ") })) },
      { name: "signatureOrder", label: "Ordem", type: "number", required: true },
      { name: "effectiveFrom", label: "Início da vigência", type: "date", required: true },
      { name: "effectiveUntil", label: "Fim da vigência", type: "date" },
    ];
  } else if (catalog === "legalTexts") {
    const where = query ? { OR: [{ number: { contains: query, mode: "insensitive" as const } }, { summary: { contains: query, mode: "insensitive" as const } }] } : {};
    const [records, count, entities] = await Promise.all([
      prisma.legalText.findMany({ where, include: { governmentEntity: { select: { name: true } }, versions: { orderBy: { versionNumber: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" }, skip, take: PAGE_SIZE }),
      prisma.legalText.count({ where }),
      prisma.governmentEntity.findMany({ where: { status: "ATIVA" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    total = count;
    rows = records.map(record => ({ id: record.id, active: record.status === "VIGENTE", values: { type: record.type, number: record.number, summary: record.summary, governmentLevel: record.governmentLevel, issuingBody: record.issuingBody, publicationDate: dateValue(record.publicationDate), effectiveFrom: dateValue(record.effectiveFrom), effectiveUntil: dateValue(record.effectiveUntil), governmentEntityId: record.governmentEntityId || "", entity: record.governmentEntity?.name || "-", content: record.versions[0]?.content || "", version: String(record.versions[0]?.versionNumber || 0) } }));
    columns = [{ key: "type", label: "Tipo" }, { key: "number", label: "Número" }, { key: "summary", label: "Ementa" }, { key: "issuingBody", label: "Órgão" }, { key: "version", label: "Versão" }];
    fields = [{ name: "type", label: "Tipo", required: true }, { name: "number", label: "Número", required: true }, { name: "summary", label: "Ementa", type: "textarea", required: true }, { name: "governmentLevel", label: "Esfera", required: true }, { name: "issuingBody", label: "Órgão emissor", required: true }, { name: "governmentEntityId", label: "Entidade", type: "select", options: options(entities.map(record => ({ id: record.id, label: record.name }))) }, { name: "publicationDate", label: "Publicação", type: "date" }, { name: "effectiveFrom", label: "Início da vigência", type: "date" }, { name: "effectiveUntil", label: "Fim da vigência", type: "date" }, { name: "content", label: "Conteúdo consolidado", type: "textarea", required: true }];
  }

  const tabLinks = input.tabs && <div className="mb-2 flex gap-1 border-b border-slate-200">{input.tabs.map(tab => <Link key={tab.value} href={`${input.pathname}?tab=${tab.value}`} className={`border-b-2 px-3 py-1.5 text-xs font-semibold ${activeTab === tab.value ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{tab.label}</Link>)}</div>;
  return <PageFrame className="flex h-full min-h-0 flex-col"><PageHeader title={input.title} icon={<Database className="size-4 text-emerald-700" />} />{tabLinks}<MasterDataCatalogClient catalog={catalog} pathname={input.pathname} rows={rows} columns={columns} fields={fields} page={page} total={total} query={query} extraQuery={activeTab ? { tab: activeTab } : undefined} /></PageFrame>;
}
