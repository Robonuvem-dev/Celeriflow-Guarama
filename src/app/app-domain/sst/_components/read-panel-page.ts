import "server-only";
import type { PanelPage, PanelReply } from "./usePanelPage";

export async function readPanelPage<T>(read: () => Promise<PanelPage<T>>): Promise<PanelReply<T>> {
  try { return await read(); }
  catch { return { error: "Não foi possível carregar a página. Confira seu acesso e tente novamente." }; }
}
