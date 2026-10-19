import type { PublicCollection } from "./query-contract";
import type { TransparencySettings } from "./presentation-settings";
import { publicTransparencyPath } from "./publication-policy";

export type DiscoveryItem = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: string;
  external?: boolean;
  keywords?: string[];
  source?: TransparencySettings["defaultSource"];
};

export type DiscoverySection = {
  id: string;
  title: string;
  description: string;
  tone: "blue" | "green" | "amber" | "violet";
  featured?: boolean;
  legalBasis?: string;
  items: DiscoveryItem[];
};

const sectionDefinitions = [
  { id: "financas", group: "Receitas e despesas", title: "Receitas e despesas", description: "Entenda de onde vêm os recursos públicos e como são utilizados.", tone: "green", featured: true },
  { id: "pessoal", group: "Pessoal e diárias", title: "Pessoal e diárias", description: "Consulte servidores, remuneração, cargos e despesas com viagens.", tone: "violet" },
  { id: "contratacoes", group: "Compras, contratos e obras", title: "Compras, contratos e obras", description: "Acompanhe contratações, fornecedores, parcerias e obras públicas.", tone: "amber" },
  { id: "recursos", group: "Bens e recursos públicos", title: "Bens e recursos públicos", description: "Conheça o patrimônio, os materiais e a frota do município.", tone: "blue" },
  { id: "documentos", group: "Documentos e informação", title: "Planejamento, contas e legislação", description: "Encontre planos, documentos públicos, leis e publicações oficiais.", tone: "blue" },
  { id: "saude-educacao", group: "Saúde e serviços setoriais", title: "Saúde e educação", description: "Acesse informações públicas sobre medicamentos e filas de atendimento.", tone: "green" },
] satisfies Array<Omit<DiscoverySection, "items"> & { group: string }>;

const icons: Record<string, string> = {
  receitas: "revenue", despesas: "expense", liquidacoes: "receipt", pagamentos: "receipt",
  servidores: "people", diarias: "travel", licitacoes: "gavel", contratos: "contract",
  obras: "building", frota: "vehicle", medicamentos: "health", "fila-saude": "health",
  "fila-creches": "education", legislacao: "law", publicacoes: "document",
};

const aliases: Record<string, string> = {
  receitas: "arrecadacao impostos tributos", despesas: "gastos dinheiro empenhos",
  servidores: "salario salarios folha funcionarios remuneracao", licitacoes: "edital editais compras",
  contratos: "fornecedores aditivos", medicamentos: "remedios farmacia estoque",
  "fila-creches": "matricula crianca infantil", "acesso-informacao": "esic e-sic lai pedido informacao",
  ouvidoria: "reclamacao denuncia sugestao elogio", publicacoes: "rreo rgf lrf contas relatorios",
};

export function isTransparencyConsultation(raw: Record<string, string | string[] | undefined>) {
  const keys = new Set(["view", "entity", "source", "year", "search", "from", "until", "page", "pageSize", "sort", "direction", "record", "format"]);
  return Object.keys(raw).some(key => keys.has(key) || key.startsWith("f."));
}

export function buildTransparencyDiscovery(catalog: PublicCollection[], settings: TransparencySettings): DiscoverySection[] {
  const year = settings.availableYears.includes(new Date().getUTCFullYear()) ? new Date().getUTCFullYear() : settings.availableYears[0];
  const entity = settings.entities.find(item => item.enabled)!.key;
  const items: DiscoveryItem[] = catalog.map(collection => {
    const source = collection.slug === "publicacoes" || collection.slug.startsWith("doc-") ? "DOCUMENTOS" : settings.defaultSource;
    const params = new URLSearchParams({ view: collection.slug, entity, year: String(year), source });
    return { id: collection.slug, title: collection.title, description: collection.description, href: `${publicTransparencyPath}?${params}`, icon: icons[collection.slug] || "document", source, keywords: [collection.group] } satisfies DiscoveryItem;
  });
  const sections: DiscoverySection[] = [{
    id: "atendimento", title: "Atendimento ao cidadão", description: "Escolha o canal certo para pedir informações, falar com a prefeitura ou encontrar um serviço.", tone: "blue",
    items: [
      { id: "acesso-informacao", title: "Acesso à informação (e-SIC)", description: "Solicite informações públicas que você não encontrou no portal.", href: "/portal/acesso-informacao", icon: "info" },
      { id: "ouvidoria", title: "Ouvidoria", description: "Envie reclamações, denúncias, sugestões e elogios sobre os serviços públicos.", href: "/portal/ouvidoria", icon: "message" },
      { id: "contato", title: "Fale com a prefeitura", description: "Encontre os canais de contato para falar com a administração municipal.", href: "/portal/contato", icon: "contact" },
      { id: "servicos", title: "Serviços ao cidadão", description: "Conheça os serviços disponíveis e como acessar cada atendimento.", href: "/portal/servicos", icon: "services" },
    ],
  }];
  for (const definition of sectionDefinitions) {
    const members = items.filter(item => catalog.find(collection => collection.slug === item.id)?.group === definition.group);
    if (definition.id === "financas" && members.length) members.push({ id: "painel-financeiro", title: "Painel financeiro", description: "Veja os indicadores de arrecadação e execução financeira disponíveis na fonte selecionada.", href: `${publicTransparencyPath}/painel?${new URLSearchParams({ entity, year: String(year), source: settings.defaultSource })}`, icon: "chart", source: settings.defaultSource });
    if (definition.id === "documentos") members.push({ id: "planejamento", title: "Planejamento e orçamento", description: "Consulte os documentos publicados de planejamento e orçamento municipal.", href: "/portal/planejamento", icon: "chart" });
    if (members.length) sections.push({ ...definition, items: members });
  }
  const knownGroups = new Set(sectionDefinitions.map(section => section.group));
  const otherItems = items.filter(item => !knownGroups.has(catalog.find(collection => collection.slug === item.id)!.group));
  if (otherItems.length) sections.push({ id: "outros-assuntos", title: "Outros assuntos publicados", description: "Consulte os demais temas disponibilizados pela gestão municipal.", tone: "blue", items: otherItems });
  sections.push({
    id: "ajuda", title: "Informação e participação", description: "Explore os caminhos do portal e acompanhe as informações de transparência.", tone: "blue",
    items: [
      { id: "mapa", title: "Mapa das consultas", description: "Veja todos os assuntos publicados em uma lista organizada.", href: `${publicTransparencyPath}/mapa`, icon: "map" },
      { id: "pntp", title: "PNTP e evidências", description: "Consulte o acompanhamento de critérios e as evidências registradas. Não representa certificação.", href: `${publicTransparencyPath}/pntp`, icon: "shield" },
      { id: "estatisticas", title: "Estatísticas de atendimento", description: "Acompanhe os pedidos de informação, manifestações e avaliações de atendimento.", href: `${publicTransparencyPath}/estatisticas`, icon: "chart" },
      { id: "perguntas", title: "Perguntas frequentes", description: "Tire dúvidas sobre o acesso às informações e aos serviços municipais.", href: "/portal/perguntas-frequentes", icon: "info" },
    ],
  });
  if (/^https?:\/\//i.test(settings.radarUrl)) {
    sections[sections.length - 1].items.push({ id: "radar", title: "Radar da Transparência", description: "Acesse a consulta pública do Radar Nacional da Transparência Pública.", href: settings.radarUrl, icon: "shield", external: true });
  }
  return sections;
}

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export function searchTransparencyDiscovery(sections: DiscoverySection[], search: string) {
  const terms = normalize(search.trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return sections.flatMap(section => section.items.map(item => ({ item, section })))
    .filter(({ item, section }) => terms.every(term => normalize(`${item.title} ${item.description} ${section.title} ${item.keywords?.join(" ") || ""} ${aliases[item.id] || ""}`).includes(term)))
    .sort((a, b) => Number(terms.every(term => normalize(b.item.title).includes(term))) - Number(terms.every(term => normalize(a.item.title).includes(term))));
}
