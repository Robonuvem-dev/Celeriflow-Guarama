/** Reuse only the authorized site's cookies in memory; do not attach to unrelated user tabs. */
import { chromium } from "playwright-core";
import WebSocket from "ws";

export async function openCheckupBrowser() {
  const endpoint = process.env.CHECKUP_CDP_URL || "http://127.0.0.1:9337";
  const version = await fetch(`${endpoint}/json/version`).then(response => response.json());
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  const pending = new Map();
  let sequence = 0;
  const timeout = setTimeout(() => { for (const { reject } of pending.values()) reject(new Error("Tempo excedido ao ler a sessão de checkup.")); socket.terminate(); }, 30000);
  try {
    await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    socket.on("message", bytes => {
      const message = JSON.parse(String(bytes));
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
    const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
    const { targetInfos } = await call("Target.getTargets");
    const source = targetInfos.find(target => target.type === "page" && target.url.startsWith("https://guarama.celeriflow.com.br/"));
    if (!source) throw new Error("Sessão autenticada não encontrada no Chrome disponibilizado.");
    const { cookies } = await call("Storage.getCookies", source.browserContextId ? { browserContextId: source.browserContextId } : {});
    const hostname = "guarama.celeriflow.com.br";
    const sourceCookies = cookies.filter(cookie => { const domain = cookie.domain.replace(/^\./, ""); return hostname === domain || hostname.endsWith(`.${domain}`); });
    if (!sourceCookies.some(cookie => cookie.name === "celeriflow_session")) throw new Error("Cookie de sessão do checkup não encontrado.");
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    return { browser, sourceCookies };
  } finally { clearTimeout(timeout); socket.close(); }
}
