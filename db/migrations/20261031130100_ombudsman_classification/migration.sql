ALTER TABLE "Ombudsman"
  ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'Normal',
  ADD COLUMN "complaintTeam" TEXT,
  ADD COLUMN "complaintProfessionalId" TEXT REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Ombudsman" ADD CONSTRAINT "Ombudsman_priority_check" CHECK ("priority" IN ('Baixa', 'Normal', 'Alta', 'Urgente'));
