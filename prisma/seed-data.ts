import { db, databaseConnection } from '../src/db/client';
import { administrativeUnits, departments, employees, institutions, roles, secretariats } from '../src/db/schema/administration';
import { people } from '../src/db/schema/people';
import { companies, taxpayers } from '../src/db/schema/registry';

async function main() {
  console.log('Iniciando inserção de dados de teste...');

  // --- Módulo 1: Administração Geral ---
  console.log('Populando Módulo 1 (Administração)...');
  
  // Institution
  await db.insert(institutions).values({
      name: 'Prefeitura Municipal de Exemplo',
      cnpj: '12.345.678/0001-99',
      mayorName: 'Prefeito João da Silva',
      city: 'Exemplo',
      state: 'SP'
  });

  // Secretariat
  const [sec] = await db.insert(secretariats).values({
      name: 'Secretaria de Educação',
      acronym: 'SME',
      managerName: 'Maria Silva'
  }).returning();

  // Department
  const [dep] = await db.insert(departments).values({
      name: 'Departamento de Ensino Fundamental',
      secretariatId: sec.id
  }).returning();

  // Administrative Unit
  const [unit] = await db.insert(administrativeUnits).values({
      name: 'Escola Municipal Esperança',
      type: 'Escola',
      secretariatId: sec.id
  }).returning();

  // Role
  const [role] = await db.insert(roles).values({
      name: 'Professor Titular',
      level: 'Servidor'
  }).returning();

  // Employee
  await db.insert(employees).values({
      name: 'Carlos Educador',
      cpf: '111.222.333-44',
      email: 'carlos@escola.gov.br',
      roleId: role.id,
      secretariatId: sec.id,
      departmentId: dep.id,
      unitId: unit.id
  });

  // --- Módulo 2: Cadastros Gerais ---
  console.log('Populando Módulo 2 (Cadastros Gerais)...');

  // Person
  const [person] = await db.insert(people).values({
      fullName: 'Ana Cidadã Brasileira',
      cpf: '99988877766',
      email: 'ana@email.com',
      phonePrimary: '(11) 98888-7777',
      status: 'Ativo'
  }).returning();

  // Company
  const [company] = await db.insert(companies).values({
      corporateName: 'Tech Solutions LTDA',
      tradeName: 'Tech Info',
      cnpj: '99888777000166',
      emailPrimary: 'contato@techsolutions.com',
      status: 'Ativo'
  }).returning();

  // Taxpayer (Contribuinte PF)
  await db.insert(taxpayers).values({
      taxpayerType: 'PF',
      municipalInsc: 'IM-12345',
      personId: person.id
  });

  // Taxpayer (Contribuinte PJ)
  await db.insert(taxpayers).values({
      taxpayerType: 'PJ',
      municipalInsc: 'IM-98765',
      companyId: company.id
  });

  console.log('Inserção de dados concluída com sucesso!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await databaseConnection.pool.end();
  });
