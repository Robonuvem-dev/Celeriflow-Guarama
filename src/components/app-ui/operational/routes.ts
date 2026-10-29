import type { ModuleIconName, ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";

export type OperationalModuleConfig = {
  key: string;
  moduleTitle: string;
  moduleCaption?: string;
  moduleIcon: ModuleIconName;
  navigation: ModuleNavGroup[];
  routes: { pathname: string; title: string; excludeQuery?: Record<string, string[]> }[];
};

export function matchesOperationalPath(template: string, pathname: string) {
  const expected = template.split("/").filter(Boolean);
  const actual = pathname.split("/").filter(Boolean);
  for (let index = 0; index < expected.length; index++) {
    const part = expected[index];
    if (part.startsWith("[[...") && part.endsWith("]]")) return true;
    if (part.startsWith("[...") && part.endsWith("]")) return actual.length > index;
    if (!actual[index] || (!/^\[[^/]+\]$/.test(part) && part !== actual[index])) return false;
  }
  return expected.length === actual.length;
}

export function findOperationalRoute(modules: readonly OperationalModuleConfig[], pathname: string, searchParams: { get: (key: string) => string | null }) {
  for (const entry of modules) {
    const route = entry.routes.find(item => matchesOperationalPath(item.pathname, pathname)
      && !Object.entries(item.excludeQuery ?? {}).some(([key, values]) => values.includes(searchParams.get(key) ?? "")));
    if (route) return { module: entry, route };
  }
  return null;
}
