import { once } from "node:events";
import { createConnection } from "node:net";
import type { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { neonConfig } from "@neondatabase/serverless";
import { WebSocketServer } from "ws";
import { createDatabaseConnection } from "../../src/db/connection";

/** Loopback-only transport for the isolated P0 database; no operational URL is
 * accepted. Uses exactly the application's Neon WebSocket/Drizzle driver. */
export async function openLocalToolDatabase(database: PGlite) {
  const tcp = new PGLiteSocketServer({ db: database, port: 0, host: "127.0.0.1" });
  const websocket = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  const previous = { wsProxy: neonConfig.wsProxy, useSecureWebSocket: neonConfig.useSecureWebSocket, pipelineConnect: neonConfig.pipelineConnect };
  try {
    await once(websocket, "listening");
    await tcp.start();
    const [host, port] = tcp.getServerConn().split(":");
    const address = websocket.address();
    if (!address || typeof address !== "object") throw new Error("Porta local indisponível.");
    websocket.on("connection", socket => {
      const upstream = createConnection({ host, port: Number(port) });
      socket.on("message", bytes => upstream.write(Array.isArray(bytes) ? Buffer.concat(bytes) : Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes)));
      upstream.on("data", bytes => socket.send(bytes));
      upstream.on("error", () => socket.close());
      upstream.on("close", () => socket.close());
      socket.on("close", () => upstream.destroy());
      socket.on("error", () => upstream.destroy());
    });
    neonConfig.wsProxy = (_hostname, port) => `127.0.0.1:${port}`;
    neonConfig.useSecureWebSocket = false;
    neonConfig.pipelineConnect = false;
    const connection = createDatabaseConnection(`postgresql://postgres:postgres@127.0.0.1:${address.port}/postgres?sslmode=disable`);
    connection.pool.options.connectionTimeoutMillis = 120_000;
    return { connection, async close() {
      try { await connection.pool.end(); }
      finally {
        for (const client of websocket.clients) client.terminate();
        await new Promise<void>(resolve => websocket.close(() => resolve()));
        try { await tcp.stop(); }
        finally { Object.assign(neonConfig, previous); }
      }
    } };
  } catch (error) {
    for (const client of websocket.clients) client.terminate();
    websocket.close();
    try { await tcp.stop(); }
    finally { Object.assign(neonConfig, previous); }
    throw error;
  }
}
