import { once } from "node:events";
import { createConnection } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { neonConfig } from "@neondatabase/serverless";
import WebSocket, { WebSocketServer } from "ws";
import { createDatabaseConnection } from "../../src/db/connection";

/** Isolated PostgreSQL fixture using the production Neon/Drizzle driver. Tests
 * in the same process must await close() before opening the next fixture, since
 * Neon exposes its WebSocket transport settings as process-level configuration. */
export async function createLocalDrizzleDatabase() {
  // Neon has distinct CJS/ESM conditional exports. TSX's application pool uses
  // CJS; the DDL driver's native import() uses ESM. Route both to this same
  // loopback fixture, and restore each export's own settings during teardown.
  const { neonConfig: esmNeonConfig } = await import("@neondatabase/serverless");
  const configurations = [...new Set([neonConfig, esmNeonConfig])];
  const previous = configurations.map(configuration => ({ configuration, settings: {
    wsProxy: configuration.wsProxy,
    useSecureWebSocket: configuration.useSecureWebSocket,
    pipelineConnect: configuration.pipelineConnect,
    webSocketConstructor: configuration.webSocketConstructor,
  } }));
  const restore = () => { for (const { configuration, settings } of previous) Object.assign(configuration, settings); };
  const database = new PGlite();
  // The production pool has five live clients. Allow retiring transport sockets
  // to finish closing when a failed transaction evicts and replaces a client.
  const tcp = new PGLiteSocketServer({ db: database, port: 0, host: "127.0.0.1", maxConnections: 10 });
  const websocket = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  try {
    await once(websocket, "listening");
    await tcp.start();
    const [host, port] = tcp.getServerConn().split(":");
    const address = websocket.address();
    if (!address || typeof address !== "object") throw new Error("Porta da fixture indisponível.");
    websocket.on("connection", socket => {
      const upstream = createConnection({ host, port: Number(port) });
      let startup = true;
      let pending = Buffer.alloc(0);
      socket.on("message", bytes => {
        const chunk = Array.isArray(bytes) ? Buffer.concat(bytes) : Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);
        pending = Buffer.concat([pending, chunk]);
        while (pending.length >= (startup ? 4 : 5)) {
          const size = startup ? pending.readInt32BE(0) : 1 + pending.readInt32BE(1);
          if (size < (startup ? 8 : 5)) { socket.close(); return; }
          if (pending.length < size) return;
          const message = pending.subarray(0, size);
          pending = pending.subarray(size);
          // pglite-socket does not close TCP after the PostgreSQL Terminate
          // frame. Neon Client.end() waits for that close acknowledgement.
          // Parse frame boundaries so an X inside SQL/binary data is untouched.
          if (!startup && message[0] === 0x58 && size === 5) {
            upstream.end();
            socket.close();
            return;
          }
          upstream.write(message);
          startup = false;
        }
      });
      upstream.on("data", bytes => socket.send(bytes));
      upstream.on("error", () => socket.close());
      upstream.on("close", () => socket.close());
      socket.on("close", () => upstream.destroy());
      socket.on("error", () => upstream.destroy());
    });
    for (const configuration of configurations) {
      configuration.wsProxy = (_hostname, port) => `127.0.0.1:${port}`;
      configuration.useSecureWebSocket = false;
      configuration.pipelineConnect = false;
      configuration.webSocketConstructor = WebSocket;
    }
    const connection = createDatabaseConnection(`postgresql://postgres:postgres@127.0.0.1:${address.port}/postgres?sslmode=disable`);
    return { database, connection, async close() {
      try { await connection.pool.end(); }
      finally {
        for (const client of websocket.clients) client.terminate();
        await new Promise<void>(resolve => websocket.close(() => resolve()));
        try { await tcp.stop(); }
        finally { restore(); await database.close(); }
      }
    } };
  } catch (error) {
    websocket.close();
    try { await tcp.stop(); }
    finally { restore(); await database.close(); }
    throw error;
  }
}
