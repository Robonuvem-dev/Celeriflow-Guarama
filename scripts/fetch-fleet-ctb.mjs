import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const base = "https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-contran/resolucoes/";
const archives = ["mbftpart1.zip", "MBFTpart2.zip", "MBFTpart3.zip", "mbftpart4.zip", "MBFTpart5.zip", "MBFTpart6.zip", "MBFTpart7.zip"];
const amendments = ["RESOLUCAO_CONTRAN_N_1.003__ANEXO.pdf", "Resolucao10092024.pdf", "Resolucao10122024.pdf", "Resolucao10132024.pdf", "resolucao10222026c.pdf", "resolucao10232026c.pdf"];
const directory = join(process.cwd(), "data", "frotas");
if (!existsSync(directory)) throw new Error("Diretório data/frotas não encontrado.");
const cache = join(process.cwd(), ".next", "cache", "fleet-ctb-source");
mkdirSync(cache, { recursive: true });
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fold = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
const labels = ["Tipificação Resumida", "Código do Enquadramento", "Amparo Legal", "Tipificação do Enquadramento", "Gravidade", "Penalidade", "Medida Administrativa", "Pode Configurar Crime", "Infrator", "Competência", "Pontuação", "Constatação da Infração", "Quando Autuar", "Quando NÃO Autuar", "Definições e Procedimentos"];
function cell(items, label) {
  const target = items.find(item => fold(item.str).startsWith(fold(label)));
  if (!target) return "";
  const x = target.transform[4], y = target.transform[5];
  const captions = items.filter(item => labels.some(name => fold(item.str).startsWith(fold(name))));
  const right = Math.min(620, ...captions.filter(item => Math.abs(item.transform[5] - y) < 4 && item.transform[4] > x + 15).map(item => item.transform[4]));
  const bottom = Math.max(0, ...captions.filter(item => item.transform[5] < y - 5 && item.transform[4] >= x - 5 && item.transform[4] < right - 2).map(item => item.transform[5]));
  return items.filter(item => item.str.trim() && item.transform[4] >= x - 5 && item.transform[4] < right - 2 && item.transform[5] < y - 5 && item.transform[5] > bottom + 2).sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]).map(item => item.str).join(" ").replace(/\s+/g, " ").trim();
}
const entries = new Map(), sources = [], failures = [];
async function extract(bytes, source, filename, required) {
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, verbosity: 0 });
  const pdf = await loading.promise;
  let found = 0;
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number), content = await page.getTextContent();
    const originalItems = content.items.filter(item => "str" in item);
    const joinedCaptions = originalItems.filter(item => fold(item.str) && item.str.trim().length < 16 && !labels.some(label => fold(item.str).startsWith(fold(label)))).flatMap(item => {
      const phrase = originalItems.filter(next => Math.abs(next.transform[5] - item.transform[5]) < 1 && next.transform[4] >= item.transform[4] && next.transform[4] < item.transform[4] + 180).sort((a, b) => a.transform[4] - b.transform[4]).map(next => next.str).join(" ");
      const label = labels.find(name => fold(phrase).startsWith(fold(name)));
      return label ? [{ ...item, str: label + ":" }] : [];
    });
    const items = [...originalItems, ...joinedCaptions];
    if (!items.some(item => fold(item.str).startsWith("tipificacaoresumida"))) continue;
    const codeMatch = (cell(items, "Código do Enquadramento") || filename).match(/\b(\d{3})\s*-?\s*(\d{2})\b/);
    const name = cell(items, "Tipificação Resumida").replace(/\s+\d{3}\s*-\s*\d{2}\s*$/, ""), article = cell(items, "Amparo Legal");
    const gravity = fold(cell(items, "Gravidade"));
    const nature = gravity.includes("gravissima") ? "GRAVISSIMA" : gravity.includes("grave") ? "GRAVE" : gravity.includes("media") ? "MEDIA" : gravity.includes("leve") ? "LEVE" : gravity.includes("naoaplicavel") ? "NAO_APLICAVEL" : null;
    if (!codeMatch || !name || !article || !nature) { failures.push(`${filename}: página ${number} sem campos completos: ${JSON.stringify({ code: cell(items, "Código do Enquadramento"), name, article, gravity })}`); continue; }
    const pointsText = cell(items, "Pontuação"), penalty = cell(items, "Penalidade");
    const pointMatch = pointsText.match(/\b([0-7])\b/), multiplier = Number(penalty.match(/\b(\d+)\s*(?:x|vezes)\b/i)?.[1] || 1);
    const points = /nao.*comput|nao.*aplic|sem.*pont/i.test(fold(pointsText)) ? 0 : pointMatch ? Number(pointMatch[1]) : null;
    if (points === null) { failures.push(`${filename}: pontuação não reconhecida (${pointsText})`); continue; }
    const amountCents = nature === "NAO_APLICAVEL" ? null : { LEVE: 8838, MEDIA: 13016, GRAVE: 19523, GRAVISSIMA: 29347 }[nature] * multiplier;
    const code = `${codeMatch[1]}-${codeMatch[2]}`;
    entries.set(code, { code, name, details: { nature, points, amount: amountCents === null ? null : (amountCents / 100).toFixed(2), article, validFrom: "2023-01-02", validUntil: null, pointsReference: pointsText, penalty, multiplier, sourceUrl: source.url, sourceSha256: source.sha256, sourceFile: filename, sourcePage: number } });
    found++;
  }
  await loading.destroy();
  if (required && found !== 1) failures.push(`${filename}: esperada uma ficha, extraídas ${found}`);
  return found;
}
async function download(filename) {
  const path = join(cache, filename), url = `${base}${filename}`;
  const bytes = existsSync(path) ? readFileSync(path) : await (async () => { const response = await fetch(url, { signal: AbortSignal.timeout(120000) }); if (!response.ok) throw new Error(`${filename}: HTTP ${response.status}`); const result = Buffer.from(await response.arrayBuffer()); writeFileSync(path, result); return result; })();
  const source = { filename, url, sha256: hash(bytes) }; sources.push(source); return { bytes, source };
}
for (const filename of archives) {
  const { bytes, source } = await download(filename), zip = await JSZip.loadAsync(bytes);
  const cards = Object.values(zip.files).filter(file => /\d{3}-\d{2}/.test(file.name) && /\.pdf$/i.test(file.name));
  for (const file of cards) await extract(await file.async("uint8array"), source, file.name, true);
  console.log(`[CTB] ${filename}: ${cards.length} fichas, ${entries.size} códigos acumulados`);
}
for (const filename of amendments) { const { bytes, source } = await download(filename); const found = await extract(bytes, source, filename, false); console.log(`[CTB] ${filename}: ${found} fichas atualizadas`); }
if (failures.length || entries.size < 300) throw new Error(`Extração incompleta (${entries.size} códigos):\n${failures.join("\n")}`);
const reviewed = JSON.parse(readFileSync(join(directory, "ctb-alteracoes-conferidas.json"), "utf8"));
for (const entry of reviewed.entries) {
  const source = sources.find(item => item.filename === entry.sourceFile);
  if (!source) throw new Error(`Fonte de alteração ausente: ${entry.sourceFile}`);
  const { code, name, ...details } = entry;
  entries.set(code, { code, name, details: { ...details, validUntil: null, sourceUrl: source.url, sourceSha256: source.sha256, transcription: "VISUAL_CHECKED_OFFICIAL_PDF" } });
}
for (const retired of reviewed.historicalCodes) {
  const entry = entries.get(retired.code);
  if (!entry) throw new Error(`Ficha histórica não localizada: ${retired.code}`);
  entry.details.validUntil = retired.validUntil;
  entry.details.retirementReference = `${base}${retired.sourceFile}`;
  entry.details.retirementReason = retired.reason;
}
const catalog = { kind: "CTB", reference: `MBFT 985/2022 e alterações · edição ${reviewed.referenceDate}`, sourceReference: "Contran/Senatran · MBFT 985/2022, sete anexos e alterações 1003/2023, 1009/2024, 1012/2024, 1013/2024, 1022/2026 e 1023/2026 · https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-Senatran/resolucoes-contran", complete: true, entries: [...entries.values()].sort((a, b) => a.code.localeCompare(b.code)), provenance: { fetchedAt: new Date().toISOString(), sources, reviewedImageCards: reviewed.entries.length, editionNote: "Sete anexos integrais e campos essenciais das alterações conferidos visualmente nos PDFs oficiais. Fichas antigas conservam vigência histórica. Alteração 1031/2026 das fichas tem vigência posterior ao corte de 13/10/2026." } };
writeFileSync(join(directory, "ctb-mbft.json"), JSON.stringify(catalog, null, 2) + "\n");
console.log(`[CTB] Catálogo gerado com ${catalog.entries.length} enquadramentos e hashes de origem.`);
