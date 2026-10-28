import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createDatabaseConnection } from '../src/db/connection';
import { createId } from '../src/db/ids';
import { employees } from '../src/db/schema/administration';
import { people } from '../src/db/schema/people';
import { healthUnits, healthProfessionals, healthTeams } from '../src/db/schema/health-workforce';
import { patients } from '../src/db/schema/health-registration';
import { healthAppointments } from '../src/db/schema/health-agenda';
import { medicalRecords } from '../src/db/schema/health-care';
import { medicines } from '../src/db/schema/health-prescriptions';

const connection = createDatabaseConnection(process.env.DATABASE_URL!);
const db = connection.db;

// Seed-only write projections of the historical physical tables.
const seedTimestamps = () => ({
  id: text('id').primaryKey().$defaultFn(createId),
  updatedAt: timestamp('updatedAt', { precision: 3 }).notNull().$defaultFn(() => new Date()),
});
const medicineBatches = pgTable('MedicineBatch', {
  ...seedTimestamps(), batchNumber: text('batchNumber').notNull(), expirationDate: timestamp('expirationDate', { precision: 3 }).notNull(),
  quantity: integer('quantity').notNull(), medicineId: text('medicineId').notNull(),
});
const vaccines = pgTable('Vaccine', {
  ...seedTimestamps(), name: text('name').notNull(), dosesRequired: integer('dosesRequired').notNull(),
});
const vaccinationRecords = pgTable('VaccinationRecord', {
  ...seedTimestamps(), date: timestamp('date', { precision: 3 }).notNull(), doseNumber: integer('doseNumber').notNull(), lotNumber: text('lotNumber'),
  patientId: text('patientId').notNull(), professionalId: text('professionalId').notNull(), unitId: text('unitId').notNull(), vaccineId: text('vaccineId').notNull(),
});

async function main() {
  console.log('Iniciando seed do Módulo 13 - Saúde...');

  const randomUnitSuffix = Math.floor(Math.random() * 90000) + 10000;
  
  // 1. Unidades de Saúde
  const [ubs1] = await db.insert(healthUnits).values({
      name: `UBS Centro ${randomUnitSuffix}`,
      type: 'UBS',
      cnes: `123${randomUnitSuffix}`,
      phone: '(11) 9999-0001',
      isActive: true,
  }).returning();

  const [caps1] = await db.insert(healthUnits).values({
      name: `CAPS II - Mente Saudável ${randomUnitSuffix}`,
      type: 'CAPS',
      cnes: `765${randomUnitSuffix}`,
      phone: '(11) 9999-0002',
      isActive: true,
  }).returning();

  await db.insert(healthUnits).values({
      name: `Farmácia Municipal Central ${randomUnitSuffix}`,
      type: 'Farmácia',
      cnes: `111${randomUnitSuffix}`,
      phone: '(11) 9999-0003',
      isActive: true,
  });

  // 2. Profissionais de Saúde (com Employee base)
  const profs = [];
  const especialidades = ['Clínico Geral', 'Enfermeiro', 'Pediatra', 'Ginecologista', 'Farmacêutico'];
  const conselhos = ['CRM', 'COREN', 'CRM', 'CRM', 'CRF'];

  for (let i = 0; i < 5; i++) {
    const randomSuffix = Math.floor(Math.random() * 9000) + 1000;
    const [emp] = await db.insert(employees).values({
        name: `Profissional Saúde ${randomSuffix}`,
        cpf: `000000${randomSuffix}`,
        email: `prof${randomSuffix}@saude.gov.br`,
        isActive: true,
    }).returning();

    const [prof] = await db.insert(healthProfessionals).values({
        employeeId: emp.id,
        specialty: especialidades[i],
        councilName: conselhos[i],
        councilNumber: `1000${i}`,
        unitId: i < 2 ? ubs1.id : caps1.id,
        isActive: true,
    }).returning();
    profs.push(prof);
  }

  // 3. Equipes ESF
  const [team1] = await db.insert(healthTeams).values({
      name: `Equipe ESF Centro - Azul ${randomUnitSuffix}`,
      code: `ESF-01-${randomUnitSuffix}`,
      microarea: 'Centro e Jardins',
      unitId: ubs1.id,
      isActive: true,
  }).returning();

  const [team2] = await db.insert(healthTeams).values({
      name: `Equipe ESF Norte - Verde ${randomUnitSuffix}`,
      code: `ESF-02-${randomUnitSuffix}`,
      microarea: 'Zona Norte',
      unitId: caps1.id,
      isActive: true,
  }).returning();

  // 4. Pacientes (com Person base)
  const pacientes = [];
  for (let i = 0; i < 5; i++) {
    const randomSuffix = Math.floor(Math.random() * 9000) + 1000;
    const [person] = await db.insert(people).values({
        fullName: `Paciente Teste ${randomSuffix}`,
        cpf: `111222${randomSuffix}`,
        birthDate: new Date(1980 + i, i, 10),
    }).returning();

    const [patient] = await db.insert(patients).values({
        personId: person.id,
        cns: `700000000${randomSuffix}`,
        bloodType: i % 2 === 0 ? 'O+' : 'A-',
        referenceUnitId: ubs1.id,
        teamId: i % 2 === 0 ? team1.id : team2.id,
    }).returning();
    pacientes.push(patient);
  }

  // 5. Agendamentos
  const agendamentos = [];
  for (let i = 0; i < 10; i++) {
    const [ag] = await db.insert(healthAppointments).values({
        date: new Date(Date.now() + (i * 86400000)), // Agendamentos futuros
        specialty: i % 2 === 0 ? 'Clínica Médica' : 'Enfermagem',
        status: i < 3 ? 'Atendido' : 'Agendado',
        patientId: pacientes[i % 5].id,
        unitId: ubs1.id,
        professionalId: profs[i % 2].id,
    }).returning();
    agendamentos.push(ag);
  }

  // 6. Atendimentos / Prontuários (MedicalRecord)
  for (let i = 0; i < 3; i++) {
    await db.insert(medicalRecords).values({
        date: new Date(),
        type: i === 0 ? 'Triagem' : 'Consulta',
        bloodPressure: '120/80',
        temperature: 36.5,
        chiefComplaint: i === 0 ? undefined : 'Dor de cabeça e febre há 3 dias',
        conduct: i === 0 ? undefined : 'Prescrito paracetamol e repouso',
        patientId: pacientes[i].id,
        professionalId: profs[0].id,
        unitId: ubs1.id,
        appointmentId: agendamentos[i].id,
    });
  }

  // 7. Farmácia (Medicamentos e Lotes)
  const meds = [
    { name: 'Paracetamol', active: 'Paracetamol', pres: 'Comprimido', conc: '500mg' },
    { name: 'Amoxicilina', active: 'Amoxicilina', pres: 'Cápsula', conc: '500mg' },
    { name: 'Losartana', active: 'Losartana Potássica', pres: 'Comprimido', conc: '50mg' },
  ];

  for (const m of meds) {
    const randomMedSuffix = Math.floor(Math.random() * 9000) + 1000;
    const [med] = await db.insert(medicines).values({
        name: `${m.name} ${randomMedSuffix}`,
        activePrinciple: m.active,
        presentation: m.pres,
        concentration: m.conc,
        currentStock: 1000,
        minStock: 200,
    }).returning();

    await db.insert(medicineBatches).values({
        batchNumber: `LOTE-${Math.floor(Math.random() * 10000)}`,
        expirationDate: new Date(Date.now() + 31536000000), // 1 ano
        quantity: 1000,
        medicineId: med.id,
    });
  }

  // 8. Vacinas
  const vaxList = ['Hepatite B', 'BCG', 'Poliomielite', 'Febre Amarela'];
  for (const v of vaxList) {
    const randomVaxSuffix = Math.floor(Math.random() * 9000) + 1000;
    const [vaccine] = await db.insert(vaccines).values({
        name: `${v} ${randomVaxSuffix}`,
        dosesRequired: 2,
    }).returning();

    await db.insert(vaccinationRecords).values({
        date: new Date(),
        doseNumber: 1,
        lotNumber: 'VAX-2026',
        patientId: pacientes[0].id,
        professionalId: profs[1].id, // Enfermeiro
        unitId: ubs1.id,
        vaccineId: vaccine.id,
    });
  }

  console.log('Seed do Módulo 13 - Saúde concluído com sucesso!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await connection.pool.end();
  });
