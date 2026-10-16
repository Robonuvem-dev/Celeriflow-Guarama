import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { definitionSchema } from "@/lib/obras/construction-rules";
import ConstructionExternalOpening from "@/components/construction/ConstructionExternalOpening";

export default async function NewConstructionExternalApplication({ searchParams }: { searchParams: Promise<{ application?: string }> }) {
  const identity = await getConstructionPortalIdentity();
  const { application: applicationId } = await searchParams;
  const authorized = await prisma.constructionExternalApplication.findMany({ where: { identityId: identity.id, revokedAt: null, expiresAt: { gt: new Date() }, caseId: null }, select: { id: true, expiresAt: true }, orderBy: { createdAt: "desc" }, take: 100 });
  const application = applicationId && authorized.some((item) => item.id === applicationId) ? await prisma.constructionExternalApplication.findFirst({ where: { id: applicationId, identityId: identity.id, revokedAt: null, expiresAt: { gt: new Date() }, caseId: null }, include: { documents: { orderBy: { createdAt: "desc" } } } }) : null;
  const [config, form, term, catalogs] = await Promise.all([
    prisma.constructionConfigVersion.findFirst({ orderBy: { version: "desc" } }),
    prisma.constructionDefinitionVersion.findFirst({ where: { kind: "FORM" }, orderBy: { version: "desc" } }),
    prisma.constructionTermVersion.findFirst({ orderBy: { version: "desc" }, select: { id: true, version: true, text: true } }),
    prisma.constructionCatalogEntry.findMany({ where: { isActive: true }, select: { id: true, kind: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const subjects = application && config ? await prisma.subject.findMany({ where: { id: { in: application.subjectIds.filter((id) => config.subjectIds.includes(id)) }, isActive: true, processType: { isActive: true, genericWorkflowEnabled: false } }, select: { id: true, name: true, processTypeId: true }, orderBy: { name: "asc" } }) : [];
  const properties = application ? await prisma.realEstate.findMany({ where: { id: { in: application.propertyIds } }, select: { id: true, municipalInsc: true, streetName: true, number: true } }) : [];
  const person = application?.personId ? await prisma.person.findUnique({ where: { id: application.personId }, select: { fullName: true } }) : null;
  const company = application?.companyId ? await prisma.company.findUnique({ where: { id: application.companyId }, select: { corporateName: true } }).then((item) => item ? { legalName: item.corporateName } : null) : null;
  return <main className="mx-auto max-w-5xl space-y-4 px-4 py-8"><Link href="/portal/construcao-civil" className="text-blue-700 underline">Voltar às solicitações</Link><h1 className="text-xl font-semibold">Abertura externa de Construção Civil</h1><p className="text-sm">O setor municipal deve validar a titularidade/representação e autorizar previamente o requerente e os imóveis. Escolha uma autorização vigente.</p><ul className="space-y-2">{authorized.map((item) => <li key={item.id}><Link className="text-blue-700 underline" href={`?application=${item.id}`}>Autorização {item.id} — válida até {item.expiresAt.toLocaleDateString("pt-BR")}</Link></li>)}</ul>{!authorized.length && <p>Nenhuma autorização disponível. Contate o setor urbanístico para validar a representação e os imóveis.</p>}{application && config && term && <><section className="rounded border p-3 text-sm"><p>Requerente autorizado: {person?.fullName || company?.legalName}</p>{properties.map((property) => <p key={property.id}>Imóvel: {property.municipalInsc} — {property.streetName}, {property.number}</p>)}<p className="whitespace-pre-wrap">{config.instructions}</p></section><ConstructionExternalOpening key={application.id} application={{ id: application.id, personId: application.personId || "", companyId: application.companyId || "", propertyIds: application.propertyIds }} configVersion={config.version} formVersion={form?.version || 0} definition={definitionSchema.parse(form?.definition || { fields: [], checks: [], documents: [] })} term={term} subjects={subjects} catalogs={catalogs} documents={application.documents.map((doc) => ({ id: doc.documentId, label: doc.label, filename: doc.filename }))} /></>}{application && (!config || !term) && <p>O setor precisa publicar configuração e termo antes da abertura.</p>}</main>;
}
