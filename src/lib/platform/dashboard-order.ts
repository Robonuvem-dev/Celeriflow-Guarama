const finalCards: Readonly<Record<string, number>> = {
  PORTAL_CIDADAO: 1,
  PORTAL_SERVIDOR: 2,
  TRANSPARENCIA: 3,
  CONFIGURACOES: 4,
};

export function compareDashboardCards(left: { code: string; name: string }, right: { code: string; name: string }) {
  const group = (finalCards[left.code] ?? 0) - (finalCards[right.code] ?? 0);
  return group || left.name.localeCompare(right.name, "pt-BR");
}
