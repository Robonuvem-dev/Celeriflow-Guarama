import { db, databaseConnection } from '../src/db/client';
import { neighborhoods } from '../src/db/schema/localities';
import { people } from '../src/db/schema/people';
import { addresses, companies, documents, realEstates, suppliers, taxpayers } from '../src/db/schema/registry';
import 'dotenv/config';

async function main() {
  console.log('Seeding Modulo 2 - Cadastros...');

  // 1. Neighborhoods
  const [centro] = await db.insert(neighborhoods).values({ name: 'Centro', type: 'Bairro', city: 'São Paulo', state: 'SP' }).returning();
  const [pinheiros] = await db.insert(neighborhoods).values({ name: 'Pinheiros', type: 'Bairro', city: 'São Paulo', state: 'SP' }).returning();

  // 2. Persons
  const [p1] = await db.insert(people).values({ fullName: 'João Silva', cpf: '11122233344', email: 'joao@email.com' }).returning();
  const [p2] = await db.insert(people).values({ fullName: 'Maria Oliveira', cpf: '55566677788', email: 'maria@email.com' }).returning();
  await db.insert(people).values({ fullName: 'Carlos Pereira', cpf: '99900011122', email: 'carlos@email.com' });

  // 3. Companies
  const [c1] = await db.insert(companies).values({ corporateName: 'Empresa Alpha Ltda', cnpj: '12345678000199', companyType: 'LTDA' }).returning();
  const [c2] = await db.insert(companies).values({ corporateName: 'Tech Solutions S.A.', cnpj: '98765432000111', companyType: 'SA' }).returning();

  // 4. Taxpayers
  const [t1] = await db.insert(taxpayers).values({ taxpayerType: 'PF', municipalInsc: 'IM-1001', personId: p1.id }).returning();
  const [t2] = await db.insert(taxpayers).values({ taxpayerType: 'PJ', municipalInsc: 'IM-1002', companyId: c1.id }).returning();

  // 5. Suppliers
  await db.insert(suppliers).values({ category: 'Serviços de TI', personId: p2.id });
  await db.insert(suppliers).values({ category: 'Fornecimento de Equipamentos', companyId: c2.id });

  // 6. Addresses
  await db.insert(addresses).values({ zipCode: '01000-000', streetName: 'Rua Direita', number: '100', neighborhoodId: centro.id, personId: p1.id });
  await db.insert(addresses).values({ zipCode: '05400-000', streetName: 'Av. Faria Lima', number: '2000', neighborhoodId: pinheiros.id, companyId: c1.id });

  // 7. RealEstates
  await db.insert(realEstates).values({ municipalInsc: 'IMO-5001', propertyType: 'Casa', streetName: 'Rua das Flores', number: '123', neighborhoodId: centro.id, taxpayerId: t1.id });
  await db.insert(realEstates).values({ municipalInsc: 'IMO-5002', propertyType: 'Prédio Comercial', streetName: 'Av. Paulista', number: '1000', neighborhoodId: centro.id, taxpayerId: t2.id });

  // 8. Documents
  await db.insert(documents).values({ title: 'RG João', documentType: 'RG', fileUrl: 'https://exemplo.com/rg.pdf', personId: p1.id });
  await db.insert(documents).values({ title: 'Contrato Social Alpha', documentType: 'Contrato', fileUrl: 'https://exemplo.com/contrato.pdf', companyId: c1.id });

  console.log('Modulo 2 seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await databaseConnection.pool.end();
  });
