const fs = require('fs');

const text = fs.readFileSync('scripts/requisitos_150_source.csv', 'utf8');
const lines = text.trim().split(/\r?\n/);

const items = [];
let currentLine = '';
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim() || line.startsWith('Campo,') || line.startsWith('Origem,') || line.startsWith('Exclus') || line.startsWith('N') || line.startsWith('Candidatos') || line.startsWith('Selecionados') || line.startsWith('Crit') || line.startsWith('Ordena') || line.startsWith('Interpreta') || line.startsWith('Fonte de verdade')) continue;
  
  currentLine += (currentLine ? '\n' : '') + line;
  const quoteCount = (currentLine.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    continue;
  }
  
  const re = /(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|([^,]*))(?:,|$)/g;
  let match;
  const row = [];
  while ((match = re.exec(currentLine)) !== null) {
    if (match.index === re.lastIndex) re.lastIndex++;
    let val = match[1] !== undefined ? match[1].replace(/\"\"/g, '"') : match[2];
    row.push(val);
    if (row.length === 13) break;
  }
  currentLine = '';
  if (row[0] && !isNaN(parseInt(row[0], 10))) {
    items.push({
      prioridade: parseInt(row[0], 10),
      linhaOriginal: row[1],
      modulo: row[2],
      item: row[3],
      descricao: row[4],
      complexidade: row[5],
      pontuacao: row[6],
      tipo: row[7],
      pontosAtencao: row[8],
      criticidade: row[12]
    });
  }
}

console.log('Successfully parsed count:', items.length);
fs.writeFileSync('requisitos_150.json', JSON.stringify(items, null, 2));

const byModulo = {};
items.forEach(p => {
  byModulo[p.modulo] = (byModulo[p.modulo] || 0) + 1;
});
console.log('Requirements by Module:\n', JSON.stringify(byModulo, null, 2));
