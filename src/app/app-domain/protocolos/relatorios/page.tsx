import { BarChart3 } from "lucide-react";
import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { db } from "@/db/client";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  processes,
  processTypes,
  processSubjects,
  processMovements,
} from "@/db/schema/processes";
import { departments } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { companies } from "@/db/schema/registry";
import { processReferenceCatalog } from "@/db/schema/process-reference-catalog";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import ReportsClient, {
  type ProcessReportItem,
  type ProcessTypeOption,
  type SubjectOption,
  type SituationOption,
} from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ProtocolReportsPage() {
  const context = await getProtocolContext();

  // Buscar tipos de processo, assuntos e situações
  const [typesRows, subjectRows, situationRows] = await Promise.all([
    db.select({ id: processTypes.id, name: processTypes.name }).from(processTypes).where(eq(processTypes.isActive, true)).orderBy(asc(processTypes.name)),
    db.select({ id: processSubjects.id, name: processSubjects.name, processTypeId: processSubjects.processTypeId }).from(processSubjects).where(eq(processSubjects.isActive, true)).orderBy(asc(processSubjects.name)),
    db.select({ id: processReferenceCatalog.id, name: processReferenceCatalog.name }).from(processReferenceCatalog).where(and(eq(processReferenceCatalog.kind, "PROCESS_SITUATION"), eq(processReferenceCatalog.isActive, true))).orderBy(asc(processReferenceCatalog.name)),
  ]);

  // Buscar processos no escopo
  const processRows = await db
    .select({
      id: processes.id,
      protocolNumber: processes.protocolNumber,
      status: processes.status,
      priority: processes.priority,
      description: processes.description,
      createdAt: processes.createdAt,
      typeName: processTypes.name,
      subjectName: processSubjects.name,
      departmentName: departments.name,
      personName: people.fullName,
      personCpf: people.cpf,
      companyName: companies.corporateName,
      companyCnpj: companies.cnpj,
    })
    .from(processes)
    .innerJoin(processTypes, eq(processTypes.id, processes.processTypeId))
    .innerJoin(processSubjects, eq(processSubjects.id, processes.subjectId))
    .leftJoin(departments, eq(departments.id, processes.currentDepartmentId))
    .leftJoin(people, eq(people.id, processes.personId))
    .leftJoin(companies, eq(companies.id, processes.companyId))
    .where(protocolScopeCondition(context))
    .orderBy(desc(processes.createdAt))
    .limit(1000);

  // Buscar últimas movimentações para enriquecer comprovantes e histórico
  const processIds = processRows.map((p) => p.id);
  const movementRows = processIds.length > 0
    ? await db
        .select({
          processId: processMovements.processId,
          reason: processMovements.reason,
          movedAt: processMovements.movedAt,
          fromDepartmentId: processMovements.fromDepartmentId,
          toDepartmentId: processMovements.toDepartmentId,
        })
        .from(processMovements)
        .orderBy(desc(processMovements.movedAt))
        .limit(2000)
    : [];

  const departmentRows = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments);
  const deptMap = new Map(departmentRows.map((d) => [d.id, d.name]));

  const movementsByProcess = new Map<string, typeof movementRows>();
  for (const mov of movementRows) {
    if (!movementsByProcess.has(mov.processId)) {
      movementsByProcess.set(mov.processId, []);
    }
    movementsByProcess.get(mov.processId)!.push(mov);
  }

  const reportItems: ProcessReportItem[] = processRows.map((p) => {
    const movs = movementsByProcess.get(p.id) || [];
    const lastMov = movs[0];
    const createdDate = new Date(p.createdAt);

    return {
      id: p.id,
      protocolNumber: p.protocolNumber,
      processTypeName: p.typeName,
      subjectName: p.subjectName,
      status: p.status,
      interessado: p.personName || p.companyName || "Não informado",
      interessadoDoc: p.personCpf || p.companyCnpj || undefined,
      currentDepartmentName: p.departmentName || "Protocolo Geral",
      createdAt: createdDate.toLocaleString("pt-BR"),
      rawDate: createdDate.toISOString().slice(0, 10),
      year: createdDate.getFullYear(),
      priority: p.priority,
      description: p.description || undefined,
      movementsCount: movs.length,
      lastMovementReason: lastMov?.reason || undefined,
      lastMovementDate: lastMov ? new Date(lastMov.movedAt).toLocaleString("pt-BR") : undefined,
      lastFromDepartment: lastMov?.fromDepartmentId ? deptMap.get(lastMov.fromDepartmentId) : undefined,
      lastToDepartment: lastMov?.toDepartmentId ? deptMap.get(lastMov.toDepartmentId) : undefined,
    };
  });

  return (
    <PageFrame className="max-w-7xl space-y-4">
      <PageHeader
        title="Central Unificada de Relatórios do Protocolo (19.67)"
        icon={<BarChart3 className="size-5 shrink-0 text-emerald-600" />}
      />

      <ReportsClient
        processes={reportItems}
        processTypes={typesRows}
        subjects={subjectRows}
        situations={situationRows}
      />
    </PageFrame>
  );
}
