import Link from "next/link";
import { HardHat } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { weightsSchema } from "@/lib/obras/construction-policy";
import { definitionSchema } from "@/lib/obras/construction-rules";
import ConstructionCaseForm from "./ConstructionCaseForm";
import { db } from "@/db/client";
import { latestPageConfiguration, latestPageDefinition, listPageCatalogOptions } from "@/db/repositories/works-pages/settings";
import { listPageCompanies, listPagePeople, listPageProperties, listPageSubjects } from "@/db/repositories/works-pages/shared";

export default async function NewConstructionCasePage() {
  const context = await getTenantContextForModuleOperation("OBRAS", "create");
  await getTenantContextForModuleOperation("PROCESSOS", "create");
  const access = await resolveConstructionAccess(context);
  const authorized = access.administrator || access.roles.some((role) => ["ANALYST", "MANAGER"].includes(role));
  if (!authorized || !access.employeeId) return <PageFrame className="space-y-3 p-3"><PageHeader title="Nova solicitação interna" icon={<HardHat className="size-4" />} /><p className="rounded border p-3 text-sm">A abertura exige usuário vinculado a servidor ativo e papel de analista/gestor urbanístico vigente.</p><Link href="/obras/construcao-civil" className="text-sm text-blue-700 underline">Voltar</Link></PageFrame>;
  const database = context.database ?? db;
  const config = await latestPageConfiguration(database);
  const form = await latestPageDefinition(database, "FORM");
  const [catalogs, subjects, people, companies, properties] = await Promise.all([
    listPageCatalogOptions(database),
    listPageSubjects(database, config?.subjectIds || []),
    listPagePeople(database),
    listPageCompanies(database),
    listPageProperties(database),
  ]);
  const definition = definitionSchema.parse(form?.definition || { fields: [], checks: [], documents: [] });
  return <PageFrame className="space-y-3 p-3"><PageHeader title="Nova solicitação interna de Construção Civil" icon={<HardHat className="size-4" />} /><Link href="/obras/construcao-civil" className="text-xs text-blue-700 underline">Voltar às solicitações</Link>{config ? <ConstructionCaseForm formVersion={form?.version || 0} fields={definition.fields} checks={definition.checks} documents={definition.documents} configuration={{ version: config.version, instructions: config.instructions, weights: weightsSchema.parse(config.areaWeights) }} catalogs={catalogs} subjects={subjects.map((subject) => ({ id: subject.id, name: `${subject.processType.name} — ${subject.name}`, processTypeId: subject.processTypeId }))} people={people.map((person) => ({ id: person.id, name: person.fullName }))} companies={companies.map((company) => ({ id: company.id, name: company.corporateName }))} properties={properties.map((property) => ({ id: property.id, name: [property.municipalInsc || "Sem inscrição", property.streetName, property.number].filter(Boolean).join(" — ") }))} /> : <p className="rounded border p-3 text-sm">Publique a configuração urbanística antes de abrir solicitações.</p>}</PageFrame>;
}
