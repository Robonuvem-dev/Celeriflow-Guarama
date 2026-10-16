import Link from "next/link";
import { HardHat } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { weightsSchema } from "@/lib/obras/construction-policy";
import { definitionSchema } from "@/lib/obras/construction-rules";
import ConstructionCaseForm from "./ConstructionCaseForm";

export default async function NewConstructionCasePage() {
  const context = await getTenantContextForModuleOperation("OBRAS", "create");
  await getTenantContextForModuleOperation("PROCESSOS", "create");
  const access = await resolveConstructionAccess(context);
  const authorized = access.administrator || access.roles.some((role) => ["ANALYST", "MANAGER"].includes(role));
  if (!authorized || !access.employeeId) return <PageFrame className="space-y-3 p-3"><PageHeader title="Nova solicitação interna" icon={<HardHat className="size-4" />} /><p className="rounded border p-3 text-sm">A abertura exige usuário vinculado a servidor ativo e papel de analista/gestor urbanístico vigente.</p><Link href="/obras/construcao-civil" className="text-sm text-blue-700 underline">Voltar</Link></PageFrame>;
  const config = await context.prisma.constructionConfigVersion.findFirst({ orderBy: { version: "desc" } });
  const form = await context.prisma.constructionDefinitionVersion.findFirst({ where: { kind: "FORM" }, orderBy: { version: "desc" } });
  const [catalogs, subjects, people, companies, properties] = await Promise.all([
    context.prisma.constructionCatalogEntry.findMany({ where: { isActive: true }, select: { id: true, kind: true, name: true }, orderBy: { name: "asc" } }),
    context.prisma.subject.findMany({ where: { id: { in: config?.subjectIds || [] }, isActive: true, allowsInternalOpening: true, processType: { isActive: true, allowsInternalOpening: true } }, select: { id: true, name: true, processTypeId: true, processType: { select: { name: true } } }, orderBy: { name: "asc" } }),
    context.prisma.person.findMany({ where: { status: "Ativo" }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    context.prisma.company.findMany({ where: { status: "Ativo" }, select: { id: true, corporateName: true }, orderBy: { corporateName: "asc" } }),
    context.prisma.realEstate.findMany({ select: { id: true, municipalInsc: true, streetName: true, number: true }, orderBy: { municipalInsc: "asc" } }),
  ]);
  const definition = definitionSchema.parse(form?.definition || { fields: [], checks: [], documents: [] });
  return <PageFrame className="space-y-3 p-3"><PageHeader title="Nova solicitação interna de Construção Civil" icon={<HardHat className="size-4" />} /><Link href="/obras/construcao-civil" className="text-xs text-blue-700 underline">Voltar às solicitações</Link>{config ? <ConstructionCaseForm formVersion={form?.version || 0} fields={definition.fields} checks={definition.checks} documents={definition.documents} configuration={{ version: config.version, instructions: config.instructions, weights: weightsSchema.parse(config.areaWeights) }} catalogs={catalogs} subjects={subjects.map((subject) => ({ id: subject.id, name: `${subject.processType.name} — ${subject.name}`, processTypeId: subject.processTypeId }))} people={people.map((person) => ({ id: person.id, name: person.fullName }))} companies={companies.map((company) => ({ id: company.id, name: company.corporateName }))} properties={properties.map((property) => ({ id: property.id, name: [property.municipalInsc || "Sem inscrição", property.streetName, property.number].filter(Boolean).join(" — ") }))} /> : <p className="rounded border p-3 text-sm">Publique a configuração urbanística antes de abrir solicitações.</p>}</PageFrame>;
}
