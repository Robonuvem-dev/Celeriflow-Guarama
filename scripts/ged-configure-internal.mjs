import { randomBytes } from "node:crypto";
import { mkdir, access, writeFile, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const [domain, email] = process.argv.slice(2);
if (!domain || domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) || !email || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/.test(email)) {
  console.error("Uso: npm run ged:configure -- ged-servicos.seu-dominio.gov.br administrador@seu-dominio.gov.br");
  process.exitCode = 1;
} else {
  const directory = resolve(dirname(fileURLToPath(import.meta.url)), "../services/ged-internal");
  const keys = Object.fromEntries(["OCR", "SEMANTIC", "CONVERSION", "PDFA"].map(name => [`GED_${name}_API_KEY`, randomBytes(32).toString("hex")]));
  const credentials = Object.entries(keys).map(([name, value]) => `${name}=${value}`).join("\n");
  const application = `GED_OCR_ENDPOINT=https://${domain}/ocr\nGED_SEMANTIC_ENDPOINT=https://${domain}/embed\nGED_CONVERSION_ENDPOINT=https://${domain}/convert\nGED_PDFA_ENDPOINT=https://${domain}/pdfa\n${credentials}\n`;
  const files = [
    [".env", `GED_SERVICES_DOMAIN=${domain}\nGED_TLS_EMAIL=${email}\n${credentials}\n`],
    [".env.application", application],
    [".env.worker", "# Copiar os valores do MESMO ambiente da aplicação. Não usar um banco de outro município.\nDATABASE_URL=\nBLOB_READ_WRITE_TOKEN=\nCELERIFLOW_INSTANCE_ID=\n"],
  ];
  await mkdir(directory, { recursive: true });
  for (const [filename] of files) {
    try { await access(resolve(directory, filename)); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    throw new Error(`Arquivo ${filename} já existe; configuração preservada. Não gere novas chaves sobre uma instalação ativa.`);
  }
  const created = [];
  try {
    for (const [filename, content] of files) {
      const path = resolve(directory, filename);
      await writeFile(path, content, { flag: "wx", mode: 0o600 });
      created.push(path);
    }
  } catch (error) {
    for (const path of created) await rm(path);
    throw error;
  }
  console.log("Configuração criada em services/ged-internal: .env, .env.application e .env.worker. Chaves não exibidas. Preencha os dados do worker e configure o domínio antes de iniciar.");
}
