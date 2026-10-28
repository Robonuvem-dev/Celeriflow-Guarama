import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readControlAgenda } from "@/lib/c7/control-agenda";
import { renderControlReport } from "@/lib/c7/control-report";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { db } from "@/db/client";

export async function GET(request: NextRequest) {
  const context = await getTenantContextForModule("ADMINISTRACAO");
  const input = z.object({ year: z.coerce.number().int().min(1900).max(2200), months: z.string().regex(/^(?:[1-9]|1[0-2])(?:,(?:[1-9]|1[0-2]))*$/).optional(), format: z.enum(["PDF", "CSV", "XLSX"]).default("PDF"), pending: z.enum(["true", "false"]).default("false") }).safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!input.success) return NextResponse.json({ error: "Ano, meses ou formato inválidos." }, { status: 400 });
  const months = input.data.months ? [...new Set(input.data.months.split(",").map(Number))].sort((a, b) => a - b) : Array.from({ length: 12 }, (_, index) => index + 1);
  const agenda = await readControlAgenda(db, { usuarioId: context.user.id, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds });
  const headers = ["Mês", "Prazo", "Plano", "Obrigação", "Criticidade", "Situação", "Baixa", "Justificativa", "ID"];
  const rows = months.flatMap(month => {
    const items = agenda.filter(item => { const due = new Date(item.dueAt); return due.getUTCFullYear() === input.data.year && due.getUTCMonth() + 1 === month && (input.data.pending !== "true" || !item.completion); });
    return items.length ? items.sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id)).map(item => [String(month), item.dueAt.slice(0, 10), item.planTitle, item.title, item.criticality, item.completion ? "BAIXADA" : "PENDENTE", item.completion?.at ?? "", item.completion?.reason ?? "", item.id]) : [[String(month), "", "", "Sem obrigações visíveis no filtro", "", "", "", "", ""]];
  });
  const title = `Calendário de obrigações — ${input.data.year} — meses ${months.join(", ")}`;
  const hash = createHash("sha256").update(JSON.stringify({ title, headers, rows })).digest("hex");
  const output = await renderControlReport({ title, headers, rows, hash }, input.data.format);
  await insertAuditEvent(db, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "CONTROL_AGENDA", targetId: String(input.data.year) });
  return new NextResponse(new Uint8Array(output.bytes), { headers: { "Content-Type": output.contentType, "Content-Disposition": `attachment; filename="calendario-obrigacoes-${input.data.year}.${output.extension}"`, "Cache-Control": "private, no-store", "X-Dataset-SHA256": hash } });
}
