import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const source = process.argv.find(argument => argument.startsWith("--source="))?.slice(9);
if (!source) throw new Error("Informe --source=<arquivo XLSX oficial MSC 2026>. Use --write para preservar a captura.");
const bytes = await readFile(source);
const sourceHash = createHash("sha256").update(bytes).digest("hex");
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(bytes);
const text = value => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "object") return String(value).trim();
  if ("richText" in value) return value.richText.map(part => part.text).join("").trim();
  if ("result" in value) return text(value.result);
  if ("formula" in value || "sharedFormula" in value) return "";
  throw new Error("Célula sem representação textual documentada.");
};
const sheet = name => {
  const found = workbook.getWorksheet(name);
  if (!found) throw new Error(`Aba oficial ausente: ${name}`);
  return found;
};
const layout = sheet("Leiaute MSC"), pcasp = sheet("PcaspEstendido2026"), definitions = sheet("Informações Complementares");
const headers = Array.from({ length: 16 }, (_, index) => text(layout.getRow(4).getCell(index + 1).value));
const expected = ["CONTA", ...Array.from({ length: 6 }, (_, index) => [`IC${index + 1}`, `TIPO${index + 1}`]).flat(), "Valor", "Tipo_valor", "Natureza_valor"];
if (JSON.stringify(headers) !== JSON.stringify(expected) || text(layout.getCell("A1").value) !== "Leiaute MSC - 2026") throw new Error("Cabeçalho/ano divergente do leiaute MSC 2026.");
const informationTypes = {};
definitions.eachRow((row, number) => {
  if (number <= 5) return;
  const code = text(row.getCell(2).value);
  if (!code) return;
  const width = Number(text(row.getCell(4).value).match(/^([1-8]) /)?.[1]);
  if (!/^(PO|FP|DC|FR|CO|NR|ND|FS|AI)$/.test(code) || !width || informationTypes[code]) throw new Error(`Informação complementar inválida/duplicada na linha ${number}.`);
  informationTypes[code] = { name: text(row.getCell(3).value), width, description: text(row.getCell(6).value), sourceRow: number };
});
if (Object.keys(informationTypes).length !== 9) throw new Error("MSC 2026 exige os nove tipos documentados de informações complementares.");
const accounts = new Map();
pcasp.eachRow((row, number) => {
  if (number <= 4) return;
  const code = text(row.getCell(8).value);
  if (!code || text(row.getCell(12).value) !== "Ativa" || text(row.getCell(13).value) !== "Último") return;
  const types = text(row.getCell(16).value).split("-").map(value => value.trim());
  const name = text(row.getCell(9).value), balanceNature = text(row.getCell(11).value);
  if (!/^[1-8]\d{8}$/.test(code) || !name || !balanceNature || accounts.has(code) || types.length > 6 || new Set(types).size !== types.length || types.some(type => !informationTypes[type])) throw new Error(`Conta analítica inválida/duplicada na linha ${number}.`);
  accounts.set(code, { code, name, balanceNature, financialAttribute: text(row.getCell(14).value), informationTypes: types, sourceRow: number });
});
const layoutCodes = new Set();
layout.eachRow((row, number) => {
  if (number <= 4) return;
  const code = text(row.getCell(1).value);
  if (!code) return;
  const account = accounts.get(code);
  const types = Array.from({ length: 6 }, (_, index) => text(row.getCell(3 + index * 2).value)).filter(Boolean);
  if (!account || layoutCodes.has(code) || JSON.stringify(types) !== JSON.stringify(account.informationTypes)) throw new Error(`Leiaute e PCASP divergem na linha ${number}: ${code}.`);
  layoutCodes.add(code);
  account.layoutRow = number;
});
if (layoutCodes.size < 1000 || layoutCodes.size !== accounts.size) throw new Error("Leiaute incompleto: todas as contas analíticas ativas devem possuir linha correspondente.");
const dictionaries = {};
for (const definition of [
  { type: "PO", sheet: "PO", width: 5, codeColumn: 1, nameColumn: 2 },
  { type: "FR_GROUP", sheet: "FR 2026", width: 3, codeColumn: 1, nameColumn: 2 },
  { type: "CO", sheet: "CO 2026", width: 4, codeColumn: 1, nameColumn: 2 },
  { type: "NR", sheet: "NR 2026", width: 8, codeColumn: 8, nameColumn: 9 },
  { type: "ND", sheet: "ND 2026", width: 8, codeColumn: 6, nameColumn: 7 },
]) {
  const values = new Map();
  sheet(definition.sheet).eachRow((row, number) => {
    const raw = text(row.getCell(definition.codeColumn).value);
    const name = text(row.getCell(definition.nameColumn).value);
    if (!new RegExp(`^\\d{${definition.width}}$`).test(raw) || !name) return;
    if (values.has(raw) && values.get(raw).name !== name) throw new Error(`Código com descrições divergentes: ${definition.type}:${raw}.`);
    values.set(raw, { code: raw, name, sourceRow: number });
  });
  if (!values.size) throw new Error(`Dicionário oficial vazio: ${definition.type}.`);
  dictionaries[definition.type] = [...values.values()].sort((left, right) => left.code.localeCompare(right.code));
}
const functions = new Map(), subfunctions = new Map();
sheet("FS").eachRow((row, number) => {
  for (const [column, width, target] of [[1, 2, functions], [2, 3, subfunctions]]) {
    const value = text(row.getCell(column).value);
    const match = value.match(new RegExp(`^(\\d{${width}})\\s*-\\s*(.+)$`));
    if (match) target.set(match[1], { code: match[1], name: match[2], sourceRow: number });
  }
});
if (!functions.size || !subfunctions.size) throw new Error("Funções/subfunções oficiais ausentes.");
dictionaries.FUNCTION = [...functions.values()];
dictionaries.SUBFUNCTION = [...subfunctions.values()];
const capture = { year: 2026, authority: "STN_SICONFI", sourceUrl: "https://thot-arquivos.tesouro.gov.br/publicacao-anexo/28661", documentationUrl: "https://siconfi.tesouro.gov.br/siconfi/pages/public/conteudo/conteudo.jsf?id=12503", publishedRevision: "2026-07-08", sourceFile: "MSC_STN_2026_20260708.xlsx", sourceHash, headers, informationPairs: 6, informationTypes, dictionaries, accounts: [...accounts.values()].sort((left, right) => left.code.localeCompare(right.code)) };
if (process.argv.includes("--write")) {
  const directory = "docs/poc-p0/fontes";
  await mkdir(directory, { recursive: true });
  const destination = join(directory, capture.sourceFile);
  try {
    const existingHash = createHash("sha256").update(await readFile(destination)).digest("hex");
    if (existingHash !== sourceHash) throw new Error("Captura anterior possui bytes diferentes; preserve como nova revisão em vez de sobrescrever.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await copyFile(source, destination);
  }
  await writeFile(join(directory, "MSC_STN_2026_20260708.json"), JSON.stringify(capture, null, 2) + "\n");
}
console.log(JSON.stringify({ mode: process.argv.includes("--write") ? "CAPTURE_ONLY" : "READ_ONLY", input: basename(source), sourceHash, accounts: accounts.size, informationTypes: Object.keys(informationTypes), informationPairs: 6, mapped: false, homologated: false }, null, 2));
