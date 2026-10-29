import { and, asc, count, desc, eq, ilike, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { healthStandardDocuments } from "@/db/schema/health-documents";
import { documents as documentTable } from "@/db/schema/registry";
import { documentSignatures, documentVersions } from "@/db/schema/document-workflow";
import { users, modules as moduleTable } from "@/db/schema/identity";
import Link from "next/link";
import { OperationalListFrame, OperationalLinkPagination, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { DocumentsClient, type HealthDocumentRow } from "./DocumentsClient";

type Params = { q?: string | string[]; page?: string | string[]; module?: string | string[]; category?: string | string[]; status?: string | string[] };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const number = (value: string | undefined) => value && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : 1;

export default async function HealthDocumentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const context = await getTenantContextForModule("SAUDE");
  const params = await searchParams;
  const q = (first(params.q) || "").trim().slice(0, 120);
  const moduleCode = (first(params.module) || "").trim().slice(0, 50);
  const category = (first(params.category) || "").trim().slice(0, 50);
  const status = (first(params.status) || "").trim().slice(0, 50);
  const database = context.database ?? db;
  const where = and(eq(healthStandardDocuments.isActive, true), moduleCode ? eq(healthStandardDocuments.moduleCode, moduleCode) : undefined, category ? eq(healthStandardDocuments.category, category) : undefined, status ? eq(documentTable.status, status) : undefined, q ? ilike(documentTable.title, `%${q}%`) : undefined);
  const [{ total }] = await database.select({ total: count() }).from(healthStandardDocuments).innerJoin(documentTable, eq(documentTable.id, healthStandardDocuments.documentId)).where(where);
  const requestedPage = number(first(params.page));
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const [documentRows, modules] = await Promise.all([
    database.select({ id: healthStandardDocuments.id, documentId: healthStandardDocuments.documentId, category: healthStandardDocuments.category, moduleCode: healthStandardDocuments.moduleCode, createdAt: healthStandardDocuments.createdAt, addedByUsuario: { nome: users.nome }, document: { title: documentTable.title, fileUrl: documentTable.fileUrl, status: documentTable.status } }).from(healthStandardDocuments).innerJoin(documentTable, eq(documentTable.id, healthStandardDocuments.documentId)).innerJoin(users, eq(users.id, healthStandardDocuments.addedByUsuarioId)).where(where).orderBy(desc(healthStandardDocuments.createdAt), desc(healthStandardDocuments.id)).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE),
    database.select({ codigo: moduleTable.codigo, nome: moduleTable.nome }).from(moduleTable).where(eq(moduleTable.ativo, true)).orderBy(asc(moduleTable.nome)),
  ]);
  const [versionRows, signatureRows] = await Promise.all([
    database.select({ documentId: documentVersions.documentId, id: documentVersions.id, versionNumber: documentVersions.versionNumber, fileUrl: documentVersions.fileUrl, status: documentVersions.status, finalizedAt: documentVersions.finalizedAt, publicValidationCode: documentVersions.publicValidationCode }).from(documentVersions).where(inArray(documentVersions.documentId, documentRows.map(row => row.documentId))).orderBy(desc(documentVersions.versionNumber)),
    database.select({ documentId: documentSignatures.documentId, id: documentSignatures.id, signerName: documentSignatures.signerName, status: documentSignatures.status, signedAt: documentSignatures.signedAt, provider: documentSignatures.provider, verificationCode: documentSignatures.verificationCode, metadata: documentSignatures.metadata }).from(documentSignatures).where(inArray(documentSignatures.documentId, documentRows.map(row => row.documentId))).orderBy(desc(documentSignatures.requestedAt)),
  ]);
  const documents = documentRows.map(row => ({ ...row, document: { ...row.document,
    versions: versionRows.filter(version => version.documentId === row.documentId).map(version => ({ id: version.id, versionNumber: version.versionNumber, fileUrl: version.fileUrl, status: version.status, finalizedAt: version.finalizedAt, publicValidationCode: version.publicValidationCode })),
    signatures: signatureRows.filter(signature => signature.documentId === row.documentId).map(signature => ({ id: signature.id, signerName: signature.signerName, status: signature.status, signedAt: signature.signedAt, provider: signature.provider, verificationCode: signature.verificationCode, metadata: signature.metadata })),
  } }));
  const rows: HealthDocumentRow[] = documents.map(item => ({ id: item.id, documentId: item.documentId, title: item.document.title, category: item.category, moduleCode: item.moduleCode, fileUrl: item.document.fileUrl, status: item.document.status, createdAt: item.createdAt.toISOString(), addedBy: item.addedByUsuario.nome, versions: item.document.versions.map(version => ({ ...version, finalizedAt: version.finalizedAt.toISOString() })), signatures: item.document.signatures.map(signature => ({ ...signature, signedAt: signature.signedAt?.toISOString() || null })) }));
  const values = { q, module: moduleCode, category, status };
  return <OperationalListFrame label="Documentos da Saúde" actions={<Link href="/saude/administracao">Administração</Link>} toolbar={<><form className={styles.searchForm}><input aria-label="Buscar documento" name="q" defaultValue={q} placeholder="Buscar documento" className={styles.searchInput} /><input type="hidden" name="module" value={moduleCode} /><input type="hidden" name="category" value={category} /><input type="hidden" name="status" value={status} /><button className={styles.filterButton}>Buscar</button></form><OperationalFilters activeCount={[moduleCode, category, status].filter(Boolean).length}><form className={styles.filterFields}><input type="hidden" name="q" value={q} /><label>Módulo<select name="module" defaultValue={moduleCode}><option value="">Todos os módulos</option>{modules.map(module => <option key={module.codigo} value={module.codigo}>{module.nome}</option>)}</select></label><label>Categoria<select name="category" defaultValue={category}><option value="">Todas as categorias</option>{["Procedimento", "Orientação", "Formulário", "Protocolo", "Outro"].map(value => <option key={value}>{value}</option>)}</select></label><label>Situação<select name="status" defaultValue={status}><option value="">Todas as situações</option><option>Válido</option><option>Pendente Assinatura</option><option>Assinado</option></select></label><button>Aplicar</button><Link href="/saude/administracao/documentos">Limpar</Link></form></OperationalFilters></>} pagination={<OperationalLinkPagination page={page} total={total} values={values} />}><DocumentsClient rows={rows} modules={modules.map(module => ({ code: module.codigo, name: module.nome }))} canCreate={canPerformModuleOperation(context.user, "SAUDE", "create")} canUpdate={canPerformModuleOperation(context.user, "SAUDE", "update")} /></OperationalListFrame>;
}
