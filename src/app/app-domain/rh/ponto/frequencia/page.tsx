import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { employees, departments, roles } from "@/db/schema/administration";
import { attendanceRecords } from "@/db/schema/personnel-records";
import { hrFunctionalRecords } from "@/db/schema/personnel-functional-management";
import { eq, desc, asc, sql } from "drizzle-orm";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { PontoNav } from "../PontoNav";
import { FrequenciaManualClient } from "./FrequenciaManualClient";
import Link from "next/link";
import styles from "@/components/app-ui/operational/operational.module.css";

export const dynamic = "force-dynamic";

export default async function PontoFrequenciaPage() {
  const context = await getTenantContextForModule("RH");
  const database = context.database ?? db;

  const rawEmployees = await database.execute<Record<string, unknown>>(sql`
    SELECT 
      e.id,
      e.name,
      coalesce(e.registration, '') as registration,
      coalesce(d.name, 'Sem lotação') as department_name,
      coalesce(r.name, 'Servidor Público') as role_name,
      CASE 
        WHEN dis.id IS NOT NULL THEN 'Ponto Manual'
        WHEN r.name ILIKE '%Secretário%' OR r.name ILIKE '%Diretor%' THEN 'Ponto Manual'
        ELSE 'Ponto Eletrônico'
      END as punch_type,
      coalesce(dis.data->>'reason', 'Portaria Municipal / Lei Orgânica') as legal_foundation,
      count(DISTINCT a.date::date)::int as days_recorded,
      count(DISTINCT a.date::date) FILTER (WHERE a.status = 'Falta')::int as absences,
      coalesce(sum(a."hoursWorked"), 0)::float as total_worked
    FROM "Employee" e
    LEFT JOIN "Department" d ON d.id = e."departmentId"
    LEFT JOIN "Role" r ON r.id = e."roleId"
    LEFT JOIN "HrFunctionalRecord" dis ON dis.kind = 'DISPENSA_PONTO' 
      AND dis."employeeId" = e.id 
      AND dis.status <> 'CANCELADO'
    LEFT JOIN "AttendanceRecord" a ON a."employeeId" = e.id
    WHERE e."isActive" = true
    GROUP BY e.id, e.name, e.registration, d.name, r.name, dis.id, dis.data
    ORDER BY punch_type ASC, d.name ASC, e.name ASC
  `);

  const employeesList = rawEmployees.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    registration: String(row.registration ?? ""),
    departmentName: String(row.department_name ?? ""),
    roleName: String(row.role_name ?? ""),
    punchType: (String(row.punch_type) === "Ponto Manual" ? "Ponto Manual" : "Ponto Eletrônico") as "Ponto Manual" | "Ponto Eletrônico",
    legalFoundation: String(row.legal_foundation ?? ""),
    daysRecorded: Number(row.days_recorded ?? 0),
    absences: Number(row.absences ?? 0),
    totalWorked: Number(row.total_worked ?? 0),
  }));

  return (
    <div className="flex flex-col h-full w-full">
      <PontoNav />
      <OperationalListFrame
        pagination={null}
        label="Controle de Frequência de Servidores e Lançamento de Ponto Manual (Requisito 20.17 e 20.23)"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/rh/ponto/relatorios?kind=CONTROLE_FREQUENCIA"
              className={styles.filterButton}
              title="Emitir relatório de controle de frequência (20.17)"
            >
              Relatório Frequência (20.17)
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
        <FrequenciaManualClient employeesList={employeesList} />
      </OperationalListFrame>
    </div>
  );
}
