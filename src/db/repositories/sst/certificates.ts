import { desc, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { sstCertificates, sstCertificateReasons, sstAssessments, sstCertificateDocuments } from "@/db/schema/sst-certificates";
import { employees } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { documents } from "@/db/schema/registry";
import { sstBudgetUnits } from "@/db/schema/sst-reference";

/** Clinical details loaded only after the caller authorizes the certificate's UG. */
export async function readSstCertificate(database: DatabaseExecutor, id: string) {
  const [row] = await database.select({ certificate: sstCertificates, employee: { name: employees.name, registration: employees.registration }, issuer: { fullName: people.fullName }, reason: sstCertificateReasons, budgetUnit: { name: sstBudgetUnits.name } }).from(sstCertificates).innerJoin(employees, eq(employees.id, sstCertificates.employeeId)).innerJoin(people, eq(people.id, sstCertificates.issuerPersonId)).innerJoin(sstCertificateReasons, eq(sstCertificateReasons.id, sstCertificates.reasonId)).innerJoin(sstBudgetUnits, eq(sstBudgetUnits.id, sstCertificates.budgetUnitId)).where(eq(sstCertificates.id, id));
  if (!row) throw new Error("Atestado não encontrado.");
  const assessments = await database.select({ assessment: sstAssessments, examiner: { fullName: people.fullName } }).from(sstAssessments).innerJoin(people, eq(people.id, sstAssessments.examinerPersonId)).where(eq(sstAssessments.certificateId, id)).orderBy(desc(sstAssessments.assessedAt)).then(rows => rows.map(row => ({ ...row.assessment, examiner: row.examiner })));
  const attachments = await database.select({ link: sstCertificateDocuments, document: { id: documents.id, fileUrl: documents.fileUrl } }).from(sstCertificateDocuments).innerJoin(documents, eq(documents.id, sstCertificateDocuments.documentId)).where(eq(sstCertificateDocuments.certificateId, id)).then(rows => rows.map(row => ({ ...row.link, document: row.document })));
  return { ...row.certificate, cidCodes: row.certificate.cidCodes ?? [], employee: row.employee, issuer: row.issuer, reason: row.reason, budgetUnit: row.budgetUnit, assessments, documents: attachments };
}
