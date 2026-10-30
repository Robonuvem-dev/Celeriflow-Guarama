import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Isolated local CA, intermediate and leaf certificates. No production trust/ENV changes.
export async function centralA1Certificates() {
  const parent = process.env.CELERIFLOW_POSTGRES_TEST_TEMP ?? "C:\\Users\\thiag\\AppData\\Local\\Temp\\opencode";
  if (!existsSync(parent)) throw new Error("Diretório temporário de fixtures indisponível.");
  const folder = await mkdtemp(join(parent, "central-a1-"));
  const exe = process.env.CELERIFLOW_TEST_OPENSSL ?? (existsSync("C:\\Program Files\\Git\\usr\\bin\\openssl.exe") ? "C:\\Program Files\\Git\\usr\\bin\\openssl.exe" : "openssl");
  const run = (...args: string[]) => execFileSync(exe, args, { cwd: folder, stdio: "pipe" });
  const read = (name: string) => readFile(join(folder, name), "utf8");
  try {
    run("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "root.key", "-out", "root.pem", "-days", "4", "-subj", "/CN=Central A1 isolated root", "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign");
    run("req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", "inter.key", "-out", "inter.csr", "-subj", "/CN=Central A1 isolated intermediate");
    await writeFile(join(folder, "inter.ext"), "basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n");
    run("x509", "-req", "-in", "inter.csr", "-CA", "root.pem", "-CAkey", "root.key", "-set_serial", "2", "-days", "3", "-extfile", "inter.ext", "-out", "inter.pem");
    async function leaf(name: string, san?: string, days = "2") {
      run("req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", `${name}.key`, "-out", `${name}.csr`, "-subj", "/CN=Untrusted label 52998224725");
      await writeFile(join(folder, `${name}.ext`), `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n${san ? `subjectAltName=${san}\n` : ""}`);
      const validity = days === "-1" ? ["-not_before", "20200101000000Z", "-not_after", "20200102000000Z"] : ["-days", days];
      run("x509", "-req", "-in", `${name}.csr`, "-CA", "inter.pem", "-CAkey", "inter.key", "-set_serial", String(serial++), ...validity, "-extfile", `${name}.ext`, "-out", `${name}.pem`);
      return { certificatePem: await read(`${name}.pem`), privateKeyPem: await read(`${name}.key`) };
    }
    let serial = 3;
    const cpfSan = "otherName:2.16.76.1.3.1;UTF8:0101199052998224725";
    const cpf = await leaf("cpf", cpfSan);
    const rotatedCpf = await leaf("cpf-rotated", cpfSan);
    const cnpj = await leaf("cnpj", `${cpfSan},otherName:2.16.76.1.3.3;UTF8:11222333000181`);
    const none = await leaf("none");
    const expired = await leaf("expired", cpfSan, "-1");
    return { cpf, rotatedCpf, cnpj, none, expired, intermediatePems: [await read("inter.pem")], trustedRootPem: await read("root.pem"), close: () => rm(folder, { recursive: true, force: true }) };
  } catch (error) { await rm(folder, { recursive: true, force: true }); throw error; }
}
