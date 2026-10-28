import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createConnection, type Socket } from "node:net";
import { Client } from "@neondatabase/serverless";
import { WebSocket, WebSocketServer } from "ws";

/** Only the disposable local server started by verify-planning-postgres.mjs is accepted. */
export async function createPlanningPostgresBackend(connectionString: string) {
  const url = new URL(connectionString);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/planning_s2") throw new Error("Os cenários PostgreSQL exigem o servidor local isolado planning_s2.");
  const schema = `planning_${randomUUID().replaceAll("-", "")}`;
  const upstreams = new Set<Socket>();
  const websocket = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  let client: Client | undefined;
  let schemaCreated = false;
  let closing: Promise<void> | undefined;
  function close() {
    return closing ??= (async () => {
      try {
        if (schemaCreated) await client!.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        try { await client?.end(); }
        finally {
          for (const socket of websocket.clients) socket.terminate();
          for (const upstream of upstreams) upstream.destroy();
          await new Promise<void>((resolve, reject) => websocket.close(error => error ? reject(error) : resolve()));
        }
      }
    })();
  }
  try {
    await once(websocket, "listening");
    const address = websocket.address();
    if (typeof address !== "object" || !address) throw new Error("Porta da fixture indisponível.");
    websocket.on("connection", socket => {
      const upstream = createConnection({ host: url.hostname, port: Number(url.port || 5432) });
      upstreams.add(upstream);
      socket.on("message", bytes => {
        upstream.write(Array.isArray(bytes) ? Buffer.concat(bytes) : Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes));
      });
      upstream.on("data", bytes => { if (socket.readyState === WebSocket.OPEN) socket.send(bytes); });
      upstream.on("error", () => socket.terminate());
      upstream.on("close", () => { upstreams.delete(upstream); socket.terminate(); });
      socket.on("close", () => upstream.destroy());
      socket.on("error", () => upstream.destroy());
    });
    client = new Client({ connectionString });
    client.neonConfig.webSocketConstructor = WebSocket;
    client.neonConfig.wsProxy = () => `127.0.0.1:${address.port}`;
    client.neonConfig.useSecureWebSocket = false;
    client.neonConfig.pipelineConnect = false;
    await client.connect();
    const connected = client;
    await connected.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await connected.query(`SET search_path TO "${schema}"`);
    url.searchParams.set("options", `-c search_path=${schema}`);
    return {
      schema,
      connectionString: url.toString(),
      exec: (sql: string) => connected.query(sql),
      query: (sql: string, parameters?: unknown[]) => connected.query(sql, parameters),
      close,
    };
  } catch (error) {
    try { await close(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "Falha ao inicializar e limpar a fixture PostgreSQL isolada."); }
    throw error;
  }
}
