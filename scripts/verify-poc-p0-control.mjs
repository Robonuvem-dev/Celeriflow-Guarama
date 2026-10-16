import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const {manifest,requirements} = JSON.parse(readFileSync('docs/poc-p0/CONTROLE_REQUISITOS.json','utf8'));
assert.equal(requirements.length,1052);
assert.equal(new Set(requirements.map((r)=>r.id)).size,1052);
assert.equal(manifest.checklists.length,15);
assert.equal(manifest.pdf.hash,hash(manifest.pdf.path));
assert.match(manifest.commit,/^[a-f0-9]{40}$/);
const baselineSchema=execFileSync('git',['show',`${manifest.commit}:prisma/schema.prisma`],{maxBuffer:16*1024*1024});
const baselineText=baselineSchema.toString('utf8').replaceAll('\r\n','\n');
const baselineHashes=[baselineSchema,baselineText,baselineText.replaceAll('\n','\r\n')].map((content)=>createHash('sha256').update(content).digest('hex'));
assert.ok(baselineHashes.includes(manifest.schemaHash),'Schema da baseline P0 diverge do commit preservado');
assert.equal(requirements.filter((r)=>r.prior).length,265);
for (const checklist of manifest.checklists) {
  const rows=requirements.filter((r)=>r.checklist===checklist.code);
  assert.equal(rows.length,checklist.total);
  assert.deepEqual(rows.map((r)=>r.number),Array.from({length:checklist.total},(_,i)=>i+1));
  assert.ok(existsSync(`docs/poc-p0/${checklist.code}.md`));
}
for (const r of requirements) {
  assert.ok(r.requirement.length>15,`${r.id}: texto ausente`);
  assert.ok(r.source.startPage>0);
  assert.ok(r.source.endPage>=r.source.startPage);
  assert.ok(r.phases.length>0);
  assert.ok(!/^P\d+(?:, P\d+)*$/.test(r.gap),`${r.id}: gap contém somente fases`);
  assert.equal(r.status,'NÃO VERIFICADO');
  assert.equal(r.acceptance,'NÃO_EXECUTADO');
  for (const e of [...r.evidence.candidates,...r.evidence.models,...r.evidence.tests]) assert.ok(existsSync(e.path),`${r.id}: caminho inexistente ${e.path}`);
  for (const ref of r.documents) assert.ok(/^\d{3}$/.test(ref.id));
}
const sources=JSON.parse(readFileSync('docs/poc-p0/FONTES_DOCUMENTAIS.json','utf8')).documents;
assert.equal(sources.length,141);
assert.equal(sources.filter((r)=>!r.excluded).length,136);
for(const r of requirements) for(const ref of r.documents) assert.ok(sources.some((s)=>s.id===ref.id&&!s.excluded));
console.log('P0: 1.052 IDs/15 checklists, 265 controles reaproveitados, 141 fontes (136 distintas), hashes, sequências e referências conferidos. Nenhum aceite operacional promovido.');
