import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { assertArchivedInventory, assertBoundCall, assertDrizzleOnly, assertJsxValues, assertOperationalRenderer, currentSources, migrationProvenance } from './helpers/table-migration-contracts';

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
const pages = currentSources('src/app/app-domain/rh');
const readers = files('src/db/repositories/personnel-pages');
test('RH: proveniência dos 98 TSX preservada; seis adições revisadas e UI atual Drizzle-only', () => {
  const original = migrationProvenance.originalInlineEvidence.personnel;
  assert.equal(original.sourceCommit, '5cfa75dfe20a6d3fcc20dce33e818585cb8b9954');
  assert.equal(original.jsxSha256, '19c3e7885201ca55ae4af58d87062b41944cc27557a1f9d6468fde27434ef951');
  assertArchivedInventory('personnel', pages);
  assertDrizzleOnly(pages, true);
});

test('RH atual: autenticação, executor, action de status e seleção integral conectados à tabela', () => {
  const root = 'src/app/app-domain/rh';
  const page = `${root}/servidores/page.tsx`, row = `${root}/servidores/ServidorRowActions.tsx`;
  assertBoundCall(page, '@/lib/platform/tenant-context', 'getTenantContextForModule', ['"RH"']);
  assertBoundCall(page, '@/db/repositories/personnel-pages/records', 'readEmployeesPage', ['context.database ?? db', '{ q, status, departmentId, page: searchParams?.page }']);
  assertOperationalRenderer(page);
  assertBoundCall(row, './actions', 'toggleServidorStatus', ['employee.id', '!employee.isActive']);
  assertJsxValues(row, 'button', { onClick: 'handleToggleStatus', type: '"button"' });
  assertBoundCall(`${root}/servidores/actions.ts`, '@/lib/platform/tenant-context', 'getTenantContextForModuleOperation', ['"RH"', 'operation']);
  assertOperationalRenderer(`${root}/_components/RhSelectionTable.tsx`, 'RhSelectionTable');
  assertJsxValues(`${root}/_components/RhSelectionTable.tsx`, 'input', { type: '"hidden"', name: 'name', value: 'id' });
  assertOperationalRenderer(`${root}/operacoes/ContractCustomFieldsTable.tsx`, 'ContractCustomFieldsTable');
});

test('RH: páginas, leitores e DTO não importam cliente/tipos legados nem têm queries inline', () => {
  for (const file of [...pages, ...readers, 'src/lib/contracts/personnel-pages.ts']) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /@prisma\/client|Prisma\.|context\.prisma|\$queryRaw|\$transaction/, file);
    if (file.endsWith('.tsx')) assert.doesNotMatch(text, /\b(?:database|executor|db)\.(?:select|execute|query|transaction)\s*[(<]/, file);
  }
});
