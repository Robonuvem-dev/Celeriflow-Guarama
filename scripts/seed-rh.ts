import * as dotenv from 'dotenv';
import { eq } from 'drizzle-orm';
import type { DatabaseConnection } from '../src/db/connection';
import { withDatabaseTransaction } from '../src/db/transaction';
import * as t from '../src/db/schema/municipal-setup-tools';
import { openMunicipalSetupConnection } from './lib/municipal-setup-tools';
dotenv.config();

export async function seedRh(connection: DatabaseConnection, log: (message: string) => void = console.log) {
  log('Iniciando seed de RH...');
  return withDatabaseTransaction(connection, async tx => {
    let [role] = await tx.select().from(t.roles).limit(1);
    if (!role) [role] = await tx.insert(t.roles).values({ name: 'Analista de RH', description: 'Analista', level: 'Servidor' }).returning();
    let [sec] = await tx.select().from(t.secretariats).limit(1);
    if (!sec) [sec] = await tx.insert(t.secretariats).values({ name: 'Secretaria de Administração', acronym: 'SEC-ADM' }).returning();
    let [dept] = await tx.select().from(t.departments).limit(1);
    if (!dept) [dept] = await tx.insert(t.departments).values({ name: 'Recursos Humanos', description: 'Departamento de RH', secretariatId: sec.id }).returning();
    let [emp1] = await tx.select().from(t.employees).where(eq(t.employees.cpf, '111.111.111-11')).limit(1);
    if (!emp1) [emp1] = await tx.insert(t.employees).values({ name: 'João Carlos Silva', cpf: '111.111.111-11', registration: 'MAT-001', email: 'joao.silva@exemplo.com', phone: '(11) 99999-1111', isActive: true, roleId: role.id, departmentId: dept.id, secretariatId: sec.id }).returning();
    let [emp2] = await tx.select().from(t.employees).where(eq(t.employees.cpf, '222.222.222-22')).limit(1);
    if (!emp2) [emp2] = await tx.insert(t.employees).values({ name: 'Maria Fernanda Souza', cpf: '222.222.222-22', registration: 'MAT-002', email: 'maria.souza@exemplo.com', phone: '(11) 99999-2222', isActive: true, roleId: role.id, departmentId: dept.id, secretariatId: sec.id }).returning();
    let [emp3] = await tx.select().from(t.employees).where(eq(t.employees.cpf, '333.333.333-33')).limit(1);
    if (!emp3) [emp3] = await tx.insert(t.employees).values({ name: 'Pedro Henrique Oliveira', cpf: '333.333.333-33', registration: 'MAT-003', email: 'pedro.oliveira@exemplo.com', isActive: false, roleId: role.id, departmentId: dept.id, secretariatId: sec.id }).returning();
    log('Servidores criados.');
    await tx.insert(t.payrolls).values({ competence: '06/2026', type: 'Mensal', status: 'Fechada', totalValue: 7000.00 });
    await tx.insert(t.payrolls).values({ competence: '07/2026', type: 'Mensal', status: 'Aberta', totalValue: 7000.00 });
    log('Folhas criadas.');
    await tx.insert(t.vacations).values({ employeeId: emp1.id, acquisitionStart: new Date('2024-01-01'), acquisitionEnd: new Date('2024-12-31'), enjoymentStart: new Date('2025-01-10'), enjoymentEnd: new Date('2025-02-08'), days: 30, status: 'Concluída' });
    await tx.insert(t.vacations).values({ employeeId: emp2.id, acquisitionStart: new Date('2025-01-01'), acquisitionEnd: new Date('2025-12-31'), days: 30, status: 'Disponível' });
    log('Férias criadas.');
    // Preserve the original shared Date mutation/order (including local hours).
    const today = new Date();
    await tx.insert(t.attendances).values({ employeeId: emp1.id, date: today, entryTime: new Date(today.setHours(8, 0, 0, 0)), exitTime: new Date(today.setHours(17, 0, 0, 0)), status: 'Presente', hoursWorked: 9 });
    log('Ponto criado.');
    await tx.insert(t.leaves).values({ employeeId: emp2.id, type: 'Médica', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-15'), reason: 'Atestado CID X01', status: 'Ativa' });
    log('Licença criada.');
    await tx.insert(t.dependents).values({ employeeId: emp1.id, name: 'Lucas Silva', birthDate: new Date('2015-05-10'), relationship: 'Filho(a)' });
    log('Dependente criado.');
    let [benefitConfig] = await tx.select().from(t.benefits).where(eq(t.benefits.name, 'Vale Transporte')).limit(1);
    if (!benefitConfig) [benefitConfig] = await tx.insert(t.benefits).values({ name: 'Vale Transporte', type: 'Vale Transporte', baseValue: 250.00 }).returning();
    await tx.insert(t.payrollBenefits).values({ employeeId: emp1.id, benefitConfigId: benefitConfig.id, customValue: 250.00, status: 'Ativo' });
    log('Benefício criado.');
    await tx.insert(t.acts).values({ employeeId: emp1.id, type: 'Nomeação', date: new Date('2020-01-15'), actNumber: 'PORT-101/2020' });
    await tx.insert(t.acts).values({ employeeId: emp3.id, type: 'Exoneração', date: new Date('2026-06-30'), actNumber: 'PORT-202/2026' });
    log('Atos criados.');
    log('Seed de RH finalizado com sucesso!');
  });
}

async function main() {
  const connection = openMunicipalSetupConnection();
  try { await seedRh(connection); }
  finally { await connection.pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
