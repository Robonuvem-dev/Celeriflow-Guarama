export async function gedManage<T>(section: string, params: Record<string, string> = {}): Promise<T> {
  const response = await fetch(`/api/assinatura-digital/ged/manage?${new URLSearchParams({ section, ...params })}`, { cache: "no-store" });
  const value = await response.json(); if (!response.ok) throw new Error(value.error || "Falha na consulta documental."); return value as T;
}
