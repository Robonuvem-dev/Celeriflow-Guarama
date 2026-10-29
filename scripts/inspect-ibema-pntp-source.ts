import { inflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
const url = "https://cdn.atricon.org.br/2026/08/dados_pntp_2025.zip";
async function bytes(from: number, until: number) {
  const response = await fetch(url, { headers: { Range: `bytes=${from}-${until}` }, signal: AbortSignal.timeout(60000) });
  if (response.status !== 206) throw new Error("Fonte não atendeu a leitura parcial; não baixar o pacote inteiro implicitamente.");
  return Buffer.from(await response.arrayBuffer());
}
async function main() {
  const head = await fetch(url, { method: "HEAD" }), size = Number(head.headers.get("content-length"));
  const tail = await bytes(Math.max(0, size - 65557), size - 1); let end = -1;
  for (let index = tail.length - 22; index >= 0; index--) if (tail.readUInt32LE(index) === 0x06054b50) { end = index; break; }
  if (end < 0) throw new Error("Diretório ZIP não encontrado.");
  const directorySize = tail.readUInt32LE(end + 12), offset = tail.readUInt32LE(end + 16), directory = await bytes(offset, offset + directorySize - 1);
  let entry: { filename: string; compressed: number; uncompressed: number; method: number; offset: number } | null = null;
  for (let index = 0; index + 46 <= directory.length;) {
    if (directory.readUInt32LE(index) !== 0x02014b50) throw new Error("Diretório ZIP inválido.");
    const nameLength = directory.readUInt16LE(index + 28), extraLength = directory.readUInt16LE(index + 30), commentLength = directory.readUInt16LE(index + 32), filename = directory.subarray(index + 46, index + 46 + nameLength).toString("utf8");
    if (filename.toLowerCase().includes("avaliacoes") && filename.endsWith(".xlsx")) entry = { filename, compressed: directory.readUInt32LE(index + 20), uncompressed: directory.readUInt32LE(index + 24), method: directory.readUInt16LE(index + 10), offset: directory.readUInt32LE(index + 42) };
    index += 46 + nameLength + extraLength + commentLength;
  }
  if (!entry || entry.compressed > 20000000 || entry.uncompressed > 50000000) throw new Error("Planilha de avaliações não localizada ou acima do limite.");
  const local = await bytes(entry.offset, entry.offset + 29), start = entry.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28), compressed = await bytes(start, start + entry.compressed - 1), data = entry.method === 8 ? inflateRawSync(compressed) : compressed;
  if (data.length !== entry.uncompressed) throw new Error("Tamanho da planilha divergente.");
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Uint8Array.from(data).buffer);
  for (const sheet of workbook.worksheets) {
    const headers: string[] = []; sheet.getRow(1).eachCell((cell, index) => { headers[index] = cell.text; });
    sheet.eachRow((row, index) => { if (index === 1) return; const values: Record<string, string> = {}; row.eachCell((cell, column) => { values[headers[column] || String(column)] = cell.text; }); if (Object.values(values).some(value => /\bIbema\b/i.test(value))) console.log(JSON.stringify({ source: url, cycle: 2025, row: values })); });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
