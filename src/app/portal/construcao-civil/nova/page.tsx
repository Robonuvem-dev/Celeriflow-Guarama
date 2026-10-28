import Link from "next/link";
import { and, asc, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { constructionCatalogEntries, constructionConfigVersions } from "@/db/schema/construction-core";
import { constructionExternalApplications, constructionTerms } from "@/db/schema/construction-portal";
import { constructionExternalDocuments } from "@/db/schema/construction-opening";
import { constructionDefinitionVersions } from "@/db/schema/construction-viability";
import { processSubjects, processTypes } from "@/db/schema/processes";
import { people } from "@/db/schema/people";
import { companies, realEstates } from "@/db/schema/registry";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { definitionSchema } from "@/lib/obras/construction-rules";
import ConstructionExternalOpening from "@/components/construction/ConstructionExternalOpening";

export default async function NewConstructionExternalApplication({ searchParams }: { searchParams: Promise<{ application?: string }> }) {
  const identity = await getConstructionPortalIdentity();
  const { application: applicationId } = await searchParams;
  const authorized = await db.select({ id: constructionExternalApplications.id, expiresAt: constructionExternalApplications.expiresAt }).from(constructionExternalApplications).where(and(eq(constructionExternalApplications.identityId, identity.id), isNull(constructionExternalApplications.revokedAt), gt(constructionExternalApplications.expiresAt, new Date()), isNull(constructionExternalApplications.caseId))).orderBy(desc(constructionExternalApplications.createdAt)).limit(100);
  const applicationRow = applicationId && authorized.some((item) => item.id === applicationId) ? (await db.select().from(constructionExternalApplications).where(and(eq(constructionExternalApplications.id, applicationId), eq(constructionExternalApplications.identityId, identity.id), isNull(constructionExternalApplications.revokedAt), gt(constructionExternalApplications.expiresAt, new Date()), isNull(constructionExternalApplications.caseId))).limit(1))[0] : null;
  const application = applicationRow ? { ...applicationRow, documents: await db.select().from(constructionExternalDocuments).where(eq(constructionExternalDocuments.applicationId, applicationRow.id)).orderBy(desc(constructionExternalDocuments.createdAt)) } : null;
  const [config, form, term, catalogs] = await Promise.all([
    db.select().from(constructionConfigVersions).orderBy(desc(constructionConfigVersions.version)).limit(1).then(rows => rows[0] ?? null),
    db.select().from(constructionDefinitionVersions).where(eq(constructionDefinitionVersions.kind, "FORM")).orderBy(desc(constructionDefinitionVersions.version)).limit(1).then(rows => rows[0] ?? null),
    db.select({ id: constructionTerms.id, version: constructionTerms.version, text: constructionTerms.text }).from(constructionTerms).orderBy(desc(constructionTerms.version)).limit(1).then(rows => rows[0] ?? null),
    db.select({ id: constructionCatalogEntries.id, kind: constructionCatalogEntries.kind, name: constructionCatalogEntries.name }).from(constructionCatalogEntries).where(eq(constructionCatalogEntries.isActive, true)).orderBy(asc(constructionCatalogEntries.name)),
  ]);
  const subjects = application && config ? await db.select({ id: processSubjects.id, name: processSubjects.name, processTypeId: processSubjects.processTypeId }).from(processSubjects).innerJoin(processTypes, eq(processTypes.id, processSubjects.processTypeId)).where(and(inArray(processSubjects.id, application.subjectIds.filter((id) => config.subjectIds.includes(id))), eq(processSubjects.isActive, true), eq(processTypes.isActive, true), eq(processTypes.genericWorkflowEnabled, false))).orderBy(asc(processSubjects.name)) : [];
  const properties = application ? await db.select({ id: realEstates.id, municipalInsc: realEstates.municipalInsc, streetName: realEstates.streetName, number: realEstates.number }).from(realEstates).where(inArray(realEstates.id, application.propertyIds)) : [];
  const person = application?.personId ? (await db.select({ fullName: people.fullName }).from(people).where(eq(people.id, application.personId)).limit(1))[0] ?? null : null;
  const company = application?.companyId ? (await db.select({ legalName: companies.corporateName }).from(companies).where(eq(companies.id, application.companyId)).limit(1))[0] ?? null : null;
  return <main className="mx-auto max-w-5xl space-y-4 px-4 py-8"><Link href="/portal/construcao-civil" className="text-blue-700 underline">Voltar às solicitações</Link><h1 className="text-xl font-semibold">Abertura externa de Construção Civil</h1><p className="text-sm">O setor municipal deve validar a titularidade/representação e autorizar previamente o requerente e os imóveis. Escolha uma autorização vigente.</p><ul className="space-y-2">{authorized.map((item) => <li key={item.id}><Link className="text-blue-700 underline" href={`?application=${item.id}`}>Autorização {item.id} — válida até {item.expiresAt.toLocaleDateString("pt-BR")}</Link></li>)}</ul>{!authorized.length && <p>Nenhuma autorização disponível. Contate o setor urbanístico para validar a representação e os imóveis.</p>}{application && config && term && <><section className="rounded border p-3 text-sm"><p>Requerente autorizado: {person?.fullName || company?.legalName}</p>{properties.map((property) => <p key={property.id}>Imóvel: {property.municipalInsc} — {property.streetName}, {property.number}</p>)}<p className="whitespace-pre-wrap">{config.instructions}</p></section><ConstructionExternalOpening key={application.id} application={{ id: application.id, personId: application.personId || "", companyId: application.companyId || "", propertyIds: application.propertyIds }} configVersion={config.version} formVersion={form?.version || 0} definition={definitionSchema.parse(form?.definition || { fields: [], checks: [], documents: [] })} term={term} subjects={subjects} catalogs={catalogs} documents={application.documents.map((doc) => ({ id: doc.documentId, label: doc.label, filename: doc.filename }))} /></>}{application && (!config || !term) && <p>O setor precisa publicar configuração e termo antes da abertura.</p>}</main>;
}
