# Prompt inicial para o Codex — CeleriFlow / RH e Folha / POC Ibema

Você está trabalhando no repositório **existente** do CeleriFlow. Este workspace contém a pasta `CeleriFlow_Dossie_RH_Folha_Ibema_2026/` (ou caminho equivalente) com o dossiê de implementação e fontes da POC de Ibema/PR. O objetivo não é criar um módulo isolado nem um protótipo visual: é **auditar e evoluir o RH/Folha integrado** ao Cadastros, Financeiro e Contábil, Portal do Servidor, Controle de Custos e eSocial, mantendo o que já foi implementado.

## Primeira tarefa: auditar antes de alterar

1. Leia o arquivo `DOSSIÊ_CODEX_CELERIFLOW_RH_FOLHA_IBEMA.md` e `LEIA-ME_PRIMEIRO.md`.
2. Leia os 3 PDFs de `01_Documentos_da_POC`, sobretudo Gestão de Folha de Pagamento, Gestão eSocial e requisitos correlatos de Portal do Servidor/SST/Contabilidade. Se for preciso, extraia páginas ou trechos; NÃO jogue 400 páginas de manual em um único prompt.
3. Use `03_Matrizes_Requisitos/MATRIZ_OFICIAL_POC_114_ITENS_FOLHA.csv` e `MATRIZ_OFICIAL_POC_20_ITENS_ESOCIAL.csv` como checklists. A redação veio dos documentos oficiais do certame fornecidos pelo usuário; qualquer divergência deve ser conferida no PDF.
4. Audite rotas React/Next, componentes, Prisma schema/migrations, Neon Postgres, Firebase Auth, Vercel, variáveis, serviços, emissão de relatórios e integrações internas. Descubra o que já existe em cada item, sem adivinhar nomes de tabelas ou rotas.
5. Investigue duplicação de Pessoa/Contrato/Rubricas e problemas de isolação multi-ente; não reescreva código funcional.
6. Use `02_Fontes_Publicas_Baixar/CATALOGO_FONTES_OFICIAIS.json` e PDFs obtidos pelo script para localizar normas/fontes por validade. As normas municipais do PDF do Estatuto de Ibema são **históricas (2005)** e dependem da verificação de alterações posteriores. Manuais da SEAP-PR são exemplos estaduais e **NÃO são lei municipal de Ibema**.
7. Preencha `status_impl`, `arquivo_codigo`, `evidencia_poc` e `pendencia_legal` nas matrizes; documente toda pendência de credencial oficial, sem reportar integração simulada como produção.
8. Entregue diagnóstico: cobertura (114 Folha + 20 eSocial e requisitos cruzados), 15 riscos/gaps mais relevantes, proposta de arquitetura, tabelas afetadas, riscos de migrations/conflito entre dois computadores, plano por etapas e comandos de teste. **Não implemente nem altere migrations nesta primeira rodada.**

## Cuidados de cálculo

- Use valores Decimal, leis/tabelas versionadas por vigência e regime, histórico auditável e memória de cálculo.
- Não aplicar RGPS a RPPS sem confirmação; para 2026 RGPS base 4400 → R$ 417,51 no teste de referência.
- IRRF 2026 inclui Lei 15.270/2025, redução por rendimento tributável mensal e escolha de dedução legal/simplificada quando aplicável; a Receita mostra renda 5000 → IRRF zero.
- Estatuto histórico de Ibema: art 56 quinquênio 5%/5 anos teto 30%; arts 57–59 13º; arts 60–63 extras/noturno/terço férias; arts 73–75 licença-prêmio; arts 100–105 férias; o art 101 tem **lacunas literais em 6,15,24 e 33 faltas**: não preencher sem confirmação.
- Rescisão CLT difere de exoneração estatutária; RRA é tributação própria, não renda mensal comum.
- eSocial S-1.3/NT07 tem XSD com datas futuras após 11/10/2026; não aplicar antes de produção oficial, não enviar sem certificado/autorização.
- Não dar status `ATENDE` apenas por tela, mock ou XML não transmitido.

**Entregue a auditoria e aguarde a próxima instrução para implementar.**
