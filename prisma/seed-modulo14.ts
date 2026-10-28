import { createDatabaseConnection } from '../src/db/connection';
import { secretariats, employees } from '../src/db/schema/administration';
import { realEstates } from '../src/db/schema/registry';
import { people } from '../src/db/schema/people';
import { socialUnits, socialFamilies, socialAttendances, socialPrograms, socialBenefits } from '../src/db/schema/social';

const connection = createDatabaseConnection(process.env.DATABASE_URL!);
const db = connection.db;

async function main() {
  console.log('Seeding Modulo 14 - Assistência Social...');
  const randomSuffix = Math.floor(Math.random() * 10000);

  // This fixture exercises Social data only. It must not create fictitious budget execution.
  const [secretariat] = await db.insert(secretariats).values({ name: 'Secretaria de Assistência Social ' + randomSuffix }).returning();
  const [realEstate1] = await db.insert(realEstates).values({ propertyType: 'Casa', streetName: 'Rua das Flores', number: '123', status: 'Regular' }).returning();
  const [realEstate2] = await db.insert(realEstates).values({ propertyType: 'Galp�o', streetName: 'Av. Central', number: '456', status: 'Regular' }).returning();
  
  // 1. Criar Servidor (Assistente Social e Gestor)
  const [assistenteSocial] = await db.insert(employees).values({ name: 'Carla Assistente Social ' + randomSuffix, registration: 'AS-' + randomSuffix, cpf: ('000111222' + randomSuffix).slice(0, 11), email: 'carla.social' + randomSuffix + '@prefeitura.gov.br', isActive: true, secretariatId: secretariat.id }).returning();

  // 2. Criar Unidades
  const [crasCentro] = await db.insert(socialUnits).values({ name: 'CRAS Centro', type: 'CRAS', phone: '(11) 3333-4444', email: 'cras.centro@prefeitura.gov.br', realEstateId: realEstate1.id, managerId: assistenteSocial.id }).returning();
  await db.insert(socialUnits).values({ name: 'CREAS Zona Sul', type: 'CREAS', phone: '(11) 5555-6666', email: 'creas.sul@prefeitura.gov.br', realEstateId: realEstate2.id });

  // 3. Criar Pessoas e Familias
  const [rep1] = await db.insert(people).values({ fullName: 'Maria Silva ' + randomSuffix, cpf: ('111222333' + randomSuffix).slice(0, 11), gender: 'Feminino' }).returning();
  const [fam1] = await db.insert(socialFamilies).values({ familyCode: 'FAM-100-' + randomSuffix, nis: ('1234567890' + randomSuffix).slice(0, 11), income: 1500.0, perCapitaIncome: 500.0, vulnerabilities: 'Desemprego', representativeId: rep1.id }).returning();

  // 4. Gerar Atendimentos
  await db.insert(socialAttendances).values({ familyId: fam1.id, personId: rep1.id, unitId: crasCentro.id, professionalId: assistenteSocial.id, type: 'Acolhimento', description: 'Acolhimento inicial', isActive: true });

  // 5. Programas e Benefícios
  await db.insert(socialPrograms).values({ name: 'Programa Renda Solidária ' + randomSuffix, sphere: 'Municipal', description: 'Transferência de renda direta' });
  await db.insert(socialBenefits).values({ name: 'Cesta Eventual ' + randomSuffix, description: 'Alimentos não perecíveis', isRecurrent: false });

  console.log('Seeding Modulo 14 - Concluído com sucesso!');
}

main().catch(console.error).finally(() => connection.pool.end());
