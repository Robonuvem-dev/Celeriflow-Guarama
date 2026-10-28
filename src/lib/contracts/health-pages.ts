/** Read contracts owned by the health server pages. Undefined scope is global;
 * an empty scope is deliberately denied rather than treated as global. */
export type HealthPageUnitScope = readonly string[] | undefined;
export type HealthPageOption = { id: string; name: string };
export type HealthPageRow<T extends { $inferSelect: unknown }> = T["$inferSelect"];
