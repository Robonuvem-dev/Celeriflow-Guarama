import { validateCpf } from "@/lib/identifiers/brazilian-identifiers";
import { socialDateSchema } from "./history-input";
import { kinships } from "./workflow-contract";
import type { SocialImportRow } from "@/db/schema/social-workflows";
import { defaultImportLayout, socialLayoutSchema, type SocialImportLayout } from "./municipal-contract";

export const localCadunicoLayout = "CELERIFLOW_SOCIAL_CSV_V1";
export const localCadunicoHeaders = ["cpf", "nis", "nome", "codigo_familiar", "parentesco", "nascimento", "renda_familiar", "telefone", "endereco", "municipio", "uf"];
/** CSV RFC-style quoting, including embedded delimiters and line breaks. */
export function readSocialCsv(content: string, delimiterOption: SocialImportLayout["delimiter"] = "AUTO"): string[][] {
  const text = content.replace(/^\uFEFF/, ""), rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  const firstLine=text.slice(0,text.indexOf("\n")<0?text.length:text.indexOf("\n"));
  const delimiter = delimiterOption!=="AUTO"?delimiterOption:firstLine.includes(";")?";":firstLine.includes("\t")?"\t":firstLine.includes("|")?"|":",";
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') { if (quoted && text[index + 1] === '"') { cell += '"'; index++; } else if (!quoted && cell) throw new Error("Aspas inválidas no CSV."); else quoted = !quoted; }
    else if (char === delimiter && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[index + 1] === "\n") index++; row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("CSV com campo de aspas não encerrado.");
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}
export function parseLocalCadunico(content: string, configuration: SocialImportLayout = defaultImportLayout): SocialImportRow[] {
  if (new TextEncoder().encode(content).length > 5 * 1024 * 1024) throw new Error("Arquivo superior a 5 MB.");
  const layout=socialLayoutSchema.parse(configuration);
  const [header, ...lines] = readSocialCsv(content,layout.delimiter);
  const normalize=(value:string)=>value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
  if(!header)throw new Error("Arquivo sem cabeçalho.");
  const normalizedHeader=header.map(normalize);
  if(new Set(normalizedHeader).size!==normalizedHeader.length)throw new Error("O arquivo contém colunas repetidas.");
  const missing=localCadunicoHeaders.filter(key=>!layout.mapping[key].startsWith("=")&&!normalizedHeader.includes(normalize(layout.mapping[key])));
  if(missing.length)throw new Error(`Colunas não encontradas: ${missing.map(key=>layout.mapping[key]).join(", ")}. Confira o layout selecionado ou configure a associação de colunas.`);
  if (!lines.length || lines.length > 5000) throw new Error("Informe de 1 a 5.000 pessoas por lote.");
  const rows = lines.map((cells, index): SocialImportRow => {
    const mapped=localCadunicoHeaders.map(key=>{const column=layout.mapping[key];return column.startsWith("=")?column.slice(1):(cells[normalizedHeader.indexOf(normalize(column))]||"").trim();});
    const [, , name, familyCode, , , , phone, address, municipality] = mapped;
    let [cpf, nis, , , kinship, birthDate, income, , , , uf] = mapped;
    cpf=cpf.replace(/\D/g,"");nis=nis.replace(/\D/g,"");
    if(/^\d+$/.test(kinship))kinship=kinships[Number(kinship)-1]||kinship;
    if(layout.dateFormat==="BR"&&/^\d{2}\/\d{2}\/\d{4}$/.test(birthDate))birthDate=birthDate.split("/").reverse().join("-");
    if(income.includes(","))income=income.replaceAll(".","").replace(",",".");
    if(/^\d{1,10}(\.\d{1,2})?$/.test(income))income=Number(income).toFixed(2);
    const states:Record<string,string>={"11":"RO","12":"AC","13":"AM","14":"RR","15":"PA","16":"AP","17":"TO","21":"MA","22":"PI","23":"CE","24":"RN","25":"PB","26":"PE","27":"AL","28":"SE","29":"BA","31":"MG","32":"ES","33":"RJ","35":"SP","41":"PR","42":"SC","43":"RS","50":"MS","51":"MT","52":"GO","53":"DF"};
    uf=states[uf]||uf.toUpperCase();
    const errors: string[] = [];
    if (cells.length !== header.length) errors.push("Quantidade de colunas divergente");
    if (!validateCpf(cpf).valid) errors.push("CPF inválido");
    if (nis && !/^\d{11}$/.test(nis)) errors.push("NIS deve ter 11 dígitos quando informado");
    if (!name || name.length > 250) errors.push("Nome inválido");
    if (!familyCode || familyCode.length > 100) errors.push("Código familiar inválido");
    if (!kinships.includes(kinship)) errors.push("Parentesco inválido");
    if (!socialDateSchema.safeParse(birthDate).success || birthDate > new Date().toISOString().slice(0, 10)) errors.push("Nascimento inválido");
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(income || "")) errors.push("Renda familiar inválida");
    if (!municipality || !/^[A-Z]{2}$/.test(uf || "")) errors.push("Município/UF inválidos");
    if (mapped.some(value => value.length > 1000)) errors.push("Campo muito extenso");
    return { line: index + 2, cpf: (cpf || "").replace(/\D/g, ""), nis: nis || "", name: name || "", familyCode: familyCode || "", kinship: kinship || "", birthDate: birthDate || "", income: income || "", phone: phone || "", address: address || "", municipality: municipality || "", uf: uf || "", errors };
  });
  const cpfCounts = new Map<string, number>(), nisCounts = new Map<string, number>();
  for (const row of rows) { cpfCounts.set(row.cpf, (cpfCounts.get(row.cpf) || 0) + 1); if(row.nis)nisCounts.set(row.nis, (nisCounts.get(row.nis) || 0) + 1); }
  for (const row of rows) { if ((cpfCounts.get(row.cpf) || 0) > 1) row.errors.push("CPF repetido no lote"); if (row.nis && (nisCounts.get(row.nis) || 0) > 1) row.errors.push("NIS repetido no lote"); }
  for (const code of new Set(rows.map(r => r.familyCode))) {
    const family = rows.filter(r => r.familyCode === code);
    if (family.filter(r => r.kinship === "RESPONSAVEL").length !== 1) family.forEach(r => r.errors.push("Família deve ter exatamente um responsável"));
    if (new Set(family.map(r => r.income)).size !== 1) family.forEach(r => r.errors.push("Renda familiar divergente entre membros"));
    if (family.some(r => r.errors.length)) family.forEach(r => { if (!r.errors.length) r.errors.push("Outro membro da família contém erro; corrija a composição integral"); });
  }
  return rows;
}
