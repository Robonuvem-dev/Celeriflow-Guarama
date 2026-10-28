import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { withDatabaseTransaction } from "../src/db/transaction";
import { secretariats, departments, employees } from "../src/db/schema/administration";
import { companies, suppliers } from "../src/db/schema/registry";
import { catalogItems } from "../src/db/schema/master-data";
import { purchaseRequests, purchaseRequestItems } from "../src/db/schema/procurement-requests";
import { purchaseProcesses, purchaseProcessItems, procurementContracts, biddings, directContractings } from "../src/db/schema/procurement-core";

config({ path: ".env.local" });
config();

async function main() {
  const { createDatabaseConnection } = await import("../src/db/connection");
  const connection = createDatabaseConnection(process.env.DATABASE_URL!);
  try {
    console.log("Iniciando seed do Módulo 9 (Compras e Contratos)...");
    await withDatabaseTransaction(connection, async tx => {
      await tx.delete(purchaseRequestItems);
      await tx.delete(purchaseProcessItems);
      await tx.delete(procurementContracts);
      await tx.delete(biddings);
      await tx.delete(directContractings);
      await tx.delete(purchaseProcesses);
      await tx.delete(purchaseRequests);
      await tx.delete(catalogItems);

      let [secretariat] = await tx.select().from(secretariats).where(eq(secretariats.acronym, "SEMAD")).limit(1);
      if (!secretariat) [secretariat] = await tx.insert(secretariats).values({ name: "Secretaria de Administração", acronym: "SEMAD", isActive: true }).returning();
      let [department] = await tx.select().from(departments).where(eq(departments.name, "Departamento de Compras")).limit(1);
      if (!department) [department] = await tx.insert(departments).values({ name: "Departamento de Compras", secretariatId: secretariat.id, isActive: true }).returning();
      let [employee] = await tx.select().from(employees).where(eq(employees.name, "João Comprador")).limit(1);
      if (!employee) [employee] = await tx.insert(employees).values({ name: "João Comprador", isActive: true, secretariatId: secretariat.id, departmentId: department.id }).returning();
      let [company] = await tx.select().from(companies).where(eq(companies.cnpj, "12345678000199")).limit(1);
      if (!company) [company] = await tx.insert(companies).values({ corporateName: "Fornecedor Exemplo LTDA", cnpj: "12345678000199", status: "Ativo" }).returning();
      let [supplier] = await tx.select().from(suppliers).where(eq(suppliers.companyId, company.id)).limit(1);
      if (!supplier) [supplier] = await tx.insert(suppliers).values({ status: "Ativo", companyId: company.id }).returning();

      const [cat1] = await tx.insert(catalogItems).values({ code: "CAT-0001", name: "Papel Sulfite A4", description: "Caixa com 10 resmas", unit: "CX", estimatedValue: 250 }).returning();
      const [cat2] = await tx.insert(catalogItems).values({ code: "CAT-0002", name: "Caneta Esferográfica Azul", description: "Caixa com 50 unidades", unit: "CX", estimatedValue: 35.5 }).returning();
      const [cat3] = await tx.insert(catalogItems).values({ code: "CAT-0003", name: "Computador Desktop Core i5", description: "8GB RAM, 256GB SSD", unit: "UN", estimatedValue: 3500 }).returning();
      const requestOwner = { secretariatId: secretariat.id, departmentId: department.id, requesterId: employee.id };
      const [request1] = await tx.insert(purchaseRequests).values({ ...requestOwner, number: "REQ-2026-001", object: "Aquisição de material de expediente", justification: "Reposição de estoque", estimatedValue: 321, status: "Aprovada" }).returning();
      await tx.insert(purchaseRequestItems).values([{ purchaseRequestId: request1.id, catalogItemId: cat1.id, quantity: 1, estimatedUnitValue: 250 }, { purchaseRequestId: request1.id, catalogItemId: cat2.id, quantity: 2, estimatedUnitValue: 35.5 }]);
      const [request2] = await tx.insert(purchaseRequests).values({ ...requestOwner, number: "REQ-2026-002", object: "Aquisição de computadores para o setor", justification: "Atualização do parque tecnológico", estimatedValue: 10500, status: "Enviada" }).returning();
      await tx.insert(purchaseRequestItems).values({ purchaseRequestId: request2.id, catalogItemId: cat3.id, quantity: 3, estimatedUnitValue: 3500 });
      const [request3] = await tx.insert(purchaseRequests).values({ ...requestOwner, number: "REQ-2026-003", object: "Contratação de serviço de limpeza", justification: "Manutenção predial", estimatedValue: 5000, status: "Rascunho" }).returning();
      await tx.insert(purchaseRequestItems).values({ purchaseRequestId: request3.id, customName: "Serviço de limpeza mensal", quantity: 1, estimatedUnitValue: 5000 });

      const [proc1] = await tx.insert(purchaseProcesses).values({ number: "PROC-2026-101", object: "Aquisição de material de expediente", type: "Comum", modality: "Pregão Eletrônico", estimatedValue: 15000, status: "Em Licitação", secretariatId: secretariat.id }).returning();
      await tx.insert(purchaseProcessItems).values([{ purchaseProcessId: proc1.id, catalogItemId: cat1.id, quantity: 50, estimatedUnitValue: 250 }, { purchaseProcessId: proc1.id, catalogItemId: cat2.id, quantity: 70, estimatedUnitValue: 35.5 }]);
      const [proc2] = await tx.insert(purchaseProcesses).values({ number: "PROC-2026-102", object: "Aquisição de equipamentos de TI", type: "Registro de Preços", modality: "Pregão Eletrônico", estimatedValue: 55000, status: "Concluído", secretariatId: secretariat.id }).returning();
      await tx.insert(purchaseProcessItems).values({ purchaseProcessId: proc2.id, catalogItemId: cat3.id, quantity: 15, estimatedUnitValue: 3500 });
      const [proc3] = await tx.insert(purchaseProcesses).values({ number: "PROC-2026-103", object: "Serviço de manutenção de ar condicionado", type: "Comum", modality: "Dispensa", estimatedValue: 8000, status: "Em Planejamento", secretariatId: secretariat.id }).returning();
      await tx.insert(purchaseProcessItems).values({ purchaseProcessId: proc3.id, customName: "Manutenção preventiva e corretiva", quantity: 1, estimatedUnitValue: 8000 });
      await tx.insert(biddings).values([{ number: "PE-001/2026", modality: "Pregão Eletrônico", status: "Aberto", processId: proc1.id, sessionDate: new Date("2026-08-15T09:00:00Z") }, { number: "PE-002/2026", modality: "Pregão Eletrônico", status: "Homologado", processId: proc2.id, sessionDate: new Date("2026-07-01T09:00:00Z") }]);
      await tx.insert(directContractings).values({ type: "Dispensa", justification: "Valor inferior ao limite", value: 8000, status: "Em Elaboração", processId: proc3.id, supplierId: supplier.id });
      const contractOwner = { supplierId: supplier.id, secretariatId: secretariat.id, managerId: employee.id };
      await tx.insert(procurementContracts).values([
        { ...contractOwner, number: "CONT-001/2026", object: "Fornecimento de computadores", initialValue: 55000, updatedValue: 55000, startDate: new Date("2026-07-10T00:00:00Z"), endDate: new Date("2027-07-10T00:00:00Z"), status: "Vigente", processId: proc2.id },
        { ...contractOwner, number: "CONT-002/2026", object: "Serviço de limpeza contínua", initialValue: 120000, updatedValue: 120000, startDate: new Date("2026-01-01T00:00:00Z"), endDate: new Date("2026-12-31T00:00:00Z"), status: "Vigente", processId: proc1.id },
        { ...contractOwner, number: "CONT-003/2025", object: "Fornecimento de papel", initialValue: 30000, updatedValue: 30000, startDate: new Date("2025-06-01T00:00:00Z"), endDate: new Date("2026-06-01T00:00:00Z"), status: "Encerrado", processId: proc1.id },
      ]);
    });
    console.log("🎉 Seed do Módulo 9 concluído com sucesso!");
  } finally { await connection.pool.end(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
