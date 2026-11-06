# Cadastro funcional demonstrativo — Thiago Morcatty

Aplicado em 06/11/2026, a pedido do usuário autenticado no Chrome. Identidade da conta resolvida a partir da sessão disponível; cookies e tokens permaneceram em memória.

## Cadastro criado

| Campo | Valor fictício |
| --- | --- |
| Nome | Thiago Morcatty |
| Cargo | Coordenador de TI |
| Matrícula persistida | DEMO-TI-2026-001 |
| Lotação | Departamento de Tecnologia da Informação |
| Secretaria | Secretaria Municipal de Administração |
| Centro de custo | Paço Municipal (`AV-CC-001`), revisão contratual a partir de 06/11/2026 |
| Regime | Comissionado, conjunto demonstrativo já existente |
| Admissão / nomeação | 01/01/2025 |
| Posse | 02/01/2025 |
| Nascimento | 15/05/1990 |
| Escolaridade | Superior completo |
| Salário-base | R$ 8.500,00 |
| Jornada mensal | 200 horas |
| Endereço | Rua das Acácias (fictícia), 150, Casa, Jardim das Acácias (fictício), Aurora das Veredas/MG |
| CEP | 39999-000 |
| E-mail cadastral | thiago.morcatty@example.com |
| Inscrição municipal | TM-2026-001 (rótulo revisado no checkup; valor anterior preservado na auditoria) |

Foram incluídos CPF sintético com dígitos verificadores, RG demonstrativo, filiação e contato fictícios. O nome da conta foi atualizado e seu `employeeId` foi associado ao servidor. O perfil administrativo, a credencial de login e o e-mail de autenticação foram preservados.

## Histórico e consultas

- Pessoa física única em `Person`, endereço em `Address` e contribuinte PF em `Taxpayer`.
- Servidor único em `Employee`, cargo em `Role`, contrato versionado em `HrEmploymentContract` e ato de nomeação em `PersonnelAct`.
- **23 pontos:** 20 em outubro e três em novembro (03, 04 e 05/11/2026). Marcações sintéticas de 08h às 17h, com uma hora de intervalo e oito horas trabalhadas. Fins de semana, 12/10, 28/10 e 02/11 foram excluídos da janela preparada.
- **Férias:** aquisição de 01/01 a 31/12/2025, com reserva de 30 dias de gozo entre **01/12 e 30/12/2026**, situação Programada. Aquisição e reserva foram feitas pelo serviço de direitos, com ledger e projeção `Vacation`.
- **Contracheque de outubro/2026:** bruto **R$ 8.500,00**, descontos **R$ 2.145,14**, líquido **R$ 6.354,86**. Calculado, fechado e liberado pelos serviços de folha, em **DEMONSTRACAO**; projeção dos eventos conciliada. O motor usa internamente `mode=OFICIAL` para permitir o fechamento e a publicação, mantendo o escopo demonstrativo.
- A pessoa e o servidor compartilhados ficam disponíveis aos seletores e consultas integradas que usam essas fontes. A inspeção visual realizada está delimitada na próxima seção.
- **Agenda SST:** consulta de orientação ocupacional em 30/11/2026, 9h–9h30 de Brasília, com Renata Barbosa Ferreira (profissional fictícia de Enfermagem já cadastrada), na Sala de orientação ocupacional do Centro Administrativo. Incluída pelo serviço de agenda em **BOOKED**, sem atendimento realizado ou informação clínica, antes das férias programadas. Origem: `CHECKUP_FINANCE_SST_2026_V1`; ID `cmw57kt8h00029ohy5peuqi2o`.
- **Prevenção:** pessoa de Thiago vinculada como organizador das atividades administrativas da programação SIPAT de 23–27/11/2026 e responsável por visita preventiva programada em 19/11/2026 às 10h. Registros futuros, sem conclusão, em `CHECKUP_PREVENCAO_2026_V1`; confirmação autenticada da lista e dos dois detalhes em `prevention-samples-fifth-build/report.json`.
- **Controle Interno / custos:** o contrato inicial não possuía centro de custo e não entrava nas estatísticas por unidade. O pacote `CHECKUP_THIAGO_CUSTOS_2026_V1` completou esse vínculo com o **Paço Municipal**, pela revisão contratual **2**, vigente em **06/11/2026**. Nome, matrícula, regime, cargo, lotação, jornada, remuneração e detalhes foram preservados. A consulta de 31/12 passou a contar uma pessoa e um vínculo; a consulta histórica de outubro e o conteúdo integral do demonstrativo fechado ficaram iguais, conferidos antes/depois na mesma transação. Prévia com rollback, tipagem e ESLint aprovados; repetição retornou zero alterações. **2/2 cenários autenticados** passaram em `thiago-workforce-cost-samples-fifth-build/report.json`, incluindo consulta histórica.

As rotinas de apresentação existentes removem o prefixo técnico `DEMO-` em algumas tabelas de pessoal; nessas telas, a matrícula aparece como `TI-2026-001`. Os registros persistidos e o escopo de cálculo conservam sua identificação demonstrativa.

## Validação realizada

1. Ensaio integral com rollback antes da aplicação: aprovado.
2. Aplicação atômica no banco configurado: aprovada; auditoria e revisão pessoal registradas.
3. Reexecução do pacote já aplicado em transação com rollback: aprovada, conservando os mesmos IDs, 23 pontos, uma programação de férias e o mesmo contracheque.
4. TypeScript do script e suas dependências: zero diagnósticos. ESLint dos dois scripts: aprovado.
5. Navegador autenticado em produção: **12 verificações aprovadas e uma ocorrência conhecida**, registrada como falha visual, sem transformá-la em aprovação.

As aprovações incluem painel do Portal, ficha/ato, ponto de outubro e novembro, férias, demonstrativo completo, lançamentos de folha, servidor no RH, pessoa em Cadastros, servidor em Administração, contribuinte em Tributação e PDF integral. Foram conferidos os valores/linhas esperados, além do HTTP 200. O PDF retornou `application/pdf`, assinatura `%PDF-` e 5.408 bytes.

### Ocorrências concretas em produção

- A ficha fiscal detalhada de `/tributacao/pessoas/[id]` apresenta **404 renderizado com HTTP 200**. Reproduzido tanto para o novo contribuinte quanto para `aurora-system-v1:taxpayer:000`, já existente. A listagem mostra Thiago e o vínculo com um endereço. A rota física existe no código local; o detalhe publicado ainda requer investigação/publicação no trabalho geral de checkup.
- Em 1366×768, a tabela de pessoas fiscais recebe somente 727 px de largura e mostra o aviso de espaço insuficiente. Em 1920×1080, a linha foi visualizada. As correções locais de shell descritas no relatório geral continuam separadas da versão publicada.
- A busca fiscal por nome também retorna outros contribuintes PF: o predicado do CPF usa `LIKE '%%'` quando a pesquisa não contém dígitos. A confirmação visual de Thiago na Tributação usou o CPF sintético completo.

### Continuação do checkup: correções locais confirmadas em desenvolvimento

As três ocorrências acima tiveram suas causas identificadas e receberam correções locais, preservando a evidência de produção:

- O detalhe recebia o ID com `:` codificado como `%3A`; a página agora normaliza o parâmetro antes da consulta. O navegador autenticado local abriu a ficha **Thiago Morcatty**.
- O bloco de confirmação de senha disputava horizontalmente a largura com a tabela. Sua movimentação para o painel compartilhado do header liberou **1.310 px** para a listagem em 1366×768, com a linha integral acessível.
- A busca nominal só inclui o predicado de CPF quando há dígitos. O formulário de consulta por `Morcatty` exibiu uma linha; teste isolado também confirmou CPF/CNPJ formatados, inscrição, endereço e paginação.

Evidência inicial: `local-corrections-development/report.json`. As listagens dos menus de Tributação foram posteriormente confirmadas no quinto bundle em `all-menu-fifth-build/report.json`; o conjunto de correções e detalhes foi exercitado em `final-corrections-fifth-build/report.json`. A agenda pessoal integrada passou em `finance-sst-samples-fifth-build/report.json`. Isso não altera os resultados históricos da versão publicada; a confirmação após publicação permanece pendente.

## Artefatos

- `scripts/seed-thiago-morcatty-demo.ts`: preview, `--rehearse`, `--apply` e `--verify`; identifica a conta por `AUTH_TARGET_FIREBASE_UID`.
- `scripts/verify-thiago-morcatty-browser.mjs`: consultas autenticadas e PDF pelo Chrome/CDP existente.
- `thiago-morcatty-demo.json`: aplicação e IDs de referência.
- `thiago-morcatty-browser/report.json`: resultados de cada consulta, com a ocorrência 404 explicitamente identificada.
- `thiago-morcatty-browser/*.png`: evidências visuais.
- `thiago-morcatty-browser/contracheque-outubro-2026.pdf`: PDF conferido.

**Alterações de banco:** inclusão de dados e associação da conta, usando o schema existente. Nenhuma migração/schema foi alterada. **Tabelas visuais:** nenhuma alteração neste pacote de cadastro. O script e as evidências permanecem locais; os dados já foram confirmados nas telas da aplicação publicada.
