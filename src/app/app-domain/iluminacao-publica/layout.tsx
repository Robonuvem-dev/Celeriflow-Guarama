import { ModuleShell, type ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

const navigation: ModuleNavGroup[] = [{
  title: "Iluminaflow",
  items: [
    { title: "Iluminação Pública", href: "/iluminacao-publica/iluminacao-energia", icon: "lightbulb" },
    { title: "Ordens de Serviço", href: "/iluminacao-publica/ordens-servico", icon: "clipboardCheck" },
  ],
}];

export default async function LightingLayout({ children }: { children: React.ReactNode }) {
  await getTenantContextForModule("ILUMINACAO_PUBLICA");
  return <ModuleShell moduleTitle="Iluminação Pública (Iluminaflow)" moduleCaption="Iluminação pública e operação de campo" moduleIcon="lightbulb" navigation={navigation}>{children}</ModuleShell>;
}
