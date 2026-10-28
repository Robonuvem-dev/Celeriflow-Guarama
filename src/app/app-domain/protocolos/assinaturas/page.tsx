import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { db } from "@/db/client";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { documentSignatures, documentVersions } from "@/db/schema/document-workflow";
import { documents } from "@/db/schema/registry";
import { processes, processDocuments } from "@/db/schema/processes";
import { parseProcessListFilters, PROCESS_LIST_PAGE_SIZE, resolveProcessListPage } from "@/lib/protocols/process-listing-policy";
import AssinaturasClient from "./AssinaturasClient";

export const dynamic = "force-dynamic";

type SearchParams = {
  page?: string | string[];
};

export default async function AssinaturasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await getProtocolContext();
  const { user } = context;
  const filters = parseProcessListFilters(await searchParams);
  const scope = protocolScopeCondition(context);
  const where = and(eq(documentSignatures.signerUsuarioId, user.id), eq(documentSignatures.status, "PENDING"), eq(documentVersions.status, "PENDING_SIGNATURE"), sql`EXISTS(SELECT 1 FROM ${processDocuments} JOIN ${processes} ON ${processes.id}=${processDocuments.processId} WHERE ${processDocuments.documentId}=${documentSignatures.documentId} AND ${scope})`);
  const [{ total }] = await db.select({ total: count() }).from(documentSignatures).innerJoin(documentVersions, eq(documentVersions.id, documentSignatures.documentVersionId)).where(where);
  const page = resolveProcessListPage(filters.page, total);
  const rows = await db.select({ id: documentSignatures.id, documentId: documentSignatures.documentId, requestedAt: documentSignatures.requestedAt, document: { title: documents.title, documentType: documents.documentType } }).from(documentSignatures).innerJoin(documentVersions, eq(documentVersions.id, documentSignatures.documentVersionId)).innerJoin(documents, eq(documents.id, documentSignatures.documentId)).where(where).orderBy(asc(documentSignatures.requestedAt), asc(documentSignatures.id)).offset((page - 1) * PROCESS_LIST_PAGE_SIZE).limit(PROCESS_LIST_PAGE_SIZE);
  const links = rows.length ? await db.selectDistinctOn([processDocuments.documentId], { documentId: processDocuments.documentId, process: { id: processes.id, protocolNumber: processes.protocolNumber } }).from(processDocuments).innerJoin(processes, eq(processes.id, processDocuments.processId)).where(and(inArray(processDocuments.documentId, rows.map(row => row.documentId)), scope)).orderBy(asc(processDocuments.documentId), desc(processDocuments.createdAt)) : [];
  const signatures = rows.map(row => ({ ...row, document: { ...row.document, processDocuments: links.filter(link => link.documentId === row.documentId) } }));

  return (
    <AssinaturasClient
      key={"signatures:" + page + ":" + total + ":" + signatures.map((signature) => signature.id).join(",")}
      initialDocuments={signatures.flatMap((signature) => {
        const process = signature.document.processDocuments[0]?.process;
        return process
          ? [{
            signatureId: signature.id,
            id: signature.documentId,
            title: signature.document.title,
            documentType: signature.document.documentType,
            requestedAt: signature.requestedAt,
            process,
          }]
          : [];
      })}
      total={total}
      page={page}
      pageSize={PROCESS_LIST_PAGE_SIZE}
    />
  );
}
