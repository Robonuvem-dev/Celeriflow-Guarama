import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { db } from "@/db/client";
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { processes, processMovements, processSubjects } from "@/db/schema/processes";
import { departments } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { companies } from "@/db/schema/registry";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Send, Layers } from "lucide-react";
import RemessasClient, {
  type RemessaSummary,
  type RemessaProcessItem,
  type AvailableProcess,
  type DepartmentOption,
} from "./RemessasClient";

export const dynamic = "force-dynamic";

export default async function ProtocolRemessasPage() {
  const context = await getProtocolContext();
  const currentDeptId = context.user.departmentId || null;
  const canOperate = context.protocolAccess.canUpdate && Boolean(currentDeptId);

  // Departamentos ativos
  const activeDepartments: DepartmentOption[] = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(eq(departments.isActive, true))
    .orderBy(departments.name);

  const deptMap = new Map(activeDepartments.map((d) => [d.id, d.name]));

  // Buscar movimentações de remessa
  const movementsWithRemessa = await db
    .select({
      id: processMovements.id,
      processId: processMovements.processId,
      fromDepartmentId: processMovements.fromDepartmentId,
      toDepartmentId: processMovements.toDepartmentId,
      status: processMovements.status,
      reason: processMovements.reason,
      movedAt: processMovements.movedAt,
      receivedAt: processMovements.receivedAt,
      protocolNumber: processes.protocolNumber,
      personName: people.fullName,
      companyName: companies.corporateName,
    })
    .from(processMovements)
    .innerJoin(processes, eq(processes.id, processMovements.processId))
    .leftJoin(people, eq(people.id, processes.personId))
    .leftJoin(companies, eq(companies.id, processes.companyId))
    .where(
      and(
        like(processMovements.reason, "[Remessa:%"),
        protocolScopeCondition(context)
      )
    )
    .orderBy(desc(processMovements.movedAt))
    .limit(500);

  // Agrupar por remessa
  const remessasMap = new Map<string, RemessaSummary>();
  const remessaProcessList: RemessaProcessItem[] = [];

  for (const mov of movementsWithRemessa) {
    const match = mov.reason?.match(/\[Remessa:\s*([A-Z0-9-]+)\]\s*(.*)/);
    const remessaNumber = match ? match[1] : "REM-DESCONHECIDA";
    const notes = match && match[2] ? match[2].trim() : null;
    const interessado = mov.personName || mov.companyName || "Não informado";

    remessaProcessList.push({
      processId: mov.processId,
      protocolNumber: mov.protocolNumber,
      remessaNumber,
      fromDepartmentName: mov.fromDepartmentId ? deptMap.get(mov.fromDepartmentId) || "Origem" : "Abertura",
      toDepartmentName: deptMap.get(mov.toDepartmentId) || "Destino",
      status: mov.status === "RECEIVED" ? "Recebido" : mov.status === "AWAITING_RECEIPT" ? "Aguardando Recebimento" : mov.status,
      movedAt: mov.movedAt.toLocaleString("pt-BR"),
      interessado,
    });

    if (!remessasMap.has(remessaNumber)) {
      remessasMap.set(remessaNumber, {
        remessaNumber,
        fromDepartmentId: mov.fromDepartmentId || "",
        fromDepartmentName: mov.fromDepartmentId ? deptMap.get(mov.fromDepartmentId) || "Origem" : "Abertura",
        toDepartmentId: mov.toDepartmentId,
        toDepartmentName: deptMap.get(mov.toDepartmentId) || "Destino",
        processCount: 1,
        status: mov.status === "RECEIVED" ? "Recebida" : "Aguardando Recebimento",
        createdAt: mov.movedAt.toLocaleString("pt-BR"),
        notes,
        processProtocols: [mov.protocolNumber],
      });
    } else {
      const existing = remessasMap.get(remessaNumber)!;
      existing.processCount += 1;
      existing.processProtocols.push(mov.protocolNumber);
      if (mov.status === "AWAITING_RECEIPT") {
        existing.status = "Aguardando Recebimento";
      }
    }
  }

  const remessasSummaryList = Array.from(remessasMap.values());

  // Buscar processos disponíveis no setor atual para envio
  let availableInCurrentSector: AvailableProcess[] = [];
  if (currentDeptId) {
    const availableRows = await db
      .select({
        id: processes.id,
        protocolNumber: processes.protocolNumber,
        subjectName: processSubjects.name,
        personName: people.fullName,
        companyName: companies.corporateName,
        createdAt: processes.createdAt,
      })
      .from(processes)
      .innerJoin(processSubjects, eq(processSubjects.id, processes.subjectId))
      .leftJoin(people, eq(people.id, processes.personId))
      .leftJoin(companies, eq(companies.id, processes.companyId))
      .where(
        and(
          eq(processes.currentDepartmentId, currentDeptId),
          or(eq(processes.status, "Aberto"), eq(processes.status, "Em Andamento")),
          protocolScopeCondition(context)
        )
      )
      .orderBy(desc(processes.createdAt))
      .limit(100);

    availableInCurrentSector = availableRows.map((p) => ({
      id: p.id,
      protocolNumber: p.protocolNumber,
      subjectName: p.subjectName,
      interessado: p.personName || p.companyName || "Não informado",
      createdAt: p.createdAt.toLocaleDateString("pt-BR"),
    }));
  }

  return (
    <PageFrame className="max-w-7xl space-y-4">
      <PageHeader
        title="Gestão de Remessas e Tramitação em Lote (CF19)"
        icon={<Layers className="size-5 shrink-0 text-emerald-600" />}
      />

      <RemessasClient
        remessas={remessasSummaryList}
        remessaProcesses={remessaProcessList}
        availableProcesses={availableInCurrentSector}
        departments={activeDepartments}
        currentDepartmentId={currentDeptId}
        canOperate={canOperate}
      />
    </PageFrame>
  );
}
