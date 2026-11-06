import { NotificationDispatcher } from "@/lib/notifications/notification-dispatcher";
import { databaseConnection } from "@/db/client";
import { suppliers } from "@/db/schema/registry";
import { companies } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { eq } from "drizzle-orm";

export async function notifySupplierBiddingCalling(input: {
  supplierId: string;
  processNumber: string;
  itemsOrLotDescription: string;
  isSecondPlace?: boolean;
}) {
  try {
    const [supplier] = await databaseConnection.db
      .select({
        id: suppliers.id,
        personEmail: people.email,
        companyEmail: companies.emailFiscal || companies.emailPrimary,
        personName: people.fullName,
        companyName: companies.corporateName,
        tradeName: companies.tradeName,
      })
      .from(suppliers)
      .leftJoin(people, eq(people.id, suppliers.personId))
      .leftJoin(companies, eq(companies.id, suppliers.companyId))
      .where(eq(suppliers.id, input.supplierId))
      .limit(1);

    const email = supplier?.companyEmail || supplier?.personEmail;
    const name = supplier?.tradeName || supplier?.companyName || supplier?.personName || "Fornecedor";

    if (!email) return;

    const baseUrl = process.env.CELERIFLOW_PUBLIC_BASE_URL || "https://guarama.celeriflow.com.br";
    const link = `${baseUrl.replace(/\/$/, "")}/compras/licitacoes`;

    if (input.isSecondPlace) {
      await NotificationDispatcher.sendLicitacaoConvocacaoSegundoColocado({
        to: email,
        fornecedor: name,
        processo: input.processNumber,
        item: input.itemsOrLotDescription,
        link,
      });
    } else {
      await NotificationDispatcher.sendLicitacaoConvocacaoFornecedor({
        to: email,
        fornecedor: name,
        processo: input.processNumber,
        itens: input.itemsOrLotDescription,
        link,
      });
    }
  } catch (error) {
    console.error("[Notification Error] Supplier bidding calling notification failed:", error);
  }
}
