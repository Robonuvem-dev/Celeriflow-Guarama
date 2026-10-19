# Análise e especificação técnica de front-end — Portal da Transparência de Pau dos Ferros/RN

**Versão:** 1.0  
**Data da análise:** 19/10/2026  
**Objetivo:** documentar a arquitetura de informação, experiência do usuário e estrutura de componentes observáveis na página pública, além de fornecer uma especificação de implementação de referência para um portal equivalente, especialmente aplicável ao **CeleriFlow**.

> **Escopo e grau de certeza.** A análise é baseada na estrutura pública indexável da página oficial, seus links e conteúdos, acessados em 19/10/2026. Não houve acesso ao código-fonte original, à folha de estilos computada, ao DOM renderizado no navegador, às medidas por captura de tela nem às APIs privadas. Portanto, **não é possível afirmar** as fontes, cores exatas, dimensões, framework, biblioteca de ícones, efeitos de hover, animações ou implementação interna do site. Valores de CSS, breakpoints e componentes especificados a seguir são **propostas de reprodução**, não medições do original. O portal financeiro da TopSolutions é um sistema separado e não foi inspecionado visualmente.

## 1. URLs e limites do projeto

| Camada | URL | Papel |
|---|---|---|
| Hub de transparência municipal | https://www.paudosferros.rn.gov.br/acessoainformacao.php | Página categorizada de acesso a informações e serviços |
| Busca avançada | https://www.paudosferros.rn.gov.br/pesquisa.php | Busca transversal de informações |
| Execução financeira externa | https://pmpauferrosrn.transparencia.topsolutionsrn.com.br/ | Destino de consultas de receitas, despesas, emendas e ordem cronológica |
| Consulta de receitas externa | https://pmpauferrosrn.transparencia.topsolutionsrn.com.br/receita | Aplicação externa de receitas |

**Distinção fundamental:** o layout em grupos e atalhos detalhado aqui é o do **hub municipal** (`acessoainformacao.php`). As telas de tabelas e indicadores dentro de `topsolutionsrn.com.br` são outro produto; não há base para descrevê-las com precisão nesta análise.

## 2. Síntese da proposta de UX observada

O portal utiliza uma abordagem de **catálogo de serviços e assuntos**, e não apenas menus genéricos. A página contém uma introdução amigável, um caminho para busca avançada e seções temáticas; cada item expõe **título + descrição curta + ação “Acessar →”**. Com isso, a interface oferece ao cidadão uma explicação sobre o que encontrará antes do clique.

**Comportamentos e padrões evidenciados pelo conteúdo público:**

1. Cabeçalho institucional integrado ao site principal da prefeitura.
2. Links de transparência, ouvidoria/SIC, pesquisa e acessibilidade próximos à navegação principal.
3. Menu institucional estruturado, com Prefeitura, Município, Secretarias, Serviços, Transparência, LRF, LGPD e Publicações.
4. Título de contexto “Acesso à informação”, precedido por identificação temática “Transparência”.
5. Boas-vindas e instrução para usar a pesquisa avançada quando necessário.
6. Seções nomeadas e agrupadas, com texto de referência normativa em vários grupos.
7. Itens com nomes compreensíveis e descrições funcionais.
8. Encaminhamento de parte dos itens para soluções terceirizadas.
9. Módulo de avaliação da satisfação da página ao final.
10. Recursos explicitamente indicados: contraste, aumento/diminuição do tamanho de texto, Libras e mapa do site.

## 3. Mapa de hierarquia e layout conceitual

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ BARRA DE UTILIDADES                                                      │
│ Prefeitura | Ouvidoria/SIC | Transparência | Acessibilidade | Pesquisa   │
├──────────────────────────────────────────────────────────────────────────┤
│ IDENTIDADE INSTITUCIONAL + NAVEGAÇÃO PRINCIPAL                           │
│ Início | Prefeitura | Município | Secretarias | Serviços | Transparência │
│ LRF | LGPD | Publicações ...                                              │
├──────────────────────────────────────────────────────────────────────────┤
│ MARCADOR DE CONTEXTO                                                     │
│ Transparência                                                            │
│ H1: Acesso à informação                                                  │
│                                                                          │
│ H2: Bem-vindo ao nosso portal da transparência                           │
│ Introdução textual                                                       │
│ [ Ir para a busca avançada ]                                             │
├──────────────────────────────────────────────────────────────────────────┤
│ H2: Atendimento ao Cidadão                                               │
│ Subtexto: fundamentos legais                                             │
│ [ E-SIC           ] [ Ouvidoria       ] [ Fale Conosco ... ]              │
│ [ título          ] [ título          ] [ título          ]              │
│ [ descrição       ] [ descrição       ] [ descrição       ]              │
│ [ Acessar →       ] [ Acessar →       ] [ Acessar →       ]              │
├──────────────────────────────────────────────────────────────────────────┤
│ H2: Execução Orçamentária e Financeira                                    │
│ [ Receitas Públicas ] [ Despesas Públicas ] [ Emendas ... ]              │
├──────────────────────────────────────────────────────────────────────────┤
│ H2: Gestão Administrativa                                                │
│ [ ... cartões / entradas de catálogo ... ]                               │
├──────────────────────────────────────────────────────────────────────────┤
│ Demais seções: fiscal, institucional, regulamentação, saúde, ATRICON     │
├──────────────────────────────────────────────────────────────────────────┤
│ AVALIAÇÃO DA PÁGINA                                                      │
│ Escala de satisfação | Nome | E-mail | Mensagem | Enviar                 │
├──────────────────────────────────────────────────────────────────────────┤
│ RODAPÉ / IDENTIDADE INSTITUCIONAL                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

**Atenção:** o diagrama representa uma proposta de disposição espacial para implementação. A organização em grupos e os textos foram verificados, porém a quantidade exata de colunas, o tipo visual dos cartões e o posicionamento preciso de cada bloco não foram medidos.

## 4. Inventário de áreas do portal

### 4.1 Atendimento ao Cidadão
Referências textuais na página: Lei 12.527/2011 e Lei 13.460/2017.

- E-SIC — Sistema de Informação ao Cidadão.
- Ouvidoria Municipal — reclamações, sugestões e denúncias.
- Fale Conosco — comunicação com a prefeitura.
- Carta de Serviços — guia de serviços prestados ao cidadão.

### 4.2 Execução Orçamentária e Financeira
Referências: Lei 12.527/2011 e LC 131/2009.

- Receitas Públicas — arrecadação e previsão.
- Despesas Públicas — empenho, liquidação e pagamento.
- Emendas Parlamentares — execução das emendas.
- Ordem Cronológica — fila de pagamentos de fornecedores.

**Integração de navegação:** os quatro itens encaminham para um domínio especializado externo. Em implementação própria, permitir uma configuração `externalUrl` por item; não misturar o conteúdo externo com dados do banco local sem contrato e integração formal.

### 4.3 Gestão Administrativa
- Prestação de Contas / Contratos de Gestão.
- Concurso Público.
- Atas de Registro de Preços.
- Normativos Próprios.
- Leis e Decretos.
- Quadro de Pessoal.
- Portarias.
- Diárias.
- Licitações.
- Publicações.
- Processo Seletivo.
- Contratos Administrativos.
- Convênios e Parcerias.
- Obras Públicas.
- Terceirizados.
- Estagiários.
- COVID-19.

### 4.4 Transparência Fiscal e Contas Públicas
- Transparência Fiscal (LRF), incluindo RREO e RGF.
- PCG — Prestação de Contas de Governo.
- PCS — Prestação de Contas de Gestão.

### 4.5 Informações Institucionais
- Dados Institucionais, Serviços Online, Prefeito e Vice, Secretarias Municipais.
- Brasão, Hino e Bandeira, Conselhos e Membros.
- Glossário, FAQ, Veículos, Mapa do Site, Dados Abertos.
- Contatos, Associações, Plano Estratégico Institucional, Pesquisa de Satisfação.

### 4.6 Normas e Regulamentações
- Regulamentação LAI e Regulamentação das Diárias.
- Parecer do Tribunal de Contas.
- Renúncias Fiscais.
- Relatórios de Gestão e Atividades.
- Regulamentação do Governo Digital.
- LGPD e Tabela de Valores das Diárias.

### 4.7 Saúde Pública
- Orientação para medicamentos do componente básico e de alto custo.
- Lista de Medicamentos SUS e Estoque de Medicamentos.
- Planos de Saúde, Unidades de Saúde e Central de Regulação.
- Acesso ao Painel do Componente Especializado e Alto Custo.

### 4.8 ATRICON
- Plano de Contratação Anual.
- Desonerações.
- Lista de Espera de Creche.
- Informações sobre o Radar da Transparência.
- Dívida Ativa.
- Planos de Educação.
- Incentivos Culturais e Esportivos.

## 5. Cabeçalho e navegação — contrato de interface proposto

**Objetivo:** manter identidade e navegação consistentes entre o portal institucional e a transparência.

**Composição sugerida:**

- `UtilityBar`: links de acesso frequente, pesquisa e acessibilidade.
- `BrandHeader`: brasão/logo e identificação do município; esta peça é proposta de implementação e requer identidade aprovada pelo município.
- `PrimaryNav`: navegação por categorias institucionais; suporta submenu acessível.
- `MobileNavDrawer`: menu compacto em telas pequenas, com botão de abrir/fechar.
- `SkipToContent`: link “Pular para o conteúdo” acessível por teclado.

**Requisitos de comportamento:**

- Cada link possui URL real e texto acessível; não usar `href="#"` para funções sem ação.
- Submenus abrem por clique e teclado, não exclusivamente por `hover`.
- Estados `aria-expanded`, foco visível, acionamento por Enter/Espaço e fechamento por Escape.
- Destacar seção ativa por `aria-current="page"`.
- Evitar depender apenas da cor para indicar a seleção.

## 6. Área de abertura / hero informativo

**Conteúdo confirmado:** marcador “Transparência”, H1 “Acesso à informação”, mensagem de boas-vindas e ação “Ir para a busca avançada”.

**Especificação sugerida:**

- Bloco `PageIntro` com breadcrumb opcional, H1, apresentação curta e CTA.
- Largura máxima legível, evitando linhas de texto longas.
- Alinhamento consistente com a grade dos grupos abaixo.
- CTA em forma de botão/link com foco, hover e indicador de navegação.
- Nunca exigir login para consultas públicas.

## 7. Card de acesso temático — componente principal

O conteúdo confirma a recorrência de **nome, explicação e convite para acessar**. O **formato de cartão** abaixo é uma escolha de engenharia para reproduzir essa experiência, não uma medição do HTML original.

### 7.1 Estrutura de dados

```ts
export type TransparencyItem = {
  id: string;
  title: string;
  description: string;
  href: string;
  external?: boolean;
  icon?: string; // opcional, não confirmado como padrão do original
  tags?: string[];
  enabled: boolean;
  order: number;
};

export type TransparencySection = {
  id: string;
  title: string;
  legalBasis?: string;
  description?: string;
  order: number;
  items: TransparencyItem[];
};
```

### 7.2 Anatomia recomendada

```text
┌───────────────────────────────────┐
│ [ícone opcional]                  │
│                                   │
│  Receitas Públicas                │
│  Arrecadação e previsão das       │
│  receitas municipais              │
│                                   │
│  Acessar →                        │
└───────────────────────────────────┘
```

**Estados:** normal, hover, foco via teclado, pressionado, indisponível e carregamento. É recomendável tornar toda a superfície clicável usando um único `<a>` sem links aninhados. Itens externos devem ser identificáveis; caso abram nova aba, comunicar isso ao usuário e usar `rel="noopener noreferrer"`.

### 7.3 Regras de responsividade propostas

| Faixa | Largura | Grade recomendada |
|---|---:|---|
| Mobile | < 640 px | 1 coluna |
| Tablet | 640–1023 px | 2 colunas |
| Desktop | >= 1024 px | 3 colunas, podendo chegar a 4 se houver espaço |

Usar `grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr))` quando a interface permitir. Manter altura coerente entre cards e ação alinhada à base.

## 8. Especificação visual proposta — design tokens

**Os valores abaixo são uma sugestão profissional para o CeleriFlow; NÃO são as cores ou medidas confirmadas do portal de Pau dos Ferros.** Devem ser substituídos por tokens da marca e, se o objetivo for fidelidade visual, conferidos com screenshots e DevTools.

```css
:root {
  --page-bg: #f7f9fc;
  --surface: #ffffff;
  --text: #172334;
  --text-muted: #5b6879;
  --brand: #1355a0;
  --brand-hover: #0e417c;
  --border: #dce3eb;
  --focus: #ffbf47;
  --radius-sm: 8px;
  --radius-card: 12px;
  --container-width: 1200px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
}
```

**Hierarquia tipográfica recomendada:** fonte sem serifa legível e disponível legalmente; H1 30–36 px desktop e 26–30 px mobile; H2 22–28 px; título de card 16–18 px; corpo 14–16 px; `line-height` em torno de 1.5. Validar contraste WCAG ao aplicar cores oficiais.

## 9. Busca avançada

**Constatação:** a ação principal leva a `/pesquisa.php`; esta página possui campo identificado por “Digite uma informação para pesquisa...” e mensagem “Carregando temáticas disponíveis...”. A existência do carregamento sugere conteúdo dinâmico, mas não permite identificar tecnologia ou API.

**Implementação recomendada:**

- `SearchInput` com botão de pesquisa e rótulo acessível.
- Filtros por temática, ano, órgão e tipo de publicação **apenas se os dados os suportarem**.
- Busca com parâmetros serializados na URL para compartilhar resultados.
- Debounce de 250–350 ms em sugestões, com solicitação protegida contra resultados fora de ordem.
- Estados: inicial, buscando, resultados, vazio, erro e conectividade indisponível.
- Ranking de resultados por relevância, seguido de data quando pertinente.
- Navegação por teclado entre sugestões; nunca ocultar resultados apenas por mudança de foco.

## 10. Pesquisa de satisfação

**Campos e conteúdo comprovados:** escala de cinco opções (Muito insatisfeito, Insatisfeito, Neutro, Satisfeito, Muito satisfeito), nome, e-mail, mensagem, botões Cancelar e Enviar, aviso de que o feedback da página não equivale a manifestação de ouvidoria e menção à LGPD.

**Modelo recomendado:**

```ts
type SatisfactionPayload = {
  pagePath: string;
  rating: 1 | 2 | 3 | 4 | 5;
  name?: string;
  email?: string;
  message?: string;
  consent?: boolean;
};
```

**Regras funcionais:**

- Validar nota, tamanho da mensagem e e-mail somente quando preenchido.
- Definir, em política própria, quais campos são obrigatórios; a página indexada não permite confirmar essa validação.
- Evitar coleta excessiva de dados pessoais e documentar finalidade, retenção e acesso administrativo.
- Feedback assíncrono claro ao enviar, bloqueio de duplo envio e prevenção de spam no backend.
- Não misturar feedback de usabilidade com solicitações formais via e-SIC ou ouvidoria.

## 11. Acessibilidade

**Disponível na interface pública:** links/controles para contraste, aumentar/diminuir texto, Libras, mapa do site e pesquisa.

**Critérios de aceite recomendados:**

- HTML semântico: `header`, `nav`, `main`, `section`, `h1` único, `h2` coerentes, `footer`.
- Navegação completa via teclado; foco visível em todos os links e botões.
- Contraste de texto >= 4,5:1 e de componentes não textuais >= 3:1 quando aplicável.
- Redimensionamento de texto até 200% sem perda funcional.
- Reflow adequado em 320 CSS px (sem scroll horizontal na página geral).
- Respeitar `prefers-reduced-motion`.
- Garantir rótulos de campos, mensagens de erro associadas, avisos `aria-live` e marcadores de links externos.
- Libras deve apontar para funcionalidade realmente disponibilizada, não apenas um ícone decorativo.
- Fazer auditoria com axe-core/Lighthouse **e testes manuais**, sem presumir conformidade apenas pela presença dos controles.

## 12. Arquitetura de componentes sugerida — Next.js / React / TypeScript

```text
src/
  app/
    (public)/
      transparencia/
        page.tsx
      transparencia/pesquisa/
        page.tsx
  components/
    public/
      UtilityBar.tsx
      BrandHeader.tsx
      PrimaryNav.tsx
      MobileNavDrawer.tsx
      PageIntro.tsx
      SectionHeader.tsx
      TransparencySection.tsx
      TransparencyCard.tsx
      SearchInput.tsx
      SatisfactionForm.tsx
      AccessibilityTools.tsx
      PublicFooter.tsx
  config/
    transparency-sections.ts
  lib/
    transparency-links.ts
  types/
    transparency.ts
  styles/
    tokens.css
```

**Separação de responsabilidades:** `page.tsx` orquestra os dados; `TransparencySection` desenha cabeçalho e coleção; `TransparencyCard` só representa um item; links e ordem vêm do banco/configuração e não ficam embutidos no JSX. Evitar importar módulos administrativos completos na rota pública.

### 12.1 Exemplo de composição

```tsx
export default async function TransparencyPage() {
  const sections = await getPublishedTransparencySections();
  return (
    <>
      <PublicHeader />
      <main id="conteudo" className="public-container">
        <PageIntro
          eyebrow="Transparência"
          title="Acesso à informação"
          intro="Encontre os principais serviços e informações públicas."
          searchHref="/transparencia/pesquisa"
        />
        {sections.map((section) => (
          <TransparencySection key={section.id} section={section} />
        ))}
        <SatisfactionForm pagePath="/transparencia" />
      </main>
      <PublicFooter />
    </>
  );
}
```

O exemplo é ilustrativo: funções e componentes citados devem ser implementados.

### 12.2 CSS de referência

```css
.public-container {
  width: min(calc(100% - 32px), var(--container-width));
  margin-inline: auto;
}
.transparency-section { margin-block: var(--space-12); }
.transparency-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: var(--space-4);
}
.transparency-card {
  display: flex;
  flex-direction: column;
  min-height: 160px;
  padding: var(--space-6);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.transparency-card:hover { border-color: var(--brand); box-shadow: 0 6px 20px #142b4714; }
.transparency-card:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.transparency-card__description { color: var(--text-muted); line-height: 1.5; }
.transparency-card__action { margin-top: auto; padding-top: var(--space-4); color: var(--brand); font-weight: 600; }
@media (prefers-reduced-motion: reduce) {
  .transparency-card { transition: none; }
}
```

## 13. Estrutura de dados e gestão editorial

O front-end deve receber um catálogo publicável pelo setor responsável, com: identificador, nome, resumo, URL interna/externa, tema, ordem de exibição, data de revisão, status e responsável. Para execução própria:

- Controle editorial por município (`tenantId`).
- Publicação/despublicação com auditoria.
- Detecção periódica de links quebrados.
- Regra de abertura segura para URLs externas.
- Revisão de textos claros e sem siglas desnecessárias.
- Revisão dos fundamentos legais com equipe jurídica antes de publicar.
- Não inventar páginas ainda não implementadas: disponibilizar somente destinos funcionais ou marcar como indisponíveis.

**Modelo relacional mínimo sugerido:** `transparency_sections`, `transparency_items`, `transparency_item_revisions`, `public_page_feedback`.

## 14. Performance, SEO e segurança

- Preferir renderização estática/ISR para catálogo público, com revalidação após alteração editorial.
- Manter carregamento de JavaScript baixo; não carregar dashboard administrativo na página pública.
- Metadados por município, título e descrição únicos, sitemap e URLs canônicas.
- Linkagem interna real; breadcrumbs semânticos quando úteis.
- Aplicar CSP, proteção contra XSS, sanitização de dados e validação de links.
- Feedback/contato requer rate limit, antispam no servidor e minimização de dados LGPD.
- Medir LCP, INP e CLS com dados reais antes de afirmar desempenho.
- Não realizar scraping de sistemas externos como substituto de integração autorizada.

## 15. Plano de adaptação para CeleriFlow

### Fase 1 — Interface do hub
1. Criar rota pública `/transparencia`.
2. Implementar cabeçalho institucional próprio, introdução, busca e componentes temáticos.
3. Publicar seções com títulos, descrições e CTAs conforme configuração de cada município.
4. Aplicar design tokens da prefeitura e do CeleriFlow sem copiar marcas de terceiros.
5. Validar desktop, tablet e mobile.

### Fase 2 — Conteúdo e destinos
1. Relacionar os módulos CeleriFlow disponíveis: compras/contratos, RH, GED, financeiro, ouvidoria, portal institucional.
2. Para cada item, definir se direciona a página pública interna, relatório, documento, API ou link externo autorizado.
3. Configurar regras de publicação e manutenção de links.
4. Implementar busca entre temas, documentos e serviços efetivamente publicados.

### Fase 3 — Qualidade e governança
1. Instrumentar feedback de satisfação.
2. Executar testes de acessibilidade e teclado.
3. Validar performance e segurança.
4. Implementar auditoria de publicação e rotina de monitoramento de links.
5. Revisar com jurídico/controladoria as exigências de transparência aplicáveis ao contratante.

## 16. Critérios de aceite

| Código | Critério | Validação |
|---|---|---|
| FE-01 | Seções cadastradas aparecem na ordem de publicação | Teste funcional |
| FE-02 | Cada entrada exibe título, descrição e destino | Teste visual e DOM |
| FE-03 | Links internos e externos apontam para destinos válidos | Teste automatizado de links |
| FE-04 | Navegação de teclado completa | Teste manual |
| FE-05 | Conteúdo legível e fluido em 320, 768, 1024 e 1440 px | Teste responsivo |
| FE-06 | Pesquisa apresenta loading, erro, vazio e resultados | Teste funcional |
| FE-07 | Pesquisa de satisfação permite envio e informa resultado | Teste ponta a ponta |
| FE-08 | Cabeçalho e menu preservam contexto institucional | Revisão de UX |
| FE-09 | Ausência de dados públicos protegidos por autenticação indevida | Revisão de acesso |
| FE-10 | Links não publicados ou inválidos não levam a becos sem saída | Teste editorial |
| FE-11 | Títulos e regiões são semânticos | Auditoria WCAG |
| FE-12 | Conteúdo externo não é apresentado como dado nativo sem integração validada | Revisão de integração |

## 17. O que precisa de inspeção complementar para reprodução fiel

Sem capturas desktop/mobile e acesso às ferramentas de desenvolvedor do navegador, **permanecem não verificados**:

- Cores exatas e gradientes, logos e ativos gráficos.
- Família tipográfica, pesos, tamanhos calculados e alturas de linha reais.
- Largura do contêiner, espaçamentos exatos, grid, sombras e bordas.
- Aparência de cartões e existência/estilo dos ícones.
- Hover, animações, sticky header, menu mobile e foco real.
- Framework, CSS, bibliotecas JS, APIs, políticas de cache e desempenho.
- Validações e tratamento de erros no envio do feedback.
- Telas internas do fornecedor financeiro externo.

**Procedimento de auditoria visual recomendado:** abrir o site em Chrome desktop; registrar screenshots em 1440 × 900, 1024 × 768, 768 × 1024 e 390 × 844; examinar Computed Styles no DevTools; avaliar zoom 200%, Tab/Shift+Tab, Lighthouse e axe; registrar medidas e atualizar esta documentação de “proposta” para “medido”.

## 18. Conclusão

O padrão mais interessante do portal de Pau dos Ferros é a **arquitetura de informação centrada nas perguntas do cidadão**. A navegação agrupa assuntos em áreas reconhecíveis, expõe descrições curtas que reduzem ambiguidade, oferece busca avançada como alternativa e aproxima transparência, atendimento e acessibilidade. Para o CeleriFlow, o melhor resultado é adotar esse **modelo de portal-catálogo modular**, com configuração por prefeitura e integração gradual aos módulos existentes, em vez de reproduzir literalmente uma implementação que não foi inspecionada tecnicamente.

## 19. Fontes primárias consultadas

1. Prefeitura Municipal de Pau dos Ferros — Acesso à Informação: https://www.paudosferros.rn.gov.br/acessoainformacao.php (consulta em 19/10/2026).
2. Prefeitura Municipal de Pau dos Ferros — Pesquisa Avançada: https://www.paudosferros.rn.gov.br/pesquisa.php (consulta em 19/10/2026).
3. TopSolutions — Portal financeiro apontado pelo município: https://pmpauferrosrn.transparencia.topsolutionsrn.com.br/ (URL verificada como destino; interface interna não auditada).
