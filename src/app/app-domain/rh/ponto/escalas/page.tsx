import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { hrReferenceRecords } from "@/db/schema/personnel-reference-records";
import { employees, departments } from "@/db/schema/administration";
import { eq, desc, asc } from "drizzle-orm";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { PontoNav } from "../PontoNav";
import { EscalaAutomaticaClient } from "./EscalaAutomaticaClient";
import Link from "next/link";
import styles from "@/components/app-ui/operational/operational.module.css";

export const dynamic = "force-dynamic";

export default async function PontoEscalasPage() {
  const context = await getTenantContextForModule("RH");
  const database = context.database ?? db;

  const [rawScales, allEmployees, allDepartments, allRanges] = await Promise.all([
    database
      .select({
        id: hrReferenceRecords.id,
        name: hrReferenceRecords.name,
        code: hrReferenceRecords.code,
        details: hrReferenceRecords.details,
      })
      .from(hrReferenceRecords)
      .where(eq(hrReferenceRecords.kind, "ESCALA"))
      .orderBy(desc(hrReferenceRecords.updatedAt)),
    database
      .select({ id: employees.id, name: employees.name, registration: employees.registration, departmentId: employees.departmentId })
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(asc(employees.name)),
    database
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .orderBy(asc(departments.name)),
    database
      .select({ id: hrReferenceRecords.id, name: hrReferenceRecords.name })
      .from(hrReferenceRecords)
      .where(eq(hrReferenceRecords.kind, "FAIXA"))
      .orderBy(asc(hrReferenceRecords.name)),
  ]);

  const empMap = new Map(allEmployees.map((e) => [e.id, e]));
  const depMap = new Map(allDepartments.map((d) => [d.id, d.name]));
  const rangeMap = new Map(allRanges.map((r) => [r.id, r.name]));

  const scales = rawScales.map((s) => {
    const details = (s.details as Record<string, string>) || {};
    const emp = details.employeeId ? empMap.get(details.employeeId) : null;
    const dep = emp?.departmentId ? depMap.get(emp.departmentId) : "Geral";
    const rangeName = details.rangeId ? rangeMap.get(details.rangeId) || "Faixa Padrão" : "Faixa Padrão";

    return {
      id: s.id,
      name: s.name,
      employeeName: emp?.name || "Todos os Servidores",
      registration: emp?.registration || "—",
      departmentName: dep || "Geral",
      rangeName,
      weekdays: details.weekdays || "1,2,3,4,5",
      from: details.from || "—",
      until: details.until || "—",
    };
  });

  return (
    <div className="flex flex-col h-full w-full">
      <PontoNav />
      <OperationalListFrame
        pagination={null /* A tabela e sua paginação são controladas no client. */}
        label="Gestão e Geração de Escala Automática de Trabalho (Requisito 20.9)"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/rh/ponto/relatorios?kind=FUNCIONARIOS_EQUIPE"
              className={styles.filterButton}
              title="Ver relação de funcionários por equipe (Requisito 20.21)"
            >
              Relatório Equipes (20.21)
            </Link>
            <Link
              href="/rh/ponto"
              className={styles.filterButton}
              title="Voltar para espelho de ponto"
            >
              Espelho de Ponto
            </Link>
          </div>
        }
      >
        <EscalaAutomaticaClient
          scales={scales}
          employees={allEmployees.map((e) => ({ id: e.id, name: `${e.name} (${e.registration || "—"})` }))}
          departments={allDepartments}
          ranges={allRanges}
        />
      </OperationalListFrame>
    </div>
  );
}
