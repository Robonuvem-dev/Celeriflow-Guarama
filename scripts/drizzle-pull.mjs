import net from "node:net";
import { spawn } from "node:child_process";
import { config } from "dotenv";
import WebSocket from "ws";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não configurada.");
const original = new URL(connectionString);
if (!original.hostname.endsWith(".neon.tech")) throw new Error("A ponte de introspecção espera um endpoint Neon.");
const sockets = new Set();
const server = net.createServer(socket => {
  sockets.add(socket);
  socket.pause();
  // TLS validation remains enabled on the remote WebSocket. Only loopback is plaintext.
  const remote = new WebSocket(`wss://${original.hostname}/v2`);
  remote.on("open", () => socket.resume());
  socket.on("data", data => remote.send(data));
  remote.on("message", data => socket.write(data));
  remote.on("error", () => socket.destroy());
  remote.on("close", () => socket.end());
  socket.on("error", () => remote.close());
  socket.on("close", () => { sockets.delete(socket); remote.close(); });
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  const local = new URL(original);
  local.hostname = "127.0.0.1";
  local.port = String(server.address().port);
  local.searchParams.set("sslmode", "disable");
  console.log(`Introspecção somente de leitura: ${original.hostname}. Saída em .agent/drizzle/introspection.`);
  const child = spawn(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "pull", "--config=drizzle.config.ts"], { stdio: "inherit", env: { ...process.env, DRIZZLE_INTROSPECTION_URL: local.toString() } });
  process.exitCode = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", code => resolve(code ?? 1)); });
} finally {
  for (const socket of sockets) socket.destroy();
  server.close();
}
