import { z } from "zod";
import { Prisma, type PrismaClient } from "@prisma/client";
import { validateCnpj } from "@/lib/identifiers/brazilian-identifiers";

export const hrExternalConfigurationSchema = z.object({
  environment: z.enum(["PRODUCAO_RESTRITA", "PRODUCAO"]),
  employerCnpj: z.string().regex(/^\d{14}$/).refine(value => validateCnpj(value).valid, "CNPJ inválido."),
  layoutVersion: z.string().trim().min(1).max(80),
  xsdPackageReference: z.string().trim().min(1).max(500),
  xsdSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  sendEndpoint: z.string().url().refine(value => new URL(value).protocol === "https:"),
  queryEndpoint: z.string().url().refine(value => new URL(value).protocol === "https:"),
  credentialReference: z.string().regex(/^(env:|vault:|secret:\/\/).+/),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

export async function saveHrExternalConfiguration(db: PrismaClient, raw: unknown) {
  const input = hrExternalConfigurationSchema.parse(raw);
  const code = `ESOCIAL_RH_${input.environment}`;
  const { credentialReference, ...configuration } = input;
  const data = { name: `eSocial RH · ${input.environment}`, category: "GOVERNAMENTAL", provider: "eSocial", environment: input.environment, status: "CONFIGURANDO", baseUrl: input.sendEndpoint, credentialReference, configuration: configuration as Prisma.InputJsonValue };
  return db.integrationConnection.upsert({ where: { code }, create: { code, ...data }, update: { ...data, lastTestedAt: null, lastTestStatus: null, lastTestMessage: "Configuração preparada. Nenhuma assinatura, conexão ou transmissão realizada." } });
}

export async function describeHrExternalReadiness(db: PrismaClient) {
  const connections = await db.integrationConnection.findMany({ where: { code: { in: ["ESOCIAL_RH_PRODUCAO_RESTRITA", "ESOCIAL_RH_PRODUCAO"] } }, orderBy: { code: "asc" } });
  return ["PRODUCAO_RESTRITA", "PRODUCAO"].map(environment => {
    const connection = connections.find(c => c.environment === environment);
    const configuration = connection?.configuration && typeof connection.configuration === "object" && !Array.isArray(connection.configuration) ? connection.configuration : {};
    const parsed = hrExternalConfigurationSchema.safeParse({ ...configuration, credentialReference: connection?.credentialReference });
    return { environment, configured: parsed.success, transmissionAvailable: false, status: connection?.status || "NAO_CONFIGURADO", issues: parsed.success ? ["CLIENTE_XML_XSD_XMLDSIG_MTLS_E_WORKER_PENDENTES"] : ["PARAMETROS_CERTIFICADO_E_LAYOUT_PENDENTES", "CLIENTE_XML_XSD_XMLDSIG_MTLS_E_WORKER_PENDENTES"] };
  });
}
