// Preparation of a public legacy sample only; no application/database execution.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const sourcePage = "https://fapes.es.gov.br/orientacoes";
const sourceUrl = "https://fapes.es.gov.br/media/Importacao/Arquivos/Prazos%20Pit%20Gov.pps";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

export async function prepareGedPpsFixture(destination) {
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Amostra publica PPS indisponivel: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 20 * 1024 * 1024 || bytes.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1") throw new Error("Amostra nao corresponde a um arquivo binario Office legado dentro do limite.");
  await mkdir(destination, { recursive: true });
  const filename = "referencia-fapes-prazos-pitch-gov.pps";
  await writeFile(join(destination, filename), bytes);
  return {
    filename, bytes: bytes.length, sha256: hash(bytes),
    purpose: "Apresentacao publica Prazos Pit Gov (10/09/2021), FAPES, em PPS binario legado; extracao/conversao pelo GED ainda nao executadas",
    status: "PREPARADO_NAO_HOMOLOGADO", sourcePage, sourceUrl,
    sourceProject: "Fundacao de Amparo a Pesquisa e Inovacao do Espirito Santo (FAPES), Governo do Estado do Espirito Santo",
    retrievedAt: new Date().toISOString(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const destination = resolve(process.argv[2] || "docs/ged-poc-acervo");
  const manifestPath = join(destination, "manifesto.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const sample = await prepareGedPpsFixture(destination);
  manifest.files = [...manifest.files.filter(file => file.filename !== sample.filename), sample];
  manifest.requiredAdditionalFixtures = manifest.requiredAdditionalFixtures.filter(item => item !== "PPS binario");
  manifest.updatedAt = new Date().toISOString();
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(sample, null, 2));
}
