import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import ItbiClient from "./ItbiClient";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import { fiscalCatalogSchema } from "@/lib/tributacao/configurable-cadastres";
import ItbiCollectionClient from "./ItbiCollectionClient";

export const dynamic = "force-dynamic";

function taxpayerName(item: { person: { fullName: string; cpf: string | null } | null; company: { corporateName: string; cnpj: string } | null }) {
  return item.company ? `${item.company.corporateName} · ${item.company.cnpj}` : item.person ? `${item.person.fullName} · ${item.person.cpf}` : "Contribuinte sem identificação";
}

export default async function ItbiPage() {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO");
  const unrestricted = isSystemAdministrator(user);
  const declarationScope = unrestricted ? {} : user.allowedBudgetUnitIds.length ? { OR: user.allowedBudgetUnitIds.map(budgetUnitId => ({ calculationSnapshot: { path: ["budgetUnitId"], equals: budgetUnitId } })) } : { id: { in: [] } };
  const [types, properties, taxpayers, processes, declarations, rules, typeOrigins] = await Promise.all([
    prisma.itbiTransactionType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.realEstate.findMany({ orderBy: { municipalInsc: "asc" }, take: 500 }),
    prisma.taxpayer.findMany({ where: { status: "Ativo" }, include: { person: true, company: true }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.process.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, protocolNumber: true, status: true }, take: 200 }),
    prisma.itbiDeclaration.findMany({ where: declarationScope, include: { transactionType: true, parties: true, events: { orderBy: { createdAt: "desc" }, take: 20 } }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "TAX", category: "PROPERTY_VALUATION_RULE" }, orderBy: { version: "desc" } }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "ITBI_TRANSACTION_TYPE", category: "PARAMETER_SCOPE" } }),
  ]);
  const names = new Map(taxpayers.map((item) => [item.id, taxpayerName(item)]));
  const latestRules = new Map<string, typeof rules[number]>();
  for (const rule of rules) {
    const data = taxScopeSnapshot(rule.data);
    if (data.taxName === "ITBI" && data.year === new Date().getUTCFullYear() && (unrestricted || typeof data.budgetUnitId === "string" && user.allowedBudgetUnitIds.includes(data.budgetUnitId)) && !latestRules.has(rule.title)) latestRules.set(rule.title, rule);
  }
  const visibleTypes = types.filter(type => {
    const origin = typeOrigins.find(item => item.entityId === type.id);
    const scope = taxScopeSnapshot(origin?.data);
    return unrestricted || !!origin && typeof scope.budgetUnitId === "string" && user.allowedBudgetUnitIds.includes(scope.budgetUnitId);
  });
  const definitions=await prisma.taxRegistryEntry.findMany({where:{entityType:"FISCAL_CATALOG",category:"TYPED_FISCAL_CATALOG"},orderBy:{version:"desc"}});
  const catalogs=new Map<string,typeof definitions[number]>();for(const definition of definitions) if(!catalogs.has(definition.entityId)) catalogs.set(definition.entityId,definition);
  const forms=[...catalogs.values()].map(definition=>({id:definition.entityId,data:fiscalCatalogSchema.parse(definition.data)})).filter(form=>form.data.kind==="FORMULARIO_ITBI" && form.data.active && (unrestricted || user.allowedBudgetUnitIds.includes(form.data.budgetUnitId)));
  const documents=await prisma.document.findMany({where:{status:"Válido"},select:{id:true,title:true},take:200});
  return <div className="flex h-full min-h-0 flex-col overflow-auto"><ItbiCollectionClient properties={properties.map(item=>({id:item.id,label:`${item.municipalInsc ?? item.id} · ${item.streetName ?? ""}`,taxpayerId:item.taxpayerId}))} taxpayers={taxpayers.map(item=>({id:item.id,name:names.get(item.id) ?? item.id}))} types={visibleTypes} processes={processes}/><ItbiClient
    forms={forms.map(form=>({id:form.id,name:form.data.name,fields:form.data.fields}))}
    documents={documents}
    transactionTypes={visibleTypes.map((item) => ({ id: item.id, code: item.code, name: item.name, rate: Number(item.rate), damStage: item.damStage, updateMode: item.cadastralUpdateMode, legalBasis: item.legalBasis, requiresDebtClearance: item.requiresDebtClearance, updatedAt: item.updatedAt.toISOString() }))}
    valuationRules={[...latestRules.values()].map(rule => ({ id: rule.id, label: `Avaliação ITBI ${String(taxScopeSnapshot(rule.data).year)} · versão ${rule.version}` }))}
    properties={properties.map((item) => ({ id: item.id, label: `${item.municipalInsc ?? "Sem inscrição"} · ${item.streetName ?? "Endereço não informado"}, ${item.number ?? "s/n"}`, taxpayerId: item.taxpayerId, landArea: item.landArea, builtArea: item.builtArea, registration: item.registration }))}
    taxpayers={taxpayers.map((item) => ({ id: item.id, name: names.get(item.id) ?? item.id }))}
    processes={processes}
    declarations={declarations.map((item) => ({
      id: item.id, number: item.declarationNumber, status: item.status, type: item.transactionType.name, protocol: item.protocolNumber,
      propertyId: item.realEstateId, scope: item.transmissionScope, fraction: Number(item.transmittedFraction), propertyValue: Number(item.declaredPropertyValue),
      base: Number(item.taxableBase), rate: Number(item.appliedRate), tax: Number(item.taxAmount), taxDebt: Number(item.blockingTaxDebt), nonTaxDebt: Number(item.nonTaxDebtAmount),
      isLeasehold: item.isLeasehold, registryOffice: item.registryOffice, guideId: item.guideId, documentId: item.documentId,
      parties: item.parties.map((party) => ({ role: party.role, name: names.get(party.taxpayerId) ?? party.taxpayerId, share: party.participationPercent ? Number(party.participationPercent) : null, liability: party.liabilityType })),
      events: item.events.map((event) => ({ type: event.eventType, description: event.description, date: event.createdAt.toISOString() })),
    }))}
  /></div>;
}
