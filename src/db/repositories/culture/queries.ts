import { asc, count, desc, eq, getTableColumns, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { databaseTimestamp } from "@/db/temporal";
import { culturalActivities, culturalAgents, culturalEvents, culturalHeritages, culturalProjects, culturalReservations, culturalSpaces } from "@/db/schema/culture";
import type { CulturalActivityView, CulturalAgentView, CulturalCouncilView, CulturalEventView, CulturalFundView, CulturalHeritage, CulturalProjectView, CulturalReservationView, CulturalSpaceView, CultureAssetReference, CultureCompanyReference, CultureDocumentReference, CultureEmployeeReference, CulturePersonReference, CulturePropertyReference, CultureSpaceReference } from "@/lib/contracts/culture";

// These are fixed SQL projections, never a model-name/query translator. Related
// financial records are read-only references on the same executor as the caller.
const agentPerson = sql<CulturePersonReference | null>`(SELECT to_jsonb(p) FROM "Person" p WHERE p.id = "CulturaAgente"."personId")`;
const agentCompany = sql<CultureCompanyReference | null>`(SELECT to_jsonb(c) FROM "Company" c WHERE c.id = "CulturaAgente"."companyId")`;
const spaceProperty = sql<CulturePropertyReference | null>`(SELECT to_jsonb(r) FROM "RealEstate" r WHERE r.id = "CulturaEspaco"."realEstateId")`;
const spaceAsset = sql<CultureAssetReference | null>`(SELECT to_jsonb(a) || jsonb_build_object('realEstate', (SELECT to_jsonb(r) FROM "RealEstate" r WHERE r.id=a."realEstateId")) FROM "Asset" a WHERE a.id="CulturaEspaco"."assetId")`;
const spaceEmployee = sql<CultureEmployeeReference | null>`(SELECT jsonb_build_object('id', e.id, 'name', e.name, 'registration', e.registration) FROM "Employee" e WHERE e.id="CulturaEspaco"."responsibleEmployeeId")`;
const eventSpace = sql<CulturalEventView["space"]>`(SELECT to_jsonb(s) || jsonb_build_object('realEstate', (SELECT to_jsonb(r) FROM "RealEstate" r WHERE r.id=s."realEstateId")) FROM "CulturaEspaco" s WHERE s.id="CulturaEvento"."spaceId")`;

export async function getCultureTotals(db: DatabaseExecutor): Promise<[number, number, number]> {
  const [agents, spaces, events] = await Promise.all([db.select({ value: count() }).from(culturalAgents).where(eq(culturalAgents.active, true)), db.select({ value: count() }).from(culturalSpaces).where(eq(culturalSpaces.active, true)), db.select({ value: count() }).from(culturalEvents).where(eq(culturalEvents.active, true))]);
  return [agents[0].value, spaces[0].value, events[0].value];
}
export async function getCulturalManagement(db: DatabaseExecutor): Promise<[CulturalAgentView[], CulturalSpaceView[], Array<CulturalHeritage & { asset: Pick<CultureAssetReference, "patrimonyNumber" | "name"> | null; realEstate: CulturePropertyReference | null }>]> {
  return Promise.all([
    db.select({ ...getTableColumns(culturalAgents), person: agentPerson, company: agentCompany }).from(culturalAgents).orderBy(asc(culturalAgents.nome)),
    db.select({ ...getTableColumns(culturalSpaces), asset: spaceAsset, realEstate: spaceProperty, responsibleEmployee: spaceEmployee }).from(culturalSpaces).orderBy(asc(culturalSpaces.nome)),
    db.select({ ...getTableColumns(culturalHeritages), asset: sql<Pick<CultureAssetReference, "patrimonyNumber" | "name"> | null>`(SELECT to_jsonb(a) FROM "Asset" a WHERE a.id="CulturaPatrimonio"."assetId")`, realEstate: sql<CulturePropertyReference | null>`(SELECT to_jsonb(r) FROM "RealEstate" r WHERE r.id="CulturaPatrimonio"."realEstateId")` }).from(culturalHeritages).orderBy(asc(culturalHeritages.nome)),
  ]);
}
export async function listCulturalProjects(db: DatabaseExecutor): Promise<CulturalProjectView[]> {
  return db.select({ ...getTableColumns(culturalProjects),
    agente: sql<CulturalProjectView["agente"]>`(SELECT to_jsonb(a) || jsonb_build_object('person', (SELECT to_jsonb(p) FROM "Person" p WHERE p.id=a."personId"), 'company', (SELECT to_jsonb(c) FROM "Company" c WHERE c.id=a."companyId")) FROM "CulturaAgente" a WHERE a.id="CulturaProjeto"."agenteId")`,
    appropriation: sql<{ id: string; code: string } | null>`(SELECT jsonb_build_object('id', b.id, 'code', b.code) FROM "BudgetAppropriation" b WHERE b.id="CulturaProjeto"."appropriationId")`,
    commitment: sql<{ id: string; number: string } | null>`(SELECT jsonb_build_object('id', c.id, 'number', c.number) FROM "Commitment" c WHERE c.id="CulturaProjeto"."commitmentId")`,
    purchaseProcess: sql<{ id: string; number: string } | null>`(SELECT jsonb_build_object('id', p.id, 'number', p.number) FROM "PurchaseProcess" p WHERE p.id="CulturaProjeto"."purchaseProcessId")`,
    contract: sql<{ id: string; number: string } | null>`(SELECT jsonb_build_object('id', c.id, 'number', c.number) FROM "Contract" c WHERE c.id="CulturaProjeto"."contractId")`,
    documentos: sql<Array<{ id: string }>>`COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id)) FROM "CulturaProjetoDocumento" d WHERE d."projectId"="CulturaProjeto".id), '[]'::jsonb)`,
  }).from(culturalProjects).orderBy(desc(culturalProjects.createdAt));
}
export async function listCulturalEvents(db: DatabaseExecutor): Promise<CulturalEventView[]> {
  const [events, reservations] = await Promise.all([
    db.select({ ...getTableColumns(culturalEvents), space: eventSpace,
      responsibleEmployee: sql<CultureEmployeeReference | null>`(SELECT jsonb_build_object('id', e.id, 'name', e.name, 'registration', e.registration) FROM "Employee" e WHERE e.id="CulturaEvento"."responsibleEmployeeId")`,
      project: sql<CulturalEventView["project"]>`(SELECT jsonb_build_object('id', p.id, 'numero', p.numero, 'nome', p.nome, 'categoria', p.categoria, 'status', p.status, 'agente', (SELECT jsonb_build_object('id', a.id, 'nome', a.nome, 'tipo', a.tipo) FROM "CulturaAgente" a WHERE a.id=p."agenteId")) FROM "CulturaProjeto" p WHERE p.id="CulturaEvento"."projectId")`,
      documentos: sql<CulturalEventView["documentos"]>`COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'purpose', l.purpose, 'document', jsonb_build_object('id', d.id, 'title', d.title, 'documentType', d."documentType", 'fileUrl', d."fileUrl", 'status', d.status))) FROM "CulturaEventoDocumento" l JOIN "Document" d ON d.id=l."documentId" WHERE l."eventId"="CulturaEvento".id), '[]'::jsonb)`,
    }).from(culturalEvents).orderBy(asc(culturalEvents.data)),
    db.select({ id: culturalReservations.id, eventId: culturalReservations.eventId, startsAt: culturalReservations.startsAt, endsAt: culturalReservations.endsAt, purpose: culturalReservations.purpose, status: culturalReservations.status, space: { id: culturalSpaces.id, nome: culturalSpaces.nome } }).from(culturalReservations).innerJoin(culturalSpaces, eq(culturalReservations.spaceId, culturalSpaces.id)),
  ]);
  return events.map(event => ({ ...event, reservas: reservations.filter(reservation => reservation.eventId === event.id).map(reservation => ({ id: reservation.id, startsAt: reservation.startsAt, endsAt: reservation.endsAt, purpose: reservation.purpose, status: reservation.status, space: reservation.space })) }));
}
export async function listCulturalReservations(db: DatabaseExecutor): Promise<CulturalReservationView[]> {
  return db.select({ ...getTableColumns(culturalReservations),
    space: sql<CulturalReservationView["space"]>`(SELECT to_jsonb(s) || jsonb_build_object('realEstate', (SELECT to_jsonb(r) FROM "RealEstate" r WHERE r.id=s."realEstateId")) FROM "CulturaEspaco" s WHERE s.id="CulturaReserva"."spaceId")`,
    person: sql<CulturalReservationView["person"]>`(SELECT jsonb_build_object('fullName', p."fullName", 'cpf', p.cpf) FROM "Person" p WHERE p.id="CulturaReserva"."personId")`,
    company: sql<CulturalReservationView["company"]>`(SELECT jsonb_build_object('corporateName', c."corporateName", 'tradeName', c."tradeName", 'cnpj', c.cnpj) FROM "Company" c WHERE c.id="CulturaReserva"."companyId")`,
    event: sql<CulturalReservationView["event"]>`(SELECT jsonb_build_object('nome', e.nome, 'tipo', e.tipo, 'status', e.status) FROM "CulturaEvento" e WHERE e.id="CulturaReserva"."eventId")`,
    documentos: sql<CulturalReservationView["documentos"]>`COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'purpose', l.purpose, 'document', jsonb_build_object('title', d.title, 'documentType', d."documentType", 'status', d.status)) ORDER BY l."createdAt" DESC) FROM "CulturaReservaDocumento" l JOIN "Document" d ON d.id=l."documentId" WHERE l."reservationId"="CulturaReserva".id), '[]'::jsonb)`,
  }).from(culturalReservations).orderBy(asc(culturalReservations.startsAt), desc(culturalReservations.createdAt));
}
export async function listCulturalActivities(db: DatabaseExecutor): Promise<CulturalActivityView[]> {
  return db.select({ ...getTableColumns(culturalActivities),
    space: sql<CultureSpaceReference | null>`(SELECT to_jsonb(s) || jsonb_build_object('realEstate', (SELECT to_jsonb(r) FROM "RealEstate" r WHERE r.id=s."realEstateId"), 'asset', (SELECT to_jsonb(a) || jsonb_build_object('realEstate', (SELECT to_jsonb(r) FROM "RealEstate" r WHERE r.id=a."realEstateId")) FROM "Asset" a WHERE a.id=s."assetId")) FROM "CulturaEspaco" s WHERE s.id="CulturaAtividade"."spaceId")`,
    instructorEmployee: sql<CulturalActivityView["instructorEmployee"]>`(SELECT jsonb_build_object('name', e.name) FROM "Employee" e WHERE e.id="CulturaAtividade"."instructorEmployeeId")`,
    agent: sql<CulturalActivityView["agent"]>`(SELECT to_jsonb(a) || jsonb_build_object('person', (SELECT to_jsonb(p) FROM "Person" p WHERE p.id=a."personId"), 'company', (SELECT to_jsonb(c) FROM "Company" c WHERE c.id=a."companyId")) FROM "CulturaAgente" a WHERE a.id="CulturaAtividade"."agentId")`,
  }).from(culturalActivities).orderBy(desc(culturalActivities.active), desc(culturalActivities.startsAt));
}
export async function listCulturalDocuments(db: DatabaseExecutor): Promise<Array<{ id: string; purpose: string; ownerType: string; ownerName: string; createdAt: string; document: Pick<CultureDocumentReference, "title" | "documentType" | "status" | "folder"> }>> {
  const result = await db.execute<{ id: string; purpose: string; ownerType: string; ownerName: string; createdAt: Date | string; document: Pick<CultureDocumentReference, "title" | "documentType" | "status" | "folder"> }>(sql`
    SELECT l.id, l.purpose, l."ownerType", l."ownerName", l."createdAt", jsonb_build_object('title', d.title, 'documentType', d."documentType", 'status', d.status, 'folder', CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object('name', f.name) END) AS document
    FROM (
      SELECT l.id, l.purpose, l."createdAt", l."documentId", 'Evento' AS "ownerType", e.nome AS "ownerName" FROM "CulturaEventoDocumento" l JOIN "CulturaEvento" e ON e.id=l."eventId"
      UNION ALL SELECT l.id, l.purpose, l."createdAt", l."documentId", 'Projeto', p.numero || ' - ' || p.nome FROM "CulturaProjetoDocumento" l JOIN "CulturaProjeto" p ON p.id=l."projectId"
      UNION ALL SELECT l.id, l.purpose, l."createdAt", l."documentId", 'Reserva', r.purpose || ' - ' || s.nome FROM "CulturaReservaDocumento" l JOIN "CulturaReserva" r ON r.id=l."reservationId" JOIN "CulturaEspaco" s ON s.id=r."spaceId"
      UNION ALL SELECT l.id, l.purpose, l."createdAt", l."documentId", 'Conselho', c.nome FROM "CulturaConselhoDocumento" l JOIN "CulturaConselho" c ON c.id=l."councilId"
    ) l JOIN "Document" d ON d.id=l."documentId" LEFT JOIN "Folder" f ON f.id=d."folderId" ORDER BY l."createdAt" DESC`);
  return result.rows.map(row => ({ ...row, createdAt: databaseTimestamp(row.createdAt).toISOString() }));
}
export async function listCulturalCouncilsAndFunds(db: DatabaseExecutor, q: string, showCouncils: boolean, showFunds: boolean): Promise<[CulturalCouncilView[], CulturalFundView[]]> {
  const term = `%${q}%`;
  const [councils, funds] = await Promise.all([
    showCouncils ? db.execute<CulturalCouncilView>(sql`SELECT c.*, COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'purpose', l.purpose, 'document', jsonb_build_object('title', d.title, 'documentType', d."documentType")) ORDER BY l."createdAt" DESC) FROM "CulturaConselhoDocumento" l JOIN "Document" d ON d.id=l."documentId" WHERE l."councilId"=c.id), '[]'::jsonb) AS documentos
      FROM "CulturaConselho" c WHERE ${!q} OR c.nome ILIKE ${term} OR c.tipo ILIKE ${term} OR c.status ILIKE ${term} OR c.responsavel ILIKE ${term} OR EXISTS (SELECT 1 FROM "CulturaConselhoDocumento" l JOIN "Document" d ON d.id=l."documentId" WHERE l."councilId"=c.id AND (l.purpose ILIKE ${term} OR d.title ILIKE ${term})) ORDER BY c.nome ASC`).then(result => result.rows) : [],
    showFunds ? db.execute<CulturalFundView>(sql`SELECT f.*, CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('code', a.code, 'financialYear', jsonb_build_object('year', y.year), 'budgetUnit', jsonb_build_object('code', u.code, 'name', u.name), 'resourceSource', jsonb_build_object('code', r.code, 'name', r.name), 'expenseNature', jsonb_build_object('code', n.code, 'name', n.name)) END AS appropriation
      FROM "CulturaFundo" f LEFT JOIN "BudgetAppropriation" a ON a.id=f."appropriationId" LEFT JOIN "FinancialYear" y ON y.id=a."financialYearId" LEFT JOIN "BudgetUnit" u ON u.id=a."budgetUnitId" LEFT JOIN "ResourceSource" r ON r.id=a."resourceSourceId" LEFT JOIN "ExpenseNature" n ON n.id=a."expenseNatureId"
      WHERE ${!q} OR f.nome ILIKE ${term} OR f.status ILIKE ${term} OR f.descricao ILIKE ${term} OR a.code ILIKE ${term} ORDER BY f.nome ASC`).then(result => result.rows) : [],
  ]);
  return [councils, funds];
}
