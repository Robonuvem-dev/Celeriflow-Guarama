import { createDatabaseConnection } from '../src/db/connection';
import { people } from '../src/db/schema/people';
import { companies } from '../src/db/schema/registry';
import { departments, employees } from '../src/db/schema/administration';
import { processTypes, processSubjects, processes, processMovements, processDispatches } from '../src/db/schema/processes';

const connection = createDatabaseConnection(process.env.DATABASE_URL!);
const db = connection.db;

async function main() {
  console.log('Iniciando inserção de dados de teste para o Módulo 3...');

  // Busca entidades necessárias (criadas no seed anterior)
  const [person] = await db.select().from(people).limit(1);
  const [person2] = await db.select().from(people).limit(1).offset(1);
  const [company] = await db.select().from(companies).limit(1);
  const [department] = await db.select().from(departments).limit(1);
  const [employee] = await db.select().from(employees).limit(1);

  if (!person || !department || !employee) {
    throw new Error('Certifique-se de que o seed anterior foi rodado. Faltam Person, Department ou Employee.');
  }

  // Limpar Processos antigos se necessário (opcional, para evitar duplicação)
  // await db.delete(processes);

  // Criando Diversos Tipos de Processos
  const [typeAlvara] = await db.insert(processTypes).values({ name: 'Alvará de Funcionamento', description: 'Solicitação de alvará para estabelecimentos comerciais.' }).returning();

  const [typeLicenca] = await db.insert(processTypes).values({ name: 'Licença Ambiental', description: 'Emissão de licença ambiental para obras e atividades.' }).returning();

  const [typeAprovacao] = await db.insert(processTypes).values({ name: 'Aprovação de Projeto', description: 'Aprovação de projetos arquitetônicos.' }).returning();

  const [typeITBI] = await db.insert(processTypes).values({ name: 'Guia de ITBI', description: 'Emissão de guia para pagamento de ITBI.' }).returning();

  // Criando Assuntos
  const [subRenovacao] = await db.insert(processSubjects).values({ name: 'Renovação Anual', processTypeId: typeAlvara.id, slaDays: 15 }).returning();
  const [subNovaLicenca] = await db.insert(processSubjects).values({ name: 'Licença Prévia', processTypeId: typeLicenca.id, slaDays: 30 }).returning();
  const [subProjetoResidencial] = await db.insert(processSubjects).values({ name: 'Residencial Unifamiliar', processTypeId: typeAprovacao.id, slaDays: 20 }).returning();
  const [subITBIVenda] = await db.insert(processSubjects).values({ name: 'Compra e Venda', processTypeId: typeITBI.id, slaDays: 5 }).returning();

  // Processo 1: Em Análise (Alvará)
  const [process1] = await db.insert(processes).values({
      protocolNumber: '2026/90001',
      status: 'Em Análise',
      description: 'Solicito a renovação do meu alvará de funcionamento.',
      processTypeId: typeAlvara.id,
      subjectId: subRenovacao.id,
      personId: person.id,
      currentDepartmentId: department.id
  }).returning();

  await db.insert(processMovements).values({
      processId: process1.id,
      fromDepartmentId: department.id,
      toDepartmentId: department.id,
      employeeId: employee.id,
      reason: 'Encaminhado para análise técnica.'
  });

  await db.insert(processDispatches).values({
      processId: process1.id,
      content: 'A documentação parece estar completa. Aguardando vistoria.',
      dispatchType: 'Parecer',
      employeeId: employee.id,
      departmentId: department.id
  });

  // Processo 2: Aberto (ITBI)
  await db.insert(processes).values({
      protocolNumber: '2026/90002',
      status: 'Aberto',
      description: 'Solicitação de ITBI referente ao imóvel matrícula 12345.',
      processTypeId: typeITBI.id,
      subjectId: subITBIVenda.id,
      personId: person2?.id || person.id,
      currentDepartmentId: department.id
  });

  // Processo 3: Concluído (Aprovação de Projeto)
  const [process3] = await db.insert(processes).values({
      protocolNumber: '2026/90003',
      status: 'Concluído',
      description: 'Projeto de construção de residência unifamiliar no bairro Centro.',
      processTypeId: typeAprovacao.id,
      subjectId: subProjetoResidencial.id,
      companyId: company?.id,
      currentDepartmentId: department.id
  }).returning();

  await db.insert(processDispatches).values({
      processId: process3.id,
      content: 'Projeto analisado e aprovado conforme diretrizes municipais. Alvará de construção emitido.',
      dispatchType: 'Decisão',
      employeeId: employee.id,
      departmentId: department.id
  });

  // Processo 4: Arquivado (Licença Ambiental)
  await db.insert(processes).values({
      protocolNumber: '2026/90004',
      status: 'Arquivado',
      description: 'Solicitação de licença prévia para loteamento.',
      processTypeId: typeLicenca.id,
      subjectId: subNovaLicenca.id,
      companyId: company?.id,
      currentDepartmentId: department.id
  });

  // Processo 5: Em Análise (ITBI)
  await db.insert(processes).values({
      protocolNumber: '2026/90005',
      status: 'Em Análise',
      description: 'Emissão de ITBI urgente.',
      processTypeId: typeITBI.id,
      subjectId: subITBIVenda.id,
      personId: person.id,
      currentDepartmentId: department.id,
      priority: 'Urgente'
  });

  console.log('Inserção de dados do Módulo 3 concluída com sucesso!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await connection.pool.end();
  });
