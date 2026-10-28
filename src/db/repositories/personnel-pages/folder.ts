import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../transaction';
import { employees } from '../../schema/administration';
import { people } from '../../schema/people';
import { documents } from '../../schema/registry';
import { personnelActs } from '../../schema/personnel-records';
import { hrEmploymentContracts, hrRightEntries, hrIntegrationEvents } from '../../schema/personnel-workforce';
import type { Employee, EmploymentContract, PersonnelAct, IntegrationEvent, RightEntry } from '@/lib/contracts/personnel-pages';
import { personnelPageNumber } from './requests';

export async function readFolderEmployee(db: DatabaseExecutor, id: string): Promise<Employee & { person: { id: string; fullName: string } | null }> {
  const [row] = await db.select({ employee: employees, person: { id: people.id, fullName: people.fullName } }).from(employees).leftJoin(people, eq(people.id, employees.personId)).where(eq(employees.id, id)).limit(1);
  if (!row) throw new Error('Servidor não encontrado.');
  return { ...row.employee, person: row.person };
}
type FolderDocument = { id: string; title: string; documentType: string; status: string; validUntil: Date | null };
type FolderPage = { total: number; page: number; contracts: EmploymentContract[]; acts: Array<Pick<PersonnelAct, 'id' | 'type' | 'actNumber' | 'date'>>; documents: FolderDocument[]; occurrences: IntegrationEvent[]; cancellations: Array<{ sourceKey: string }>; rights: Array<RightEntry & { contract: { registration: string } }> };
export async function readFolderPage(db: DatabaseExecutor, input: { id: string; personId: string | null; tab: string; q: string; page?: string; documentsAllowed: boolean }): Promise<FolderPage> {
  const { id, q, tab, documentsAllowed } = input;
  const contractWhere = and(eq(hrEmploymentContracts.employeeId, id), q ? ilike(hrEmploymentContracts.registration, `%${q}%`) : undefined);
  const actWhere = and(eq(personnelActs.employeeId, id), q ? or(ilike(personnelActs.type, `%${q}%`), ilike(personnelActs.actNumber, `%${q}%`)) : undefined);
  const documentWhere = and(eq(documents.personId, input.personId || ''), sql`NOT EXISTS (SELECT 1 FROM "HealthClinicalDocument" c WHERE c."documentId"=${documents.id})`, sql`NOT EXISTS (SELECT 1 FROM "HealthStandardDocument" s WHERE s."documentId"=${documents.id})`, sql`NOT EXISTS (SELECT 1 FROM "SstCertificateDocument" c WHERE c."documentId"=${documents.id})`, q ? or(ilike(documents.title, `%${q}%`), ilike(documents.documentType, `%${q}%`)) : undefined);
  const occurrenceWhere = and(eq(hrIntegrationEvents.eventType, 'OCORRENCIA_FUNCIONAL_REGISTRADA'), sql`${hrIntegrationEvents.payload} #> '{employeeId}' = ${JSON.stringify(id)}::jsonb`, q ? ilike(hrIntegrationEvents.sourceKey, `%${q}%`) : undefined);
  const rightWhere = and(eq(hrEmploymentContracts.employeeId, id), q ? ilike(hrRightEntries.kind, `%${q}%`) : undefined);
  const totals = tab === 'contratos' ? await db.select({ total: count() }).from(hrEmploymentContracts).where(contractWhere) : tab === 'atos' ? await db.select({ total: count() }).from(personnelActs).where(actWhere) : tab === 'documentos' ? documentsAllowed ? await db.select({ total: count() }).from(documents).where(documentWhere) : [{ total: 0 }] : tab === 'ocorrencias' ? await db.select({ total: count() }).from(hrIntegrationEvents).where(occurrenceWhere) : await db.select({ total: count() }).from(hrRightEntries).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrRightEntries.contractId)).where(rightWhere);
  const total = totals[0].total, page = personnelPageNumber(input.page, total), offset = (page - 1) * 20;
  const contracts = tab === 'contratos' ? await db.select().from(hrEmploymentContracts).where(contractWhere).orderBy(asc(hrEmploymentContracts.registration), asc(hrEmploymentContracts.id)).limit(20).offset(offset) : [];
  const acts = tab === 'atos' ? await db.select({ id: personnelActs.id, type: personnelActs.type, actNumber: personnelActs.actNumber, date: personnelActs.date }).from(personnelActs).where(actWhere).orderBy(desc(personnelActs.date), asc(personnelActs.id)).limit(20).offset(offset) : [];
  const documentRows = tab === 'documentos' && documentsAllowed ? await db.select({ id: documents.id, title: documents.title, documentType: documents.documentType, status: documents.status, validUntil: documents.validUntil }).from(documents).where(documentWhere).orderBy(asc(documents.title), asc(documents.id)).limit(20).offset(offset) : [];
  const occurrences = tab === 'ocorrencias' ? await db.select().from(hrIntegrationEvents).where(occurrenceWhere).orderBy(desc(hrIntegrationEvents.createdAt), asc(hrIntegrationEvents.id)).limit(20).offset(offset) : [];
  const cancellations = occurrences.length ? await db.select({ sourceKey: hrIntegrationEvents.sourceKey }).from(hrIntegrationEvents).where(inArray(hrIntegrationEvents.sourceKey, occurrences.map(row => `OCORRENCIA:CANCELAMENTO:${row.id}`))) : [];
  const rights = tab === 'direitos' ? await db.select({ right: hrRightEntries, registration: hrEmploymentContracts.registration }).from(hrRightEntries).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrRightEntries.contractId)).where(rightWhere).orderBy(desc(hrRightEntries.periodStart), asc(hrRightEntries.id)).limit(20).offset(offset) : [];
  return { total, page, contracts, acts, documents: documentRows, occurrences, cancellations, rights: rights.map(({ right, registration }) => ({ ...right, contract: { registration } })) };
}
