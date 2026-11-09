import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { hrFunctionalRecords } from "@/db/schema/personnel-functional-management";
import { employees, departments } from "@/db/schema/administration";
import { eq, desc, asc } from "drizzle-orm";
import { format } from "date-fns";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { PontoNav } from "../PontoNav";
import { OcorrenciasClient } from "./OcorrenciasClient";
import Link from "next/link";
import styles from "@/components/app-ui/operational/operational.module.css";

export const dynamic = "force-dynamic";

export default async function PontoOcorrenciasPage() {
  const context = await getTenantContextForModule("RH");
  const database = context.database ?? db;

  const [rawOccurrences, allEmployees, allDepartments] = await Promise.all([
    database
      .select({
        id: hrFunctionalRecords.id,
        name: hrFunctionalRecords.name,
        employeeId: hrFunctionalRecords.employeeId,
        startsAt: hrFunctionalRecords.startsAt,
        status: hrFunctionalRecords.status,
        data: hrFunctionalRecords.data,
      })
      .from(hrFunctionalRecords)
      .where(eq(hrFunctionalRecords.kind, "OCORRENCIA_PONTO"))
      .orderBy(desc(hrFunctionalRecords.startsAt)),
    database
      .select({ id: employees.id, name: employees.name, registration: employees.registration, departmentId: employees.departmentId })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.name)),
    database
      .select({ id: departments.id, name: departments.name })
      .from(departments),
  ]);

  const empMap = new Map(allEmployees.map((e) => [e.id, e]));
  const depMap = new Map(allDepartments.map((d) => [d.id, d.name]));

  const occurrences = rawOccurrences.map((occ) => {
    const emp = occ.employeeId ? empMap.get(occ.employeeId) : null;
    const depName = emp?.departmentId ? depMap.get(emp.departmentId) || "Geral" : "Geral";
    const data = (occ.data as Record<string, string>) || {};

    return {
      id: occ.id,
      employeeName: emp?.name || "Servidor",
      registration: emp?.registration || "—",
      departmentName: depName,
      dateFormatted: format(new Date(occ.startsAt), "dd/MM/yyyy"),
      rawDate: occ.startsAt.toISOString().slice(0, 10),
      occurrenceType: occ.name || data.occurrenceType || "Ocorrência",
      justification: data.justification || "—",
      documentRef: data.documentRef || "—",
      status: occ.status || "ATIVO",
    };
  });

  return (
    <div className="flex flex-col h-full w-full">
      <PontoNav />
      <OperationalListFrame
        pagination={null /* A tabela e sua paginação são controladas no client. */}
        label="Cadastro e Histórico de Ocorrências de Ponto (Requisitos 20.14 e 20.19)"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/rh/ponto/relatorios?kind=OCORRENCIAS_PONTO"
              className={styles.filterButton}
              title="Emitir relatório oficial de ocorrências de ponto (20.19)"
            >
              Emitir Relatório de Ocorrências (20.19)
            </Link>
            <Link
              href="/rh/ponto"
              className={styles.filterButton}
              title="Voltar para marcações de ponto"
            >
              Espelho de Ponto
            </Link>
          </div>
        }
      >
        <OcorrenciasClient occurrences={occurrences} employees={allEmployees} />
      </OperationalListFrame>
    </div>
  );
}
