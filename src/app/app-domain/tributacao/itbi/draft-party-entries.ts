/** Preserve the existing action's field names for every party, not the visible page. */
export function itbiPartyEntries(kind: "seller" | "buyer", rows: { taxpayerId: string; sharePercent: string }[]): [string, string][] {
  return rows.flatMap((row, index) => [
    [kind === "seller" ? index === 0 ? "seller" : `seller${index}` : `buyer${index}`, row.taxpayerId] as [string, string],
    [kind === "seller" ? `sellerShare${index}` : `share${index}`, row.sharePercent] as [string, string],
  ]);
}
