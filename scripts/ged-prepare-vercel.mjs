import "dotenv/config";
import { Sandbox } from "@vercel/sandbox";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const selected = ["package.json", "package-lock.json", "tsconfig.json", "scripts/ged-worker.mjs", "scripts/ged-vercel-worker.mjs", "scripts/ged-sandbox-task.mjs", "scripts/ged-ocr-engine.mjs", "scripts/ged-document-engine.mjs", "services/ged-semantic/server.py", "services/ged-semantic/requirements.txt", "services/ged-documents/auto-install.xml"];
async function collect(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.name === "__tests__" || item.name.startsWith(".env")) continue;
    const path = join(directory, item.name);
    if (item.isDirectory()) await collect(path);
    else if (item.isFile() && !/\.(?:test|spec)\.[^.]+$/.test(item.name)) selected.push(relative(root, path).replaceAll("\\", "/"));
  }
}

await collect(join(root, "src"));
console.log("GED: criando ambiente de preparação na Vercel; nenhum banco será acessado.");
const parentSnapshot = process.env.GED_SANDBOX_REFRESH_FROM;
const sandbox = await Sandbox.create({ ...(parentSnapshot ? { source: { type: "snapshot", snapshotId: parentSnapshot } } : { image: "vercel/sandbox/node:24" }), persistent: false, timeout: 30 * 60_000, resources: { vcpus: 4 } });
let complete = false;
async function command(cmd, args, extra = {}) {
  const result = await sandbox.runCommand({ cmd, args, cwd: "/vercel/sandbox", timeoutMs: 20 * 60_000, ...extra });
  if (result.exitCode !== 0) throw new Error(`Preparação GED falhou em ${cmd}; conferir o comando no painel de Sandbox da Vercel.`);
}
try {
  if (!parentSnapshot) await sandbox.mkDir("/vercel/sandbox");
  const directories = [...new Set(selected.map(path => dirname(path)))];
  await command("mkdir", ["-p", ...directories]);
  await sandbox.writeFiles(await Promise.all(selected.map(async path => ({ path: `/vercel/sandbox/${path}`, content: await readFile(join(root, path)) }))));
  if (!parentSnapshot) {
  console.log("GED: instalando LibreOffice, Java, fontes e Python.");
  await command("apt-get", ["update"], { sudo: true });
  await command("apt-get", ["install", "-y", "--no-install-recommends", "libreoffice-writer", "libreoffice-calc", "libreoffice-impress", "libreoffice-math", "default-jre-headless", "fonts-dejavu-core", "fonts-liberation", "python3-pip", "curl", "unzip"], { sudo: true, env: { DEBIAN_FRONTEND: "noninteractive" } });
  await command("bash", ["-euc", "curl -fsSL --retry 3 https://software.verapdf.org/releases/1.28/verapdf-greenfield-1.28.2-installer.zip -o /tmp/verapdf.zip\necho 'd1693a5f0bf0997180f6d97e8a5568b0cf39e27eee338d439c8adb58435c1e89  /tmp/verapdf.zip' | sha256sum -c -\nmkdir -p /tmp/verapdf-installer\nunzip -q /tmp/verapdf.zip -d /tmp/verapdf-installer\nfind /tmp/verapdf-installer -name 'verapdf-izpack-installer-*.jar' -exec java -jar {} /vercel/sandbox/services/ged-documents/auto-install.xml \\;\nln -s /opt/verapdf/verapdf /usr/local/bin/verapdf\ntest -x /usr/local/bin/verapdf\nrm -rf /tmp/verapdf.zip /tmp/verapdf-installer"], { sudo: true });
  console.log("GED: instalando dependências do worker e modelos internos.");
  await command("npm", ["ci"]);
  await command("mkdir", ["-p", "/opt/ged"], { sudo: true });
  await command("chown", ["ubuntu:ubuntu", "/opt/ged"], { sudo: true });
  await command("python3", ["-m", "pip", "install", "--break-system-packages", "uv"], { sudo: true });
  await command("uv", ["venv", "--seed", "--python", "3.11", "/opt/ged/venv"]);
  await command("/opt/ged/venv/bin/pip", ["install", "--no-cache-dir", "torch==2.8.0", "--index-url", "https://download.pytorch.org/whl/cpu"]);
  await command("/opt/ged/venv/bin/pip", ["install", "--no-cache-dir", "-r", "services/ged-semantic/requirements.txt"]);
  await command("node", ["--input-type=module", "-e", "import {createGedOcrEngine} from './scripts/ged-ocr-engine.mjs'; const engine=createGedOcrEngine({cachePath:'/vercel/sandbox/ocr-cache'}); await engine.initialize(); await engine.terminate();"]);
  await command("/opt/ged/venv/bin/python", ["-c", "import runpy; engine=runpy.run_path('services/ged-semantic/server.py', run_name='ged_warmup'); result=engine['embed']('Aquisição de veículos para transporte escolar.'); assert len(result['vector']) == 384"], { env: { HF_HUB_DISABLE_TELEMETRY: "1", DO_NOT_TRACK: "1" } });
  } else {
    console.log("GED: atualização de fontes; dependências e modelos devem corresponder ao snapshot de origem.");
  }
  console.log("GED: salvando snapshot sem documentos nem credenciais da aplicação.");
  const snapshot = await sandbox.snapshot({ expiration: 0 });
  complete = true;
  console.log(`GED_SANDBOX_SNAPSHOT_ID=${snapshot.snapshotId}`);
  console.log("Configure esse valor no projeto guarama.celeriflow.com.br. O snapshot é vinculado à versão atual do código; recrie após alterar o worker ou seus módulos.");
} finally {
  if (!complete) await sandbox.stop().catch(() => {});
  await sandbox.delete().catch(() => {});
}
