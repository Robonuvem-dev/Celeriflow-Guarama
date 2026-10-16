import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// Creates only the P0 evidence pack. It never edits application files or prior matrices.
const source = process.argv[2];
if (!source) throw new Error('Informe o texto extraído do PDF oficial, com marcadores ### PAGINA N.');
const output = 'docs/poc-p0';
const planPath = 'docs/PLANO_CONSOLIDADO_POC_TRIBUTACAO_FINANCEIRO_CONTABIL_CONTROLE_CUSTOS_PLANEJAMENTO.md';
const pdfPath = 'docs/Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf';
const text = readFileSync(source, 'utf8');
const plan = readFileSync(planPath, 'utf8');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const pdfHash = hash(readFileSync(pdfPath));
const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const definitions = [
  ['EXE-01', 0, 99, 'Planejamento e Orçamento', 'planejamento', '### 6.3', '## 7.', ['079','081','082','083','084','085','105'], 'Planejamento'],
  ['LEG-01', 32, 99, 'Planejamento e Orçamento', 'planejamento', '### 6.3', '## 7.', ['079','081','082','083','084','085','105'], 'Planejamento Câmara'],
  ['EXE-02', 1, 189, 'Gestão Contábil e Financeira', 'financeiro', '## 4.', '## 5.', ['008','009','010','011','031','039','045','053','054','105','123','124','125','126','132','133','134'], 'Contabilidade/Tesouraria'],
  ['LEG-02', 33, 189, 'Gestão Contábil e Financeira', 'financeiro', '## 4.', '## 5.', ['008','009','010','011','031','039','045','053','054','105','123','124','125','126','132','133','134'], 'Contabilidade/Tesouraria Câmara'],
  ['EXE-03', 2, 36, 'Gestão de Controle Interno', 'controle', '### 6.1', '### 6.2', ['004','028','077','078','097','109','119','128','130'], 'Controladoria'],
  ['EXE-04', 3, 31, 'Gestão e Controle de Custos', 'custos', '### 6.2', '### 6.3', ['008','053','105','133'], 'Contabilidade/Custos'],
  ['EXE-12', 10, 30, 'Gestão de IPTU', 'tributacao', '### 5.1', '### 5.2', ['108','113','115','140','141'], 'Tributação/IPTU'],
  ['EXE-13', 11, 41, 'Gestão de ISS', 'tributacao', '### 5.2', '### 5.3', ['108','113','115','140','141'], 'Tributação/ISS'],
  ['EXE-14', 12, 26, 'Gestão de ITBI', 'tributacao', '### 5.3', '### 5.4', ['108','115'], 'Tributação/ITBI'],
  ['EXE-15', 13, 9, 'Gestão de Receitas Diversas', 'tributacao', '### 5.4', '### 5.5', ['108','115'], 'Tributação'],
  ['EXE-16', 14, 56, 'Gestão de Arrecadação', 'tributacao', '### 5.5', '### 5.6', ['080','105','113','114','115','140','141'], 'Tributação/Arrecadação'],
  ['EXE-17', 15, 28, 'Gestão de Dívida Ativa', 'tributacao', '### 5.6', '### 5.7', ['080','105','115'], 'Tributação/Procuradoria'],
  ['EXE-24', 21, 59, 'Nota Fiscal Eletrônica', 'tributacao', '### 5.7', '### 5.8', ['108'], 'Tributação/NFS-e'],
  ['EXE-25', 22, 65, 'Gestão e Escrita Fiscal', 'tributacao', '### 5.8', '### 5.9', ['108'], 'Tributação/Escrita Fiscal'],
  ['EXE-26', 23, 95, 'Gestão e Fiscalização Fazendária', 'tributacao', '### 5.9', '## 6.', ['108','080'], 'Fiscalização Fazendária'],
];

let page = 0;
const lines = text.split(/\r?\n/).map((value, index) => {
  const marker = value.match(/^### PAGINA (\d+)/);
  if (marker) page = Number(marker[1]);
  return { value, line: index + 1, page };
});
const headers = lines.flatMap((line, index) => /^MÓDULO:/.test(line.value) ? [index] : []);
if (headers.length !== 41) throw new Error(`Esperados 41 cabeçalhos no PDF; encontrados ${headers.length}.`);
const furniture = /^(### PAGINA |Prefeitura Municipal de Ibema|Av\. Ney Euirson Napoli|Fone: \(45\)|Gestão 2025\/2028|LDO\s+-\s+LEI DE DIRETRIZES|LOA\s+-\s+LEI ORÇAMENTÁRIA)/;

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name).replaceAll('\\', '/');
    return entry.isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}
const inventories = {
  planejamento: [...walk('src/lib/planejamento'), ...walk('src/app/app-domain/planejamento'), ...walk('src/app/app-domain/camara/planejamento')],
  financeiro: [...walk('src/lib/financeiro'), ...walk('src/app/app-domain/financeiro')],
  tributacao: [...walk('src/lib/tributacao'), ...walk('src/app/app-domain/tributacao')],
  controle: [...walk('src/lib/c7'), ...walk('src/lib/platform'), ...walk('src/app/app-domain/auditoria'), ...walk('src/app/app-domain/controle-interno')],
  custos: [...walk('src/lib/financeiro'), ...walk('src/lib/rh'), ...walk('src/lib/almoxarifado'), ...walk('src/lib/patrimonio')],
};
const allPaths = [...new Set([...Object.values(inventories).flat(), ...walk('tests'), ...walk('src/lib/rh')])];
const contents = new Map(allPaths.map((path) => [path, readFileSync(path, 'utf8')]));
const normalizedContents = new Map(allPaths.map((path) => [path, normalize(contents.get(path))]));
const schema = readFileSync('prisma/schema.prisma', 'utf8');
const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((match) => ({ name: match[1], content: match[0], line: schema.slice(0, match.index).split('\n').length }));
const stop = new Set('permitir possibilitar sistema cadastro cadastrar consulta consultar relatorio emitir informar informacao informacoes registro registros dados todas todos para pelo pela como mesmo mesma devera possuir campos campo com dos das por nao aos nas nos seu sua uma ser ter ate ou'.split(' '));
const tokens = (value) => [...new Set(normalize(value).match(/[a-z0-9]{4,}/g) ?? [])].filter((word) => !stop.has(word));
const score = (value, words) => words.reduce((sum, word) => sum + (normalize(value).includes(word) ? 1 : 0), 0);
const normalizedScore = (value, words) => words.reduce((sum,word) => sum + (value.includes(word) ? 1 : 0),0);
const normalizedModels = models.map((m) => ({...m, normalized:normalize(m.content)}));
const references = (paths, words, limit = 4) => paths.map((path) => ({ path, score: normalizedScore(normalizedContents.get(path) ?? '', words) })).filter((item) => item.score > 0).sort((a,b) => b.score-a.score || a.path.localeCompare(b.path)).slice(0,limit).map(({path}) => {
  const content = contents.get(path);
  const sourceLines = content.split('\n');
  const n = sourceLines.findIndex((line) => score(line, words) > 0);
  return { path, line: n + 1, classification: 'CANDIDATO_ESTÁTICO', snippet: sourceLines[n]?.trim().slice(0,220) };
});
const priorCosts = readFileSync('docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md', 'utf8');
const catalog = readFileSync('docs/CATALOGO_NOVOS_DOCUMENTOS_IBEMA.md', 'utf8');
const documents = [...catalog.matchAll(/^\| (\d{3}) \| (.+?) \| (.+?) \| (.+?) \|$/gm)].map((m) => ({ id: m[1], file: m[2], application: m[3], fieldsAndLimits: m[4], excluded: m[2].includes('excluído') }));
const classifyDocument = (id) => ['079','081','082','083','084','085','080','108'].includes(id) ? 'PARÂMETRO_LEGAL_A_CONFIRMAR' : ['105'].includes(id) ? 'CATÁLOGO' : ['008','009','053','113','114','115','140','141','132','133','134'].includes(id) ? 'DADO_AGREGADO_OU_EVENTO_A_RECONCILIAR' : 'MODELO_E_HISTÓRICO';
const records = [];
const checklists = [];
for (const [code, moduleIndex, expected, title, domain, start, end, docIds, owner] of definitions) {
  const first = headers[moduleIndex];
  const last = headers[moduleIndex+1] ?? lines.length;
  const block = lines.slice(first + 1, last);
  const itemStarts = block.flatMap((line,index) => /^\s*\d+\.\s+/.test(line.value) ? [index] : []);
  const section = plan.slice(plan.indexOf(start), plan.indexOf(end, plan.indexOf(start)));
  const groups = [...section.matchAll(/^\| (\d+)(?:–(\d+))? \| (.+) \|$/gm)].map((m) => ({ first: +m[1], last: +(m[2] ?? m[1]), columns: m[3].split(' | ') }));
  const priorPlanningPath = code.endsWith('-01') ? `docs/EVIDENCIAS_PLANEJAMENTO_${code.startsWith('LEG') ? 'CAMARA' : 'PREFEITURA'}.md` : null;
  const priorPlanning = priorPlanningPath ? readFileSync(priorPlanningPath,'utf8') : '';
  const items = itemStarts.map((offset,index) => {
    const itemLines = block.slice(offset,itemStarts[index+1] ?? block.length);
    const number = +itemLines[0].value.match(/^\s*(\d+)\./)[1];
    const cleaned = itemLines.filter((line) => !furniture.test(line.value)).map((line) => line.value.trim()).filter(Boolean);
    cleaned[0] = cleaned[0].replace(/^\d+\.\s*/, '');
    const requirement = cleaned.join('\n');
    const words = tokens(requirement);
    const group = groups.find((g) => number >= g.first && number <= g.last);
    if (!group) throw new Error(`Item ${code}.${number} sem grupo no plano.`);
    const candidates = references(inventories[domain], words);
    const services = candidates.filter((r) => r.path.startsWith('src/lib/'));
    const symbols = services.flatMap((r) => [...contents.get(r.path).matchAll(/export (?:async )?function (\w+)/g)].map((m) => ({ symbol: m[1], path: r.path })).filter((r) => score(r.symbol, words) > 0)).slice(0,4);
    const consumers = symbols.map((s) => ({ ...s, usages: allPaths.filter((p) => p !== s.path && contents.get(p).includes(s.symbol)).map((path) => ({path, line: contents.get(path).slice(0,contents.get(path).indexOf(s.symbol)).split('\n').length})) }));
    const modelCandidates = normalizedModels.map((m) => ({ ...m, score: normalizedScore(m.normalized,words) })).filter((m) => m.score > 0).sort((a,b) => b.score-a.score).slice(0,3).map((m) => ({model:m.name, path:'prisma/schema.prisma', line:m.line, classification:'CANDIDATO_ESTÁTICO'}));
    const legacyId = `${code}.${number}`;
    const priorLine = priorPlanning.split('\n').find((line) => line.startsWith(`| ${legacyId} |`)) ?? priorCosts.split('\n').find((line) => line.startsWith(`| ${code}.${String(number).padStart(2,'0')} |`));
    const priorColumns = priorLine?.split('|').map((v) => v.trim()).filter(Boolean);
    const expandedStages = group.columns.at(-1).replace(/P(\d+)–P(\d+)/g, (_,from,to) => Array.from({length:Number(to)-Number(from)+1},(_,i)=>`P${Number(from)+i}`).join(', '));
    const stages = expandedStages.match(/P\d+/g) ?? [];
    return {
      id: legacyId, checklist: code, number, title, entity: code.startsWith('LEG') ? 'CÂMARA' : 'PREFEITURA',
      requirement, source: { pdf:pdfPath, pdfHash, startPage:itemLines[0].page, endPage:itemLines.at(-1).page, extractionLines:[itemLines[0].line,itemLines.at(-1).line] },
      subcriteria: requirement.split(/\n(?=[a-z]\))/).map((value,index) => ({index:index+1, text:value, result:'NÃO_EXECUTADO'})),
      status:'NÃO VERIFICADO', acceptance:'NÃO_EXECUTADO', diagnosticGroup:group.columns[1],
      gap:group.columns.length >= 4 ? group.columns[2] : group.columns[1], phases:[...new Set(stages)], dependsOn:['P0: fonte/roteiro', ...stages.filter((s) => !['P0','P11'].includes(s))],
      owner:{role:owner, person:null, assignment:'A_DESIGNAR'},
      evidence:{ candidates, models:modelCandidates, producerConsumers:consumers, tests:references(allPaths.filter((p) => p.startsWith('tests/')),words,2), proof:null },
      routes:candidates.filter((r) => r.path.startsWith('src/app/app-domain/') && r.path.endsWith('/page.tsx')).map((r) => r.path.replace('src/app/app-domain','').replace('/page.tsx','')),
      documents:docIds.map((id) => ({id, use:classifyDocument(id), scope:code.startsWith('LEG') ? 'REFERÊNCIA DO EXECUTIVO; OBTER FONTE DA CÂMARA' : 'REFERÊNCIA; NÃO CARGA OPERACIONAL'})),
      prior:priorLine ? {path:priorPlanningPath ?? 'docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md', line:priorLine, scenario:priorColumns[2], expectedProof:priorColumns[3]} : null,
      acceptanceScenario:{ setup:'Instância isolada, ente/UG e perfil autorizados, versão/dataset registrados.', steps:priorColumns?.[3] && !priorPlanningPath ? priorColumns[3] : 'Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.', expected:requirement.replaceAll('\n',' '), evidence:[], executor:null, date:null },
    };
  });
  if (items.length !== expected || items.some((item,index) => item.number !== index+1)) throw new Error(`Sequência inválida: ${code}: ${items.map((item) => item.number).join(',')}`);
  checklists.push({code,title,entity:items[0].entity,total:expected,acceptance:0,sourcePages:[items[0].source.startPage,items.at(-1).source.endPage]});
  records.push(...items);
}
if (records.length !== 1052 || new Set(records.map((r) => r.id)).size !== 1052) throw new Error('Cobertura inválida.');
const migrations = readdirSync('prisma/migrations-ibema',{withFileTypes:true}).filter((e) => e.isDirectory()).map((e) => ({name:e.name,hash:hash(readFileSync(`prisma/migrations-ibema/${e.name}/migration.sql`)), status:'AGUARDA_INVENTÁRIO_ISOLADO'})).sort((a,b) => a.name.localeCompare(b.name));
const manifest = { phase:'P0',generatedAt:new Date().toISOString(),commit,gitStatusAtStart:execFileSync('git',['status','--short'],{encoding:'utf8'}).trim(), pdf:{path:pdfPath,hash:pdfHash},extractionHash:hash(text),planHash:hash(plan),schemaHash:hash(schema),checklists,migrations,counts:{requirements:records.length,priorMatricesReused:records.filter((r) => r.prior).length},method:'Texto integral extraído do PDF; buscas lexicais são candidatos, não evidência de atendimento. Diagnóstico herdado por faixa não é veredito individual. Subcritérios alfabéticos separados; demais orações permanecem integrais e exigem conferência no ensaio.'};
mkdirSync(output,{recursive:true});
writeFileSync(`${output}/CONTROLE_REQUISITOS.json`,JSON.stringify({manifest,requirements:records},null,2)+'\n');
writeFileSync(`${output}/BASELINE.json`,JSON.stringify(manifest,null,2)+'\n');
writeFileSync(`${output}/FONTES_DOCUMENTAIS.json`,JSON.stringify({documents:documents.map((d) => ({...d,use:classifyDocument(d.id),requirementIds:records.filter((r) => r.documents.some((ref) => ref.id===d.id)).map((r) => r.id)}))},null,2)+'\n');
const escape = (value) => String(value ?? '').replaceAll('|','\\|').replaceAll('\n','<br>');
for (const checklist of checklists) {
  const items = records.filter((r) => r.checklist===checklist.code);
  const intro = `# P0 — ${checklist.code}: ${checklist.title}\n\nEnte: **${checklist.entity}**. ${items.length} itens; **nenhum aceite executado nesta fase**. Revisão: ${commit}.\n\nTexto extraído do PDF local; conferir o original para layouts, listas e paginação. Busca estática indica onde investigar, não comprova atendimento. A matriz individual editável, com fontes, modelos, consumidores, testes e roteiro, está em [CONTROLE_REQUISITOS.json](CONTROLE_REQUISITOS.json). Diagnósticos e gaps abaixo são herdados da faixa do plano; validar cada subcritério antes de abrir desenvolvimento.\n\n`;
  writeFileSync(`${output}/${checklist.code}.md`,intro + items.map((r) => `## ${r.id}\n\n**Fonte:** PDF p.${r.source.startPage}–${r.source.endPage}. **Status:** ${r.status}. **Aceite:** ${r.acceptance}.\n\n${r.requirement}\n\n- **Diagnóstico da faixa:** ${r.diagnosticGroup}\n- **Gap a conferir:** ${r.gap}\n- **Fases:** ${r.phases.join(', ')}. **Responsável funcional:** ${r.owner.role} (pessoa a designar).\n- **Fontes municipais:** ${r.documents.map((d) => d.id).join(', ')}${checklist.code.startsWith('LEG') ? ' (referências do Executivo; obter fontes da Câmara)' : ''}.\n- **Base candidata:** ${r.evidence.candidates.map((e) => `${e.path}:${e.line}`).join('; ') || 'Não localizada por busca lexical; investigar antes de classificar ausência.'}\n- **Reuso:** ${r.prior ? r.prior.path+' — '+r.prior.scenario : 'Novo controle individual; diagnóstico consolidado preservado.'}\n- **Aceite esperado:** ${r.acceptanceScenario.steps}\n`).join('\n'));
}
writeFileSync(`${output}/INDICE.md`, '# P0 — controle individual dos checklists\n\n**1.052 requisitos / 15 checklists. Aceites operacionais: não executados.**\n\n| Checklist | Ente | Itens | Controle |\n|---|---|---:|---|\n'+checklists.map((c) => `| ${c.code} — ${escape(c.title)} | ${c.entity} | ${c.total} | [Abrir](${c.code}.md) |`).join('\n')+'\n\n[Baseline/revisão e migrations](BASELINE.json) · [Controle editável](CONTROLE_REQUISITOS.json) · [Fontes documentais](FONTES_DOCUMENTAIS.json)\n\nNão regenerar o controle após inserir resultados de ensaio sem preservar a revisão anterior. A geração é uma fotografia inicial, não sincronizador de evidências manuais.\n');
console.log(JSON.stringify({requirements:records.length,checklists:checklists.length,reused:manifest.counts.priorMatricesReused,migrations:migrations.length,output},null,2));
