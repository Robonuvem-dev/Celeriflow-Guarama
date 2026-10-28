import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { assertSstClinicalAccess } from "@/lib/sst/access";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { findSstUnit } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { PrintAso } from "../[id]/imprimir/PrintAso";

export default async function BlankAso({ searchParams }: { searchParams: Promise<{ budgetUnitId?: string }> }) {
  const context = await getTenantContextForModuleOperation("SST", "issueReports");
  const { budgetUnitId } = await searchParams;
  const id = z.string().min(1).parse(budgetUnitId);
  await assertSstClinicalAccess(context, id);
  const unit = await findSstUnit(sstDatabase(context), id);
  if (!unit) throw new Error("Unidade gestora não encontrada.");
  await writeAuditEvent(sstDatabase(context), { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "SST_ASO_BLANK", targetId: id });
  return <div data-sst-aso className="space-y-5 p-6"><div className="print:hidden"><PrintAso/></div><h1 className="text-center text-xl font-bold">ATESTADO DE SAÚDE OCUPACIONAL — ASO EM BRANCO</h1><p className="text-center">{unit.name} · UG {unit.id}</p>{["Nome e CPF", "Matrícula / referência de concurso", "Contrato / entidade / vínculo funcional", "Cargo / função / local", "Tipo de ASO", "PCMSO versão / GHE", "Riscos ocupacionais", "Data de realização / validade", "Exames (nome, origem, realização e validade)", "Profissional, conselho / laboratório e laudo", "Conclusão / aptidão", "Restrições e recomendações", "Médico examinador e conselho", "Assinatura do médico / data"].map((label) => <p key={label} className="border-b pb-8">{label}: </p>)}<p className="text-xs">Modelo para preenchimento. Não constitui ASO emitido nem documento digital assinado.</p></div>;
}
