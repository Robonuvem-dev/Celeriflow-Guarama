import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateKeyPairSync, randomBytes } from "node:crypto";

export async function auroraSignatureMaterial(folder: string, owner: { name: string; cpf: string; cnpj: string }) {
  const manifest = join(folder, "credentials.json");
  if (existsSync(manifest)) {
    const prior = JSON.parse(await readFile(manifest, "utf8")) as Awaited<ReturnType<typeof create>>;
    if (prior.owner.name !== owner.name || prior.owner.cpf !== owner.cpf || prior.owner.cnpj !== owner.cnpj) throw new Error("Material existente pertence a outro titular.");
    return prior;
  }
  async function create() {
    await mkdir(folder, { recursive: true });
    const exe = existsSync("C:\\Program Files\\Git\\usr\\bin\\openssl.exe") ? "C:\\Program Files\\Git\\usr\\bin\\openssl.exe" : "openssl";
    const run = (...args: string[]) => execFileSync(exe, args, { cwd: folder, stdio: "pipe" });
    const read = (name: string) => readFile(join(folder, name), "utf8");
    run("req", "-x509", "-newkey", "rsa:3072", "-nodes", "-keyout", "root.key", "-out", "root.pem", "-days", "1095", "-subj", "/C=BR/O=Aurora das Veredas/OU=Cadeia Privada de Apresentacao/CN=Autoridade Privada Aurora das Veredas", "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0", "-addext", "keyUsage=critical,keyCertSign,cRLSign");
    async function leaf(name: string, subject: string, san: string, serial: string) {
      run("req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", `${name}.key`, "-out", `${name}.csr`, "-subj", `/C=BR/O=Aurora das Veredas/OU=Cadeia Privada de Apresentacao/CN=${subject}`);
      await writeFile(join(folder, `${name}.ext`), `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\nsubjectAltName=${san}\n`);
      run("x509", "-req", "-in", `${name}.csr`, "-CA", "root.pem", "-CAkey", "root.key", "-set_serial", serial, "-days", "365", "-extfile", `${name}.ext`, "-out", `${name}.pem`);
      return { certificatePem: await read(`${name}.pem`), privateKeyPem: await read(`${name}.key`) };
    }
    const cpfSan = `otherName:2.16.76.1.3.1;UTF8:01011980${owner.cpf}`;
    const cpf = await leaf("cpf", owner.name, cpfSan, "101");
    const cnpj = await leaf("cnpj", "Municipio de Aurora das Veredas", `${cpfSan},otherName:2.16.76.1.3.3;UTF8:${owner.cnpj}`, "102");
    const internalKeyPem = generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    return { owner, createdAt: new Date().toISOString(), cpf, cnpj, trustedRootPem: await read("root.pem"), internalKeyPem, signerPassword: randomBytes(32).toString("base64url") };
  }
  const material = await create();
  await writeFile(manifest, JSON.stringify(material), { mode: 0o600 });
  return material;
}
