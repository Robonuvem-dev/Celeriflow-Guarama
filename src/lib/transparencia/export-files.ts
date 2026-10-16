import type { PublicCollection, PublicDataset, TransparencyQuery } from "./query-contract";
import { filterPublicDataset } from "./query-contract";
import { exportTransparencyCsv } from "./consultation-export";

const safeCell = (value: unknown) => { const text = String(value ?? ""); return /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text; };
export async function renderTransparencyFile(collection: PublicCollection, dataset: PublicDataset, query: TransparencyQuery, format: "csv" | "txt" | "xlsx" | "pdf" | "docx" | "jpeg") {
  if (dataset.status !== "AVAILABLE" || !dataset.complete) throw new Error("Fonte não confirmada para exportação.");
  const result = filterPublicDataset(collection, dataset, query);
  const headers = ["Entidade", "Exercício", ...collection.columns.map(column => column.label)];
  const table = result.rows.map(row => [row.entity, String(row.year), ...collection.columns.map(column => String(row.values[column.key] ?? "Não informado"))]);
  const context = `${collection.title} | ${query.entity} | ${query.year} | Fonte: ${dataset.source}`;
  const metadata = `${dataset.provenance}\nPeríodo: ${query.from || "início do exercício"} a ${query.until || "fim do exercício"}. ${result.total} registros. Pesquisa: ${query.search || "sem termo"}. Filtros: ${JSON.stringify(query.filters)}.`;
  if (format === "csv") return { bytes: Buffer.from(exportTransparencyCsv(collection,dataset,query)), contentType:"text/csv; charset=utf-8" };
  if (format === "txt") return { bytes:Buffer.from(`${context}\n${metadata}\n${[headers,...table].map(row=>row.map(cell=>safeCell(cell).replace(/[\t\r\n]/g," ")).join("\t")).join("\n")}\n`),contentType:"text/plain; charset=utf-8" };
  if (format === "xlsx") {
    const {default:ExcelJS} = await import("exceljs"); const workbook = new ExcelJS.Workbook();
    const info = workbook.addWorksheet("Origem e filtros"); info.addRows([[context],[dataset.provenance],[metadata],...[...Object.entries(result.totals)].map(([key,total])=>[key,total??"Total indisponível"])]);
    const sheet = workbook.addWorksheet("Consulta"); sheet.addRow(headers); table.forEach(row=>sheet.addRow(row.map(safeCell))); sheet.getRow(1).font={bold:true}; sheet.views=[{state:"frozen",ySplit:1}]; sheet.columns.forEach(column=>{column.width=24;});
    return {bytes:Buffer.from(await workbook.xlsx.writeBuffer()),contentType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"};
  }
  if (format === "docx") {
    const {Document,Packer,Paragraph,Table,TableRow,TableCell,TextRun} = await import("docx");
    const document = new Document({sections:[{properties:{},children:[new Paragraph({children:[new TextRun({text:context,bold:true})]}),new Paragraph(metadata),new Table({rows:[headers,...table].map(row=>new TableRow({children:row.map(value=>new TableCell({children:[new Paragraph(value)]}))}))})]}]});
    return {bytes:await Packer.toBuffer(document),contentType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"};
  }
  if(format==="jpeg"){
    if(result.total>1000)throw new Error("Restrinja os filtros a até 1.000 registros para o relatório em imagens.");
    const [{default:sharp},{default:JSZip}]=await Promise.all([import("sharp"),import("jszip")]);const zip=new JSZip();
    const escape=(value:string)=>value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const wrap=(value:string)=>value.replace(/[\r\n]/g," ").match(/.{1,130}/g)||[""];
    for(let start=0;start<Math.max(1,result.rows.length);start+=20){const lines=[...wrap(context),...wrap(metadata),""];result.rows.slice(start,start+20).forEach((row,index)=>{lines.push(`Registro ${start+index+1} — ${row.entity}`);collection.columns.forEach(column=>lines.push(...wrap(`${column.label}: ${row.values[column.key]??"Não informado"}`)));lines.push("");});const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${Math.max(100,lines.length*21+50)}"><rect width="100%" height="100%" fill="white"/>${lines.map((line,index)=>`<text x="25" y="${30+index*21}" fill="black" font-family="sans-serif" font-size="17">${escape(line)}</text>`).join("")}</svg>`;zip.file(`pagina-${String(start/20+1).padStart(3,"0")}.jpg`,await sharp(Buffer.from(svg)).jpeg({quality:90}).toBuffer());}
    zip.file("origem-e-filtros.txt",`${context}\n${metadata}\nTodos os registros filtrados estão nas páginas JPEG deste ZIP.`);
    return {bytes:await zip.generateAsync({type:"nodebuffer"}),contentType:"application/zip"};
  }
  const {default:PDFDocument} = await import("pdfkit");
  const bytes = await new Promise<Buffer>((resolve,reject)=>{
    const pdf = new PDFDocument({size:"A4",layout:"landscape",margin:30,info:{Title:collection.title}}), chunks:Buffer[]=[];
    pdf.on("data",chunk=>chunks.push(chunk));pdf.on("error",reject);pdf.on("end",()=>resolve(Buffer.concat(chunks)));
    const heading=()=>{pdf.font("Helvetica-Bold").fontSize(13).text(context);pdf.font("Helvetica").fontSize(8).text(metadata).moveDown();}; heading();
    // Fichas por registro evitam cortar descrições longas em colunas estreitas.
    result.rows.forEach((row,index)=>{if(pdf.y>pdf.page.height-100){pdf.addPage();heading();}pdf.font("Helvetica-Bold").fontSize(9).text(`Registro ${index+1} — ${row.entity}`);collection.columns.forEach(column=>{pdf.font("Helvetica").fontSize(8).text(`${column.label}: ${row.values[column.key]??"Não informado"}`);});pdf.moveDown();});
    pdf.fontSize(9).text("Totais do conjunto filtrado");Object.entries(result.totals).forEach(([key,total])=>pdf.text(`${collection.columns.find(column=>column.key===key)?.label||key}: ${total??"Indisponível"}`));pdf.end();
  });
  return {bytes,contentType:"application/pdf"};
}

export function byteStream(bytes: Uint8Array) {
  let offset=0;
  return new ReadableStream<Uint8Array>({pull(controller){if(offset>=bytes.length){controller.close();return;}const end=Math.min(offset+65536,bytes.length);controller.enqueue(bytes.subarray(offset,end));offset=end;}});
}
