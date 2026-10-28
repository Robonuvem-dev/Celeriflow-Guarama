import { getTableColumns, sql } from 'drizzle-orm';
import { createDatabaseConnection } from '../src/db/connection';
import { documentFolders } from '../src/db/schema/document-workflow';
import { documents } from '../src/db/schema/registry';

const connection = createDatabaseConnection(process.env.DATABASE_URL!);
const db = connection.db;

async function main() {
  console.log('\n=== FOLDERS ===');
  const folders = await db.select({
    ...getTableColumns(documentFolders),
    _count: sql<{ documents: number; children: number }>`jsonb_build_object('documents', (SELECT count(*) FROM "Document" d WHERE d."folderId"=${documentFolders.id}), 'children', (SELECT count(*) FROM "Folder" f WHERE f."parentId"=${documentFolders.id}))`,
  }).from(documentFolders);
  console.log(JSON.stringify(folders, null, 2));

  console.log('\n=== DOCUMENTS ===');
  const docs = await db.select({ id: documents.id, title: documents.title, documentType: documents.documentType, status: documents.status, folderId: documents.folderId }).from(documents);
  console.log(JSON.stringify(docs, null, 2));
}

main().catch(console.error).finally(() => connection.pool.end());
