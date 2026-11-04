import PDFDocument from "pdfkit";
import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";
import { PERSONNEL_ISSUER } from "./personnel-presentation";
import { reportContractPredicate, reportEmployeePredicate } from "./report-filters";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";

export const specialReportKinds = ["ETIQUETAS_ANIVERSARIANTES", "ETIQUETAS_SERVIDORES", "ETIQUETAS_CARTAO_PONTO", "CARTAO_PONTO_132", "ETIQUETA_CONTRATUAL_CTPS"] as const;
export async function buildSpecialHrReport(db: DatabaseExecutor, input: OperationalReportInput, budgetUnitIds?: readonly string[]): Promise<PersonnelReport> {
  const reference = input.referenceDate ?? new Date().toISOString().slice(0, 10);
  if (input.kind === "ETIQUETA_CONTRATUAL_CTPS") {
    const result = await db.execute<Record<string, unknown>>(sql`SELECT personal.snapshot->'person'->>'fullName' name,personal.snapshot->'person'->>'cpf' cpf,
      v.snapshot->>'registration' registration,v.snapshot->>'admittedAt' admission,v.snapshot->>'salary' salary,v.snapshot->>'monthlyHours' hours,r.name role,
      identification.data->>'pisPasep' pis,identification.data->>'ctps' ctps,identification.data->>'ctpsSeries' series,identification.data->>'ctpsState' state,
      personal."effectiveFrom"::text observed FROM "HrEmploymentContract" c JOIN "Employee" e ON e.id=c."employeeId"
      JOIN LATERAL (SELECT snapshot FROM "HrEmploymentRevision" WHERE "contractId"=c.id AND "effectiveFrom"<${reference}::date+interval '1 day' ORDER BY "effectiveFrom" DESC,version DESC LIMIT 1) v ON true
      LEFT JOIN "Role" r ON r.id=v.snapshot->>'roleId'
      LEFT JOIN LATERAL (SELECT snapshot,"effectiveFrom" FROM "HrPersonalRevision" WHERE "employeeId"=e.id AND "effectiveFrom"<${reference}::date+interval '1 day' ORDER BY "effectiveFrom" DESC,id DESC LIMIT 1) personal ON true
      LEFT JOIN LATERAL (SELECT observed->'data' data FROM jsonb_array_elements(personal.snapshot->'functionalIdentification') observed WHERE observed->>'status'<>'CANCELADO' AND (observed->>'startsAt')::date<=${reference}::date AND (observed->>'endsAt' IS NULL OR (observed->>'endsAt')::date>=${reference}::date) ORDER BY observed->>'startsAt' DESC,observed->>'id' DESC LIMIT 1) identification ON true
      WHERE (${input.q}='' OR strpos(lower(e.name),lower(${input.q}))>0 OR strpos(coalesce(e.registration,''),${input.q})>0)
      AND ${reportContractPredicate(input, sql`v.snapshot`, sql`${reference}`)}
      ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``} ${input.departmentId ? sql`AND v.snapshot->>'departmentId'=${input.departmentId}` : sql``}
      AND ${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)} ORDER BY e.name,c.id`);
    const fields = ["name", "cpf", "registration", "admission", "role", "salary", "hours", "pis", "ctps", "series", "state"];
    return { title: "Etiqueta contratual para CTPS — modelo municipal", headers: ["Empregador", "Referência", "Nome", "CPF", "Matrícula", "Admissão", "Cargo", "Salário BRL", "Jornada mensal", "PIS/PASEP", "CTPS", "Série", "UF"], rows: result.rows.map(row => {
      if (!row.observed || !row.ctps || !row.pis) throw new Error("Preencha a identificação trabalhista e registre a fotografia cadastral antes de emitir a etiqueta CTPS na referência.");
      return [PERSONNEL_ISSUER, reference, ...fields.map(key => row[key] == null ? "" : String(row[key]).slice(0, key === "admission" ? 10 : undefined))];
    }), print: { kind: "labels", columns: input.labelColumns ?? 2, height: input.labelHeight ?? 220, margin: input.labelMargin ?? 28 } };
  }
  const result = await db.execute<{ name: string; registration: string | null; role: string | null; department: string | null; birthday: string | null; monthly: number }>(sql`
    SELECT e.name,e.registration,r.name role,d.name department,to_char(p."birthDate",'DD/MM') birthday,e."contractedHours" monthly
    FROM "Employee" e LEFT JOIN "Person" p ON p.id=e."personId" LEFT JOIN "Role" r ON r.id=e."roleId" LEFT JOIN "Department" d ON d.id=e."departmentId"
    WHERE e."isActive" AND (${input.q}='' OR strpos(lower(e.name),lower(${input.q}))>0 OR strpos(coalesce(e.registration,''),${input.q})>0)
    AND ${reportEmployeePredicate(input, sql`e.id`, sql`${reference}`)}
    ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``} ${input.departmentId ? sql`AND e."departmentId"=${input.departmentId}` : sql``}
    ${input.kind === "ETIQUETAS_ANIVERSARIANTES" ? sql`AND extract(month FROM p."birthDate")=${input.month ?? Number(reference.slice(5, 7))}` : sql``}
    AND ${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)}
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
  } else if (report.print?.kind === "pension-receipt") {
    if (!report.rows.length) pdf.font("Helvetica").fontSize(10).text(PERSONNEL_ISSUER).moveDown().text(report.title).moveDown().text("Nenhum desconto de pensão encontrado nos critérios selecionados.");
    for (const [index, row] of report.rows.entries()) {
      if (index) pdf.addPage();
      pdf.font("Helvetica-Bold").fontSize(12).text(PERSONNEL_ISSUER).moveDown();
      pdf.fontSize(15).text("Comprovante de desconto de pensão judicial").moveDown();
      pdf.font("Helvetica").fontSize(10).text(`Competência: ${row[0]} · Folha: ${row[1]}`).moveDown();
      for (const column of [2, 3, 4, 5, 6]) pdf.font("Helvetica-Bold").text(`${report.headers[column]}:`, { continued: true }).font("Helvetica").text(` ${row[column] || "Não informado"}`).moveDown(0.5);
      pdf.moveDown().font("Helvetica-Bold").fontSize(13).text(`Valor descontado: R$ ${row[7]}`).moveDown();
      pdf.font("Helvetica").fontSize(10).text("Certifica-se que o valor identificado foi descontado no demonstrativo de folha indicado, em favor da pessoa beneficiária e sob o processo acima descritos. Este documento reproduz o desconto da folha encerrada e não constitui recibo de recebimento pela pessoa beneficiária nem comprovação de repasse bancário.").moveDown();
      pdf.fontSize(9).text(`Demonstrativo de origem: ${row[8]}`).moveDown(0.5).text(`Situação: ${row[9]}`).moveDown();
      pdf.text(`Emissão: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`).moveDown(2).text("Responsável pela emissão: ______________________________________");
    }
  } else if (report.print?.kind === "personnel-card") {
    const holders = new Map<string, string[][]>();
    for (const row of report.rows) { const key = JSON.stringify(row.slice(0, 2)); holders.set(key, [...(holders.get(key) ?? []), row]); }
    let first = true;
    for (const rows of holders.values()) {
      if (!first) pdf.addPage();
      first = false;
      const heading = () => {
        pdf.font("Helvetica-Bold").fontSize(11).text(PERSONNEL_ISSUER);
        pdf.fontSize(12).text(report.title).moveDown(0.5);
        pdf.fontSize(11).text(`${rows[0][0]} · Matrícula ${rows[0][1] || "não informada"}`);
        pdf.font("Helvetica").fontSize(9).text(`Referência: ${rows[0][4]}`).moveDown();
      };
      heading();
      let section = "";
      for (const row of rows) {
        const separator = row[2].indexOf(" / ");
        const group = separator < 0 ? "Dados cadastrais" : row[2].slice(0, separator);
        const field = separator < 0 ? row[2] : row[2].slice(separator + 3);
        const text = `${field}: ${row[3] || "Não informado"}`;
        pdf.font("Helvetica").fontSize(9);
        const height = pdf.heightOfString(text, { width: pdf.page.width - margin * 2 });
        if (pdf.y + height + (section !== group ? 36 : 12) > pdf.page.height - margin - 40) { pdf.addPage(); heading(); section = ""; }
        if (section !== group) { pdf.moveDown(0.6).font("Helvetica-Bold").fontSize(10).text(group).moveDown(0.3); section = group; }
        pdf.font("Helvetica").fontSize(9).text(text, { paragraphGap: 5 });
      }
      if (report.title.startsWith("Ficha cadastral para conferência")) {
        if (pdf.y > pdf.page.height - margin - 100) { pdf.addPage(); heading(); }
        pdf.moveDown().fontSize(9).text("Conferido em: ____/____/________").moveDown().text("Responsável pela conferência: ______________________________________").moveDown().text("Assinatura do servidor: ____________________________________________");
      }
    }
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
