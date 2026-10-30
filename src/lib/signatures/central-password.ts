import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { CentralError } from "./central-error";

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashCentralPassword(password: string) {
  if (password.length < 8 || Buffer.byteLength(password) > 1024) throw new CentralError("A senha pessoal deve ter entre 8 e 1024 bytes.");
  const salt = randomBytes(32);
  return `scrypt-v1$${salt.toString("hex")}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyCentralPassword(password: string, encoded: string) {
  if (!password || Buffer.byteLength(password) > 1024) return false;
  const match = /^scrypt-v1\$([a-f0-9]{64})\$([a-f0-9]{128})$/.exec(encoded);
  if (!match) return false;
  return timingSafeEqual(await derive(password, Buffer.from(match[1], "hex")), Buffer.from(match[2], "hex"));
}
