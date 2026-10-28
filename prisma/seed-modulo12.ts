import { and, eq } from 'drizzle-orm';
import { createDatabaseConnection } from '../src/db/connection';
import { secretariats, departments, roles, employees } from '../src/db/schema/administration';
import { people } from '../src/db/schema/people';
import { warehouses } from '../src/db/schema/assets-stock';
import { schools, teachers, schoolClasses, students, enrollments, schoolSubjects, classDiaries } from '../src/db/schema/education-core';
import { schoolMeals } from '../src/db/schema/education-meals';

const connection = createDatabaseConnection(process.env.DATABASE_URL!);
const db = connection.db;

async function main() {
  console.log('\n🚀 Iniciando seed do Módulo 12 (Educação)...\n');

  // --- PRE-REQUISITES (Módulo 1: Adm / Módulo 2: Cadastros / Módulo 11: Almoxarifado) ---
  console.log('Verificando pré-requisitos e integrações...');

  // 1. Secretaria de Educação
  let [sec] = await db.select().from(secretariats).where(eq(secretariats.name, 'Secretaria de Educação')).limit(1);
  if (!sec) {
    [sec] = await db.insert(secretariats).values({ name: 'Secretaria de Educação', acronym: 'SME', managerName: 'Maria Silva' }).returning();
  }

  // 2. Departamento
  let [dep] = await db.select().from(departments).where(eq(departments.secretariatId, sec.id)).limit(1);
  if (!dep) {
    [dep] = await db.insert(departments).values({ name: 'Departamento de Ensino Fundamental', secretariatId: sec.id }).returning();
  }

  // 3. Pessoa Genérica para Estudantes e Servidores se não houver
  async function ensurePerson(cpf: string, fullName: string) {
    let [p] = await db.select().from(people).where(eq(people.cpf, cpf)).limit(1);
    if (!p) {
      [p] = await db.insert(people).values({ fullName, cpf, status: 'Ativo' }).returning();
    }
    return p;
  }

  const pDirector1 = await ensurePerson('11111111111', 'Ana Clara Ferreira (Diretora)');
  const pDirector2 = await ensurePerson('22222222222', 'Marcos Ribeiro (Diretor)');
  const pTeacher1 = await ensurePerson('33333333333', 'Juliana Santos (Professora)');
  const pStudent1 = await ensurePerson('44444444444', 'Lucas Ferreira Almeida');
  const pStudent2 = await ensurePerson('55555555555', 'Mariana Costa Lima');
  const pStudent3 = await ensurePerson('66666666666', 'Pedro Henrique Souza');

  // 4. Cargos
  const roleDirector = (await db.select().from(roles).where(eq(roles.name, 'Diretor Escolar')).limit(1))[0] ||
    (await db.insert(roles).values({ name: 'Diretor Escolar', level: 'Diretor' }).returning())[0];
  const roleTeacher = (await db.select().from(roles).where(eq(roles.name, 'Professor Titular')).limit(1))[0] ||
    (await db.insert(roles).values({ name: 'Professor Titular', level: 'Servidor' }).returning())[0];

  // 5. Servidores (Integração RH)
  async function ensureEmployee(cpf: string, name: string, roleId: string, personId: string) {
    let [e] = await db.select().from(employees).where(eq(employees.cpf, cpf)).limit(1);
    if (!e) {
      [e] = await db.insert(employees).values({ name, cpf, roleId, personId, secretariatId: sec!.id, departmentId: dep!.id }).returning();
    }
    return e;
  }

  const empDir1 = await ensureEmployee('11111111111', 'Ana Clara Ferreira', roleDirector.id, pDirector1.id);
  const empDir2 = await ensureEmployee('22222222222', 'Marcos Ribeiro', roleDirector.id, pDirector2.id);
  const empTeacher = await ensureEmployee('33333333333', 'Juliana Santos', roleTeacher.id, pTeacher1.id);

  // 6. Almoxarifado para Merenda (Integração Módulo 11)
  let [warehouse] = await db.select().from(warehouses).where(eq(warehouses.name, 'Almoxarifado Central de Merenda')).limit(1);
  if (!warehouse) {
    [warehouse] = await db.insert(warehouses).values({ name: 'Almoxarifado Central de Merenda', type: 'Central' }).returning();
  }

  console.log('✅ Pré-requisitos garantidos.');

  // --- SEED MÓDULO 12: EDUCAÇÃO ---
  console.log('Criando dados do Módulo 12...');

  // 1. Escolas
  const school1 = (await db.select().from(schools).where(eq(schools.inepCode, '12345601')).limit(1))[0] ??
    (await db.insert(schools).values({
      name: 'Escola Municipal Machado de Assis',
      inepCode: '12345601',
      capacity: 500,
      directorId: empDir1.id,
      phone: '(11) 3333-4444',
      email: 'em.machadodeassis@municipio.gov.br'
    }).onConflictDoNothing({ target: schools.inepCode }).returning())[0] ??
    (await db.select().from(schools).where(eq(schools.inepCode, '12345601')).limit(1))[0];

  const school2 = (await db.select().from(schools).where(eq(schools.inepCode, '12345602')).limit(1))[0] ??
    (await db.insert(schools).values({
      name: 'Centro de Educação Infantil Monteiro Lobato',
      inepCode: '12345602',
      capacity: 200,
      directorId: empDir2.id,
      phone: '(11) 3333-5555',
      email: 'cei.monteirolobato@municipio.gov.br'
    }).onConflictDoNothing({ target: schools.inepCode }).returning())[0] ??
    (await db.select().from(schools).where(eq(schools.inepCode, '12345602')).limit(1))[0];

  console.log('✅ 2 Escolas criadas.');

  // 2. Professor (Módulo 12 table)
  let [teacher] = await db.select().from(teachers).where(eq(teachers.employeeId, empTeacher.id)).limit(1);
  if (!teacher) {
    [teacher] = await db.insert(teachers).values({ employeeId: empTeacher.id }).returning();
  }

  // 3. Turmas
  const class1 = (await db.select().from(schoolClasses).where(and(eq(schoolClasses.name, '1º Ano A'), eq(schoolClasses.schoolId, school1.id))).limit(1))[0] ||
    (await db.insert(schoolClasses).values({
        name: '1º Ano A', year: 2026, stage: 'Ensino Fundamental', grade: '1º Ano',
        shift: 'Manhã', capacity: 30, schoolId: school1.id, teacherId: teacher.id
    }).returning())[0];

  const class2 = (await db.select().from(schoolClasses).where(and(eq(schoolClasses.name, 'Creche II B'), eq(schoolClasses.schoolId, school2.id))).limit(1))[0] ||
    (await db.insert(schoolClasses).values({
        name: 'Creche II B', year: 2026, stage: 'Educação Infantil', grade: 'Creche II',
        shift: 'Integral', capacity: 20, schoolId: school2.id, teacherId: teacher.id
    }).returning())[0];

  console.log('✅ 2 Turmas criadas.');

  // 4. Alunos e Matrículas
  async function ensureStudent(studentCode: string, personId: string, needsTransport: boolean, needsMeal: boolean, schoolId: string, classId: string) {
    let [student] = await db.select().from(students).where(eq(students.studentCode, studentCode)).limit(1);
    if (!student) {
      [student] = await db.insert(students).values({
          studentCode,
          personId,
          usesSchoolTransport: needsTransport,
          needsSpecialMeal: needsMeal
      }).returning();
      // Matricular
      await db.insert(enrollments).values({ year: 2026, studentId: student.id, schoolId, classId });
    }
    return student;
  }

  await ensureStudent('MAT2026001', pStudent1.id, true, false, school1.id, class1.id);
  await ensureStudent('MAT2026002', pStudent2.id, false, true, school1.id, class1.id);
  await ensureStudent('MAT2026003', pStudent3.id, true, true, school2.id, class2.id);

  console.log('✅ 3 Alunos criados e matriculados.');

  // 5. Diário de Classe
  let [subject] = await db.select().from(schoolSubjects).where(eq(schoolSubjects.name, 'Português')).limit(1);
  if (!subject) {
    [subject] = await db.insert(schoolSubjects).values({ name: 'Português', code: 'PORT' }).returning();
  }

  const [classDiary] = await db.select().from(classDiaries).where(eq(classDiaries.classId, class1.id)).limit(1);
  if (!classDiary) {
    await db.insert(classDiaries).values({
        date: new Date(),
        contentTaught: 'Alfabetização Inicial - Vogais',
        status: 'Aberto',
        classId: class1.id,
        teacherId: teacher.id,
        subjectId: subject.id
    });
  }

  // 6. Merenda Escolar
  await db.insert(schoolMeals).values({
      date: new Date(),
      menu: 'Arroz, feijão, frango desfiado e salada de repolho',
      servedQuantity: 450,
      schoolId: school1.id,
      warehouseId: warehouse.id,
      notes: 'Refeição principal servida no turno da manhã'
  });

  await db.insert(schoolMeals).values({
      date: new Date(),
      menu: 'Sopa de legumes com carne',
      servedQuantity: 180,
      schoolId: school2.id,
      warehouseId: warehouse.id
  });

  console.log('✅ Diário e Merendas registradas.');
  console.log('\n🎉 Seed do Módulo 12 concluído!\n');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await connection.pool.end();
  });
