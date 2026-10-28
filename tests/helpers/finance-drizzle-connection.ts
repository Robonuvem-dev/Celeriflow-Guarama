import { once } from "node:events";
import { createConnection } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { neonConfig } from "@neondatabase/serverless";
import { WebSocketServer } from "ws";
import { createDatabaseConnection } from "../../src/db/connection";

/** Finance test transport: actual Neon/Drizzle transactions against the SAME
 * isolated PGlite or loopback PostgreSQL schema as an existing fixture. */
export async function connectFinanceDrizzleFixture(database: unknown) {
  let tcp: PGLiteSocketServer | undefined;
  let connectionString: string;
  let expectedSchema: string | undefined;
  if (database instanceof PGlite) {
    tcp = new PGLiteSocketServer({ db: database, port: 0, host: "127.0.0.1", maxConnections: 10 });
    await tcp.start();
    const [host, port] = tcp.getServerConn().split(":");
    connectionString = `postgresql://postgres:postgres@${host}:${port}/postgres?sslmode=disable`;
  } else if (database && typeof database === "object" && "connectionString" in database && typeof database.connectionString === "string" && "schema" in database && typeof database.schema === "string") {
    const url = new URL(database.connectionString);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/planning_s2" || !/^planning_[a-f0-9]{32}$/.test(database.schema) || url.searchParams.get("options") !== `-c search_path=${database.schema}`) {
      throw new Error("A ponte Financeiro exige o mesmo schema descartável da fixture PostgreSQL local planning_s2.");
    }
    connectionString = database.connectionString;
    expectedSchema = database.schema;
  } else {
    throw new Error("A ponte Financeiro exige PGlite ou o backend PostgreSQL isolado da fixture.");
  }
  const target = new URL(connectionString);
  const previous = { wsProxy: neonConfig.wsProxy, useSecureWebSocket: neonConfig.useSecureWebSocket, pipelineConnect: neonConfig.pipelineConnect };
  let websocket: WebSocketServer | undefined;
  let connection: ReturnType<typeof createDatabaseConnection> | undefined;
  async function closeTransport() {
    try {
      if (websocket) {
        for (const client of websocket.clients) client.terminate();
        await new Promise<void>((resolve, reject) => websocket!.close(error => error ? reject(error) : resolve()));
      }
    } finally {
      try { await tcp?.stop(); }
      finally { Object.assign(neonConfig, previous); }
    }
  }
  try {
    websocket = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await once(websocket, "listening");
    const address = websocket.address();
    if (typeof address !== "object" || !address) throw new Error("Porta da fixture indisponível.");
    websocket.on("connection", socket => {
      const upstream = createConnection({ host: target.hostname, port: Number(target.port || 5432) });
      let startup = true;
      let pending = Buffer.alloc(0);
      socket.on("message", bytes => {
        const chunk = Array.isArray(bytes) ? Buffer.concat(bytes) : Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);
        if (!tcp) { upstream.write(chunk); return; }
        pending = Buffer.concat([pending, chunk]);
        while (pending.length >= (startup ? 4 : 5)) {
          const size = startup ? pending.readInt32BE(0) : 1 + pending.readInt32BE(1);
          if (size < (startup ? 8 : 5)) { socket.close(); return; }
          if (pending.length < size) return;
          const message = pending.subarray(0, size);
          pending = pending.subarray(size);
          // pglite-socket does not close TCP on PostgreSQL Terminate. Parse
          // frame boundaries so a letter X inside SQL or binary data is safe.
          if (!startup && message[0] === 0x58 && size === 5) {
            upstream.end();
            socket.close();
            return;
          }
          upstream.write(message);
          startup = false;
        }
      });
      upstream.on("data", bytes => { if (socket.readyState === 1) socket.send(bytes); });
      upstream.on("error", () => socket.close());
      upstream.on("close", () => socket.close());
      socket.on("close", () => upstream.destroy());
      socket.on("error", () => upstream.destroy());
    });
    neonConfig.wsProxy = () => `127.0.0.1:${address.port}`;
    neonConfig.useSecureWebSocket = false;
    neonConfig.pipelineConnect = false;
    connection = createDatabaseConnection(connectionString);
    const connected = connection;
    if (expectedSchema) {
      const result = await connected.pool.query<{ schema: string }>("SELECT current_schema() AS schema");
      if (result.rows[0]?.schema !== expectedSchema) throw new Error("A conexão financeira não reutilizou o schema isolado da fixture PostgreSQL.");
    }
    return {
      connection: connected,
      async close() { try { await connected.pool.end(); } finally { await closeTransport(); } },
    };
  } catch (error) { try { await connection?.pool.end(); } finally { await closeTransport(); } throw error; }
}
