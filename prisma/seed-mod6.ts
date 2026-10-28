import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { createDatabaseConnection } from '../src/db/connection';
import { companies, suppliers } from '../src/db/schema/registry';
import { secretariats } from '../src/db/schema/administration';
import { purchaseProcesses, biddings, procurementContracts } from '../src/db/schema/procurement-core';
import { portalNews, officialDiaries } from '../src/db/schema/portal-content';

const connection = createDatabaseConnection(process.env.DATABASE_URL!);
const db = connection.db;

async function seedMod6() {
  console.log("🚀 Iniciando seed do Módulo 6 (Portal e Transparência e integração com Mod 9)...");

  // 1. Criar Empresa para o Fornecedor (se não existir)
  let [company] = await db.select().from(companies).where(eq(companies.cnpj, "12345678000199")).limit(1);
  if (!company) {
    [company] = await db.insert(companies).values({
        cnpj: "12345678000199",
        corporateName: "Construtora CeleriFlow S.A.",
        tradeName: "Celeri Construções",
        stateInsc: "123456",
        municipalInsc: "7890",
        openingDate: new Date("2010-01-01"),
        status: "Ativo"
    }).returning();
    console.log("✅ Empresa Celeri Construções criada.");
  }

  // 2. Criar Fornecedor vinculado à empresa
  let [supplier] = await db.select().from(suppliers).where(eq(suppliers.companyId, company.id)).limit(1);
  if (!supplier) {
    [supplier] = await db.insert(suppliers).values({
        companyId: company.id,
        category: "Construção Civil",
        businessBranch: "Engenharia",
        status: "Ativo"
    }).returning();
    console.log("✅ Fornecedor criado.");
  }

  // Precisa de uma secretaria (já deve existir do seed_administracao, mas garantimos uma)
  let [secEdu] = await db.select().from(secretariats).where(eq(secretariats.acronym, "SME")).limit(1);
  if (!secEdu) {
    [secEdu] = await db.insert(secretariats).values({
        name: "Secretaria Municipal de Educação",
        acronym: "SME",
        isActive: true
    }).returning();
  }

  // 3. Criar Processo de Compra
  let [purchaseProcess] = await db.select().from(purchaseProcesses).where(eq(purchaseProcesses.number, "PRC-2026/001")).limit(1);
  if (!purchaseProcess) {
    [purchaseProcess] = await db.insert(purchaseProcesses).values({
        number: "PRC-2026/001",
        object: "Reforma geral da Escola Municipal Infantil",
        type: "Obras",
        modality: "Concorrência",
        estimatedValue: 1500000.00,
        status: "Homologado",
        secretariatId: secEdu.id,
    }).returning();
    console.log("✅ Processo de compra PRC-2026/001 criado.");
  }

  // 4. Criar Licitação (Bidding)
  let [bidding] = await db.select().from(biddings).where(eq(biddings.number, "CONC-001/2026")).limit(1);
  if (!bidding) {
    [bidding] = await db.insert(biddings).values({
        number: "CONC-001/2026",
        modality: "Concorrência Pública",
        status: "Concluída",
        publicationDate: new Date("2026-01-15"),
        sessionDate: new Date("2026-02-15"),
        processId: purchaseProcess.id,
    }).returning();
    console.log("✅ Licitação CONC-001/2026 criada.");
  }

  // 5. Criar Contrato (Contract)
  let [contract] = await db.select().from(procurementContracts).where(eq(procurementContracts.number, "CTR-045/2026")).limit(1);
  if (!contract) {
    [contract] = await db.insert(procurementContracts).values({
        number: "CTR-045/2026",
        object: "Execução das obras de reforma da Escola Municipal Infantil",
        initialValue: 1480000.00,
        updatedValue: 1480000.00,
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-12-31"),
        status: "Vigente",
        processId: purchaseProcess.id,
        supplierId: supplier.id,
        secretariatId: secEdu.id,
    }).returning();
    console.log("✅ Contrato CTR-045/2026 criado.");
  }

  // 6. Criar PortalNews
  const [news] = await db.select().from(portalNews).where(eq(portalNews.slug, "prefeitura-inicia-reforma")).limit(1);
  if (!news) {
    await db.insert(portalNews).values({
        title: "Prefeitura inicia reforma da Escola Infantil",
        subtitle: "Obras devem durar 10 meses e beneficiar mais de 500 alunos.",
        slug: "prefeitura-inicia-reforma",
        content: "A Prefeitura Municipal assinou hoje o contrato para a reforma geral da escola...",
        status: "Publicado",
        publishedAt: new Date(),
        secretariatId: secEdu.id
    });
    console.log("✅ Notícia criada no Portal.");
  }

  // 7. Criar Diário Oficial
  const [diary] = await db.select().from(officialDiaries).where(eq(officialDiaries.editionNumber, 1542)).limit(1);
  if (!diary) {
    await db.insert(officialDiaries).values({
        editionNumber: 1542,
        publishDate: new Date(),
        pdfUrl: "https://exemplo.com/diario-1542.pdf",
        status: "Publicado",
    });
    console.log("✅ Edição do Diário Oficial criada.");
  }

  console.log("🎉 Seed do Módulo 6 concluído com sucesso!");
}

seedMod6()
  .catch((e) => {
    console.error("❌ Erro no seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await connection.pool.end();
  });
