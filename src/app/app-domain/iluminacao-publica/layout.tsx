import { ModuleShell, type ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

const navigation: ModuleNavGroup[] = [{
  title: "IluminaFlow",
  items: [
    { title: "Dashboard", href: "/iluminacao-publica", icon: "layoutDashboard", exact: true },
    { title: "IluminaFlow", href: "https://app.iluminaflow.com.br/", icon: "lightbulb" },
    { title: "Site IluminaFlow", href: "https://www.iluminaflow.com.br/", icon: "globe" },
  ],
}];

export default async function LightingLayout({ children }: { children: React.ReactNode }) {
  await getTenantContextForModule("ILUMINACAO_PUBLICA");
  return <ModuleShell moduleTitle="Iluminação Pública" moduleCaption="Indicadores e acesso ao IluminaFlow" moduleIcon="lightbulb" navigation={navigation}>{children}</ModuleShell>;
}
