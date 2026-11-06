import type { ModuleIconName, ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";

export type OperationalModuleConfig = {
  key: string;
  moduleTitle: string;
  moduleCaption?: string;
  moduleIcon: ModuleIconName;
  shellPathname?: string;
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

/** The navigation belongs to the module, including its forms and detail pages.
 * Query exclusions select a table renderer; they must never select another menu.
 */
export function findOperationalShell(modules: readonly OperationalModuleConfig[], pathname: string) {
  for (const entry of modules) {
    const route = entry.routes.find(item => matchesOperationalPath(item.pathname, pathname));
    if (route) return { module: entry, route };
  }
  const candidates = modules.flatMap(entry => {
    const paths = entry.routes.map(route => route.pathname.split("/").filter(Boolean));
    const common = paths[0]?.filter((part, index) => !part.includes("[") && paths.every(path => path.slice(0, index + 1).join("/") === paths[0].slice(0, index + 1).join("/"))) ?? [];
    const base = entry.shellPathname ?? `/${common.join("/")}`;
    return base !== "/" && (pathname === base || pathname.startsWith(`${base}/`)) ? [{ entry, base }] : [];
  }).sort((a, b) => b.base.length - a.base.length);
  const owner = candidates[0];
  if (!owner) return null;
  const route = owner.entry.routes.find(item => matchesOperationalPath(item.pathname, pathname));
  const item = owner.entry.navigation.flatMap(group => group.items)
    .filter(item => {
      const path = item.href.split("?")[0];
      return pathname === path || (!item.exact && pathname.startsWith(`${path}/`));
    }).sort((a, b) => b.href.split("?")[0].length - a.href.split("?")[0].length)[0];
  return { module: owner.entry, route: { pathname, title: route?.title ?? item?.title ?? owner.entry.moduleTitle } };
}
