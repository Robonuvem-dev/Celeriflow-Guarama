import { Suspense } from "react";
import { ModuleShell, type ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";

const navigation: ModuleNavGroup[] = [
  {
    title: "Geral",
    items: [
    { title: "Painel", href: "/cadastros", icon: "layoutDashboard", exact: true },
    { title: "Pessoas Físicas", href: "/cadastros/pessoas-fisicas", icon: "users" },
    { title: "Pessoas Jurídicas", href: "/cadastros/pessoas-juridicas", icon: "building2" },
    { title: "Famílias", href: "/cadastros/familias", icon: "users" },
    { title: "Entidades", href: "/cadastros/entidades", icon: "building2" },
    ],
  },
  {
    title: "Estrutura",
    items: [
      { title: "Organograma", href: "/cadastros/organograma", icon: "network" },
      { title: "Centros de Custo", href: "/cadastros/centros-custo", icon: "landmark" },
      { title: "Localidades", href: "/cadastros/localidades", icon: "mapPin" },
    ],
  },
  {
    title: "Referências",
    items: [
      { title: "Textos Jurídicos", href: "/cadastros/textos-juridicos", icon: "fileText" },
      { title: "Bancos e Agências", href: "/cadastros/bancos-agencias", icon: "landmark" },
      { title: "Tributos", href: "/cadastros/tributos", icon: "receipt" },
      { title: "Moedas", href: "/cadastros/moedas", icon: "banknote" },
      { title: "Produtos", href: "/cadastros/produtos", icon: "package" },
      { title: "CBO", href: "/cadastros/cbo", icon: "briefcase" },
      { title: "Assinantes Legais", href: "/cadastros/assinantes-legais", icon: "fileSignature" },
    ],
  },
  {
    title: "Operacional",
    items: [
    { title: "Fornecedores", href: "/cadastros/fornecedores", icon: "truck" },
    { title: "Imóveis", href: "/cadastros/imoveis", icon: "home" },
    { title: "Documentos", href: "/cadastros/documentos", icon: "fileBox" },
      { title: "Qualidade dos Dados", href: "/cadastros/qualidade", icon: "shieldCheck" },
    ],
  },
];

export default function CadastrosLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <ModuleShell moduleTitle="Cadastros Gerais" moduleCaption="Cadastro único" moduleIcon="users" navigation={navigation}>
        {children}
      </ModuleShell>
    </Suspense>
  );
}
