import PDFDocument from "pdfkit";
import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";

export const specialReportKinds = ["ETIQUETAS_ANIVERSARIANTES", "ETIQUETAS_SERVIDORES", "ETIQUETAS_CARTAO_PONTO", "CARTAO_PONTO_132"] as const;
export async function buildSpecialHrReport(db: DatabaseExecutor, input: OperationalReportInput): Promise<PersonnelReport> {
  const reference = input.referenceDate ?? new Date().toISOString().slice(0, 10);
  const result = await db.execute<{ name: string; registration: string | null; role: string | null; department: string | null; birthday: string | null; monthly: number }>(sql`
    SELECT e.name,e.registration,r.name role,d.name department,to_char(p."birthDate",'DD/MM') birthday,e."contractedHours" monthly
    FROM "Employee" e LEFT JOIN "Person" p ON p.id=e."personId" LEFT JOIN "Role" r ON r.id=e."roleId" LEFT JOIN "Department" d ON d.id=e."departmentId"
    WHERE e."isActive" AND (${input.q}='' OR strpos(lower(e.name),lower(${input.q}))>0 OR strpos(coalesce(e.registration,''),${input.q})>0)
    ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``} ${input.departmentId ? sql`AND e."departmentId"=${input.departmentId}` : sql``}
    ${input.kind === "ETIQUETAS_ANIVERSARIANTES" ? sql`AND extract(month FROM p."birthDate")=${input.month ?? Number(reference.slice(5, 7))}` : sql``}
    ORDER BY e.name,e.id`);
  const card = ["ETIQUETAS_CARTAO_PONTO", "CARTAO_PONTO_132"].includes(input.kind);
  const labels: Record<string, string> = { name: "Nome", registration: "Matrícula", role: "Cargo", department: "Lotação", birthday: "Aniversário", period: "Período", monthly: "Divisor mensal (não horas realizadas)" };
  const fields = input.labelFields?.split(",") ?? ["name", "registration", "role", "department", ...(input.kind === "ETIQUETAS_ANIVERSARIANTES" ? ["birthday"] : []), ...(card ? ["period", "monthly"] : [])];
  if (!fields.length || fields.some(field => !Object.hasOwn(labels, field)) || new Set(fields).size !== fields.length) throw new Error("Campos de etiqueta inválidos ou repetidos.");
  return {
    title: input.kind === "CARTAO_PONTO_132" ? "Cartão de ponto — modelo de 132 colunas" : "Etiquetas de pessoal — uso interno RH",
    headers: fields.map(field => labels[field]),
    rows: result.rows.map(row => {
      const values: Record<string, string> = { name: row.name, registration: row.registration ?? "", role: row.role ?? "", department: row.department ?? "", birthday: row.birthday ?? "", period: input.competence ?? `${input.from ?? reference} a ${input.until ?? reference}`, monthly: String(row.monthly) };
      return fields.map(field => values[field]);
    }),
    print: { kind: input.kind === "CARTAO_PONTO_132" ? "matrix132" : "labels", columns: input.labelColumns ?? 2, height: input.labelHeight ?? 140, margin: input.labelMargin ?? 28 },
  };
}

export function matrix132Lines(report: PersonnelReport): string[] {
  const lines: string[] = [];
  const append = (text: string) => {
    const clean = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, " ");
    for (let start = 0; start < clean.length || start === 0; start += 132) lines.push(clean.slice(start, start + 132).padEnd(132));
  };
  append(report.title);
  for (const [index, row] of report.rows.entries()) {
    append("=".repeat(132)); append(`REGISTRO ${index + 1}`);
    row.forEach((entry, column) => append(`${report.headers[column]}: ${entry}`));
    append("Conferencia do servidor: ______________________________  Chefia: ______________________________");
  }
  return lines;
}

export async function renderSpecialPersonnelPdf(report: PersonnelReport): Promise<Buffer> {
  const matrix = report.print?.kind === "matrix132";
  const margin = report.print?.margin ?? 28;
  const pdf = new PDFDocument({ size: "A4", layout: matrix ? "landscape" : "portrait", margin });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => { pdf.on("data", chunk => chunks.push(Buffer.from(chunk))); pdf.on("end", () => resolve(Buffer.concat(chunks))); pdf.on("error", reject); });
  if (matrix) {
    pdf.font("Courier").fontSize(8);
    for (const line of matrix132Lines(report)) pdf.text(line, { lineBreak: true, lineGap: 1 });
  } else {
    const gap = 8, columns = report.print?.columns ?? 2, height = report.print?.height ?? 140, width = (pdf.page.width - margin * 2 - gap * (columns - 1)) / columns;
    const perPage = Math.floor((pdf.page.height - margin * 2 + gap) / (height + gap)) * columns;
    for (const [index, row] of report.rows.entries()) {
      if (index > 0 && index % perPage === 0) pdf.addPage();
      const position = index % perPage, x = margin + position % columns * (width + gap), y = margin + Math.floor(position / columns) * (height + gap);
      const text = row.map((entry, column) => `${report.headers[column]}: ${entry}`).join("\n");
      pdf.font("Helvetica").fontSize(8);
      if (pdf.heightOfString(text, { width: width - 12 }) > height - 12) {
        pdf.end(); await result;
        throw new Error("Conteúdo integral excede a etiqueta; aumente a altura, reduza colunas ou selecione os campos antes de imprimir.");
      }
      pdf.save().rect(x, y, width, height).strokeColor("#ccd2d9").stroke().restore();
      pdf.text(text, x + 6, y + 6, { width: width - 12 });
    }
  }
  pdf.end();
  return result;
}
