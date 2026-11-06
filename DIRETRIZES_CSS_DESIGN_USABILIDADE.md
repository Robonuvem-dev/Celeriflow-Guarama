# Diretrizes Arquiteturais de CSS, Design e Usabilidade do Celeriflow

Este documento consolida as diretrizes normativas e padrões arquiteturais obrigatórios de **CSS**, **Design System** e **Usabilidade** adotados no projeto Celeriflow Guarama. Todas as páginas, módulos e componentes devem seguir rigorosamente estes padrões.

---

## 1. Identidade Visual e Paleta de Cores (Design Tokens)

O Celeriflow utiliza uma paleta sóbria, institucional e moderna, fundamentada no Tailwind CSS:

* **Cor Primária Institucional:**
  * Base: `#0e4c7e` (`text-[#0e4c7e]`, `bg-[#0e4c7e]`)
  * Hover / Focus: `#0a3a5c` (`hover:bg-[#0a3a5c]`)
  * Foco e Acessibilidade: `focus-visible:outline-sky-800`
* **Superfícies e Tons Neutros:**
  * Fundo da aplicação: `bg-slate-50` ou `bg-slate-100`
  * Cartões e contêineres: `bg-white` com `border border-slate-200 shadow-sm`
  * Linhas divisórias e bordas: `border-slate-200` (evitar bordas escuras ou pretas)
* **Tipografia e Contraste:**
  * Títulos: `text-slate-900 font-bold`
  * Textos secundários/metadados: `text-slate-600` ou `text-slate-500` (tamanho `text-sm` ou `text-xs`)
* **Badges e Estados de Status:**
  * **Ativo / Concluído / Regular:** `bg-emerald-50 text-emerald-700 border-emerald-200`
  * **Pendente / Aberto / Alerta:** `bg-amber-50 text-amber-700 border-amber-200`
  * **Cancelado / Inativo / Crítico:** `bg-rose-50 text-rose-700 border-rose-200`
  * **Informativo / Em tramitação:** `bg-sky-50 text-sky-700 border-sky-200`

---

## 2. Formulários Modernos e Acessíveis

Os formulários devem transmitir clareza, previsibilidade e feedback imediato:

1. **Campos de Entrada (`Input`, `Select`, `Textarea`):**
   * Altura mínima consistente: `min-h-11` (44px) para garantir ergonomia no toque e clique.
   * Bordas arredondadas: `rounded-xl` ou `rounded-lg`.
   * Borda sutil: `border border-slate-300 bg-white p-2.5 text-slate-900`.
   * Foco nítido e acessível: `focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky-800`.
2. **Organização em Multietapas e Seções:**
   * Utilizar componentes com abas visuais (`tabs`) ou acordeões (`accordion`/`<details>`) para evitar formulários quilométricos em uma única tela vertical.
   * Campos contextuais ou secundários devem ser exibidos/ocultados condicionalmente de acordo com a seleção prévia do usuário (ex: tipo de solicitante, anonimato, pessoa física vs jurídica).
   * Inclusão de botões de atalho integrados como `+ Novo` ao lado de seletores que dependem de cadastros auxiliares (servidores, materiais, fornecedores).
3. **Botões de Ação:**
   * **Primário:** `bg-[#0e4c7e] hover:bg-[#0a3a5c] text-white font-bold rounded-lg px-5 py-2.5 shadow-sm transition-colors`.
   * **Secundário / Cancelar:** `border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-lg px-4 py-2.5`.

---

## 3. Padrão Operacional de Tabelas e Listagens (`OperationalTable`)

Conforme documentado em `docs/Padrão de Tabelas.md` e `docs/ENTREGA_PADRAO_TABELAS.md`, as listagens operacionais são o núcleo da produtividade do sistema:

1. **Reutilização Obrigatória:**
   * Utilizar os componentes de `src/components/app-ui/operational/`: `OperationalListFrame`, `OperationalTable`, `OperationalFilters` e paginação padrão.
   * Não criar tabelas HTML `<table>` improvisadas nem substituir listagens por visualização em cartões ("cards") soltos sem permissão explícita.
2. **Paginação e Tamanho de Lote:**
   * Tamanho padrão fixo de página: `OPERATIONAL_PAGE_SIZE = 20`.
   * A paginação preserva filtros, seleções de ordenação e contexto da pesquisa.
3. **Densidade e Geometria das Células:**
   * Texto integral com quebra elegante ou truncamento com tooltip/popover para leitura completa.
   * Proibido sobrescrever alturas de linha ou criar faixas decorativas soltas sobre cabeçalhos da tabela.
   * Valores monetários, datas e números devem seguir formatação padronizada em Real brasileiro (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`) e data local civil (`DD/MM/AAAA`).
4. **Política de Scroll e Responsividade:**
   * **Desktop / Notebook:** Sem rolagem vertical livre/descontrolada da janela inteira; a tabela cabe no viewport operacional e conta com rolagem interna apenas quando a densidade exigir.
   * **Tablets e Smartphones:** Rolagem horizontal na tabela é permitida por exceção responsiva, com cabeçalho sticky mantido.

---

## 4. Janelas Modais e Painéis de Detalhes

1. **Modais de Ação Rápida e Consulta:**
   * Backdrop: `bg-slate-900/40 backdrop-blur-sm fixed inset-0 z-50 flex items-center justify-center p-4`.
   * Contêiner: `bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto`.
   * Cabeçalho de modal: Título claro com ícone da ação, descrição resumida e botão de fechar (`size-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500`).
   * Rodapé: Alinhamento à direita com botão de fechar/cancelar e botão de confirmação destacado.
2. **Links de "Ver mais" e Detalhes:**
   * Ao clicar em um registro resumido na tabela ou fornecedor, exibir modal com dados imediatos e link de redirecionamento institucional completo para a página correspondente (`mais detalhes / página de cadastro`).

---

## 5. Portal da Transparência e Páginas Públicas

1. **Acessibilidade e Descoberta:**
   * Informações públicas não requerem login e devem oferecer campos de busca global e filtros avançados acessíveis.
   * Cabeçalhos com breadcrumb visual (`nav aria-label="Caminho percorrido"`).
   * Estruturas organizacionais (secretarias e órgãos) devem exibir dados de contato completos: endereço físico, telefone, e-mail institucional, horário de atendimento e base legal de competências.
2. **Exportação e Dicionário de Dados:**
   * Fornecer links de download integral dos dados filtrados nos formatos CSV, PDF, XLSX, TXT, DOCX e JSON.
