import { config } from "dotenv";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { put, get, del } from "@vercel/blob";
import { getBlobDocumentPrefix } from "../src/lib/platform/blob";
import { defaultTransparencySettings, transparencySettingsKey, transparencySettingsSchema } from "../src/lib/transparencia/presentation-settings";

config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const archive = resolve("docs/Novos docs/Novos docs");
// IDs e agrupamentos conferidos individualmente no catálogo documental 001–141.
const groups: [string, string, number[]][] = [
  ["Saúde / planos e gestão", "publicacoes", [1,3,12,38,107,112,119]],
  ["Controle interno / auditorias", "publicacoes", [4,7,25,28,77,78,97,98,109,127,128,130]],
  ["Pessoal / normas e relatórios", "servidores", [5,13,39,57,58,88,89,90,104,111,137]],
  ["Referências visuais do portal anterior", "publicacoes", [14,22,110]],
  ["Compras / itens e documentos fiscais", "compras", [15,16,17,18]],
  ["Repasses / recursos e parcerias", "convenios", [19,20,23,135,138,139]],
  ["Contratos", "contratos", [21]],
  ["Institucional / contatos e estrutura", "publicacoes", [24,99,102,129,136]],
  ["Legislação / atos e diários", "legislacao", [26,29,30,59,60,80,86,108]],
  ["Planejamento / PPA, LDO e LOA", "publicacoes", [6,46,47,48,49,50,51,52,79,81,82,83,84,85,100,101]],
  ["Contas públicas / RGF", "publicacoes", [31,32,35,36,40]],
  ["Contas públicas / RREO", "publicacoes", [33,34,37,41,42,91,92,93,94,95,96,131]],
  ["Contas públicas / DCASP", "publicacoes", [123,124,125,126]],
  ["Despesas / execução e balancetes", "despesas", [8,9,10,11,45,53,54,55,56,61,62,63,64,65,66,67,68,69,70,71,72,73,74,76,105,132]],
  ["Liquidações", "liquidacoes", [133]],
  ["Pagamentos", "pagamentos", [134]],
  ["Receitas / arrecadação e tributos", "receitas", [75,113,114,115,140,141]],
  ["Assistência social / conselho e gestão", "publicacoes", [103,106,116,118]],
  ["Estoque / CAF e Farmácia", "estoque", [120,121,122]],
  ["Transparência / referências e APIs", "publicacoes", [87]],
];
const historicalYears: Record<number, number> = { 3:2025, 5:2025, 13:2025, 25:2025, 26:2023, 57:2024, 80:2025, 85:2027, 86:2008, 98:2025, 109:2025, 112:2025, 123:2025, 124:2025, 125:2025, 126:2025, 127:2025, 128:2025 };
const periods: [string, number[]][] = [
  ["Agosto/2026", [8,10,15,17,19,21,58,62,63,65,67,69,71,73,90,113,141]],
  ["Julho/2026", [9,11,16,18,20,31,32,36,61,64,66,68,70,72,74,75,76,111,114,139,140]],
  ["Janeiro–junho/2026", [37,38,41,91,93,94,95,131]],
  ["Janeiro–agosto/2026", [33,35,40]],
  ["Agosto/2025–julho/2026", [39,96]],
  ["Janeiro–fevereiro/2026", [42,92]],
  ["2026–2029", [81,82,84,106,107]],
  ["Exercício 2026", [4,6,7,24,28,29,30,46,47,48,49,50,51,52,79,83,100,101,103,104]],
  ["Outubro/2026", [54,59,60,120,122]],
  ["03/09/2026", [88,89]],
  ["2022–2026", [23]], ["Projeção 2025–2100", [34]], ["Julho/2025", [13]],
  ["Julho/2024", [57]], ["Julho/2026", [55,56,137]],
  ["Janeiro–julho/2026", [132,133,134]], ["Maio–agosto/2026", [118]],
  ["Setembro/2026", [121]], ["Dezembro/2025", [123,124,125,126]],
  ["2021–abril/2026", [129]], ["2025–2026", [102]], ["2026, conforme captura (nome do arquivo menciona 2025)", [110]],
  ["Gerado em 11/10/2026; corte conforme arquivo", [53,115]],
];
const correctedPeriod: Record<number, string> = {55:"Agosto/2026",56:"Julho/2026",85:"Exercício 2027",86:"Edição 2008",108:"Legislação composta de 2021",109:"Contas do exercício 2025 — instrução técnica de 2026",119:"Auditoria 2025 / conclusão abril/2026",130:"Auditoria transporte escolar / conclusão julho/2026",5:"Campina do Simão — Lei 21/2025 (referência comparativa)"};
const mime: Record<string,string> = { pdf:"application/pdf", png:"image/png", csv:"text/csv", txt:"text/plain", zip:"application/zip" };
const collectionOverrides:Record<number,string>={5:"legislacao",13:"diarias",19:"repasses",20:"repasses",57:"publicacoes",58:"estagiarios",95:"restos-a-pagar",111:"vagas",135:"repasses",139:"repasses"};

async function main() {
  const catalog = await readFile(resolve("docs/CATALOGO_NOVOS_DOCUMENTOS_IBEMA.md"), "utf8");
  const sources = [...catalog.matchAll(/^\| (\d{3}) \| `([^`]+)`([^|]*)\|/gm)].filter(match => !match[3].includes("excluído")).map(match => ({ id: Number(match[1]), filename: match[2] }));
  if (sources.length !== 136 || new Set(groups.flatMap(group => group[2])).size !== 136) throw new Error("Inventário de 136 fontes divergente. Confira o catálogo antes da carga.");
  const { prisma } = await import("../src/lib/prisma");
  try {
    const instance = await prisma.configuracaoInstancia.findFirstOrThrow({ orderBy: { createdAt: "asc" }, select: { id:true } });
    const actor = await prisma.usuario.findFirstOrThrow({ where: { ativo:true }, orderBy:{createdAt:"asc"}, select:{id:true} });
    const parameter = await prisma.configuracaoParametroInstancia.findUnique({where:{configuracaoInstanciaId_chave:{configuracaoInstanciaId:instance.id,chave:transparencySettingsKey}}});
    const settings = parameter ? transparencySettingsSchema.parse(parameter.valor) : defaultTransparencySettings();
    const years = [...new Set([...settings.availableYears, ...sources.map(source => historicalYears[source.id] || 2026)])].sort((a,b)=>b-a);
    if (apply) await prisma.configuracaoParametroInstancia.upsert({where:{configuracaoInstanciaId_chave:{configuracaoInstanciaId:instance.id,chave:transparencySettingsKey}},create:{configuracaoInstanciaId:instance.id,chave:transparencySettingsKey,valor:{...settings,initialYear:Math.min(...years),availableYears:years}},update:{valor:{...settings,initialYear:Math.min(...years),availableYears:years}}});
    let created = 0, reused = 0, reclassified=0, totalBytes = 0;
    for (const source of sources) {
      const group = groups.find(group => group[2].includes(source.id));
      if (!group) throw new Error(`Sem classificação individual: ${source.id}`);
      const files = source.id === 81 ? ["PPA_2026-2029.zip.part01","PPA_2026-2029.zip.part02"] : [source.filename];
      const sizes = await Promise.all(files.map(filename => stat(resolve(archive,filename)).then(value=>value.size)));
      totalBytes += sizes.reduce((sum,size)=>sum+size,0);
      if (sizes.some(size=>size<=0) || sizes.reduce((sum,size)=>sum+size,0)>512*1024*1024) throw new Error(`Arquivo vazio ou acima de 512 MB: ${source.filename}`);
      const bytes = Buffer.concat(await Promise.all(files.map(filename=>readFile(resolve(archive,filename)))));
      const sha256 = createHash("sha256").update(bytes).digest("hex"), id = `ibema-archive-ND-${String(source.id).padStart(3,"0")}-v1`;
      const previous = await prisma.transparencyPublication.findUnique({where:{id}});
      if (previous) { if (previous.sha256!==sha256) throw new Error(`Original alterado em ${id}; criar nova versão.`);
        const corrected=collectionOverrides[source.id];
        if(corrected&&previous.collectionSlug===group[1]&&corrected!==previous.collectionSlug&&previous.status!=="WITHDRAWN"){
          if(apply)await prisma.$transaction(async tx=>{await tx.transparencyPublication.update({where:{id},data:{collectionSlug:corrected}});await tx.financialAuditLog.create({data:{action:"CLASSIFY_TRANSPARENCY_ARCHIVE",entityType:"TransparencyPublication",entityId:id,authorUsuarioId:actor.id,payload:{from:previous.collectionSlug,to:corrected,sourceDocumentId:source.id}}});});reclassified++;
        }
        reused++; continue; }
      if (!apply) { created++; continue; }
      const contentType = mime[source.filename.split(".").pop()!.toLowerCase()];
      if (!contentType) throw new Error(`Formato não previsto: ${source.filename}`);
      const pathname = `${getBlobDocumentPrefix()}transparencia/acervo-ibema/${id}-${sha256.slice(0,12)}.${source.filename.split(".").pop()}`;
      const blob = await put(pathname,bytes,{access:"private",token:process.env.BLOB_READ_WRITE_TOKEN,contentType,addRandomSuffix:true});
      try {
        const stored = await get(blob.url,{access:"private",token:process.env.BLOB_READ_WRITE_TOKEN});
        if (!stored || createHash("sha256").update(Buffer.from(await new Response(stored.stream).arrayBuffer())).digest("hex")!==sha256) throw new Error(`Integridade do Blob não confirmada: ${id}`);
        await prisma.$transaction(async tx => {
          await tx.transparencyPublication.create({data:{id,collectionSlug:collectionOverrides[source.id]||group[1],entity:"prefeitura",year:historicalYears[source.id]||2026,title:source.filename.replace(/\.[^.]+$/,""),group:group[0],referencePeriod:correctedPeriod[source.id]||periods.find(period=>period[1].includes(source.id))?.[0]||`Referência ${historicalYears[source.id]||2026}; detalhes no documento original`,source:"DOCUMENTOS",status:"PUBLISHED",publishedAt:new Date(),values:{origin:"Acervo recebido do antigo Portal da Transparência de Ibema",sourceDocumentId:`ND-${String(source.id).padStart(3,"0")}`,sourceMunicipality:source.id===5?"Campina do Simão — referência comparativa":"Ibema/PR",sizeBytes:bytes.length},fileUrl:blob.url,filePathname:blob.pathname,filename:source.filename,contentType,sha256,order:source.id}});
          await tx.financialAuditLog.create({data:{action:"IMPORT_TRANSPARENCY_ARCHIVE",entityType:"TransparencyPublication",entityId:id,authorUsuarioId:actor.id,payload:{sourceDocumentId:source.id,sha256,filename:source.filename,origin:"Acervo público antigo Ibema",sizeBytes:bytes.length}}});
        }); created++;
        console.log(JSON.stringify({id,status:"PUBLISHED",bytes:bytes.length}));
      } catch(error) { await del(blob.url,{token:process.env.BLOB_READ_WRITE_TOKEN}); throw error; }
    }
    console.log(JSON.stringify({mode:apply?"IMPORTED_TO_PRIVATE_VERCEL_BLOB":"READ_ONLY",sources:sources.length,created,reused,reclassified,totalBytes,years}));
  } finally { await prisma.$disconnect(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
