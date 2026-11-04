# RH / E5 — relatório sindical e arquivos bancários

Município de apresentação: **Prefeitura Municipal de Vereda das Auroras**.

## Reconciliação literal

Esta entrega continua a matriz histórica de `RH_ETAPAS_1_A_4_CONCLUSAO.md`. Não confundir os números dos requisitos com o código **131** do novo relatório no catálogo.

| Requisito | Resultado no código | Caminho funcional e evidência |
| ---: | --- | --- |
| 179 | **ATENDE** | RH → Registros funcionais → Recolhimentos sindicais; RH → Relatórios → **131 — Contribuição sindical — NT/SRT/MTE 202/2009**. A relação contém entidade, competência, nome completo, PIS, função, remuneração mensal e valor efetivamente recolhido. O desconto fechado e a comprovação documental são origens distintas e obrigatórias. |
| 138 | **ATENDE** | RH → Arquivos bancários → Novo arquivo → **BB EDO001**. Contrato, conta pagadora, remessa, competência e destinatários compõem o anexo I oficial: 100 posições, quatro visões, produto 00315, modalidade 00001 e texto de 48 posições. |
| 135 | **ATENDE** | RH → Arquivos bancários → Novo arquivo → **BB CNAB240 junho/2026**. Serviço 30, crédito BB e TED para outros bancos, segmentos A/B e relação PDF/CSV/XLSX com matrícula, nome integral, agência/conta e valor. Arquivo e relação derivam da mesma memória imutável. |

Mantidos os demais resultados, a consolidação passa de **206/219 (94,06%)** para **209/219 (95,43%)**, com **10 NÃO ATENDE**: **82, 95, 104, 113, 124, 131, 141, 180, 181 e 182**. O requisito **131** permanece incompleto; ele não é o novo relatório de código 131.

O arquivo de créditos desta entrega atende aos titulares da folha. A remessa das destinações/beneficiários de pensão do requisito 82 continua sendo uma cláusula própria pendente.

## Fontes e comportamento

Os documentos oficiais, URLs, hashes e posições estão em `RH_E5_PESQUISA_EDITAL_CAMPO_FLORIDO.md`. Referências regionais não são apresentadas como contratos atuais de Campo Florido.

- Folhas utilizadas na geração precisam ser oficiais e fechadas. Rubricas e totais devem conciliar em centavos.
- Contas de destinatários precisam estar autorizadas e vigentes na data programada. Conta ausente/ambígua, CPF inválido ou limites incompatíveis impedem a geração.
- A matrícula EDO deve ser numérica e única; o texto não é descartado para caber nas 48 posições. Documento acima de 99 linhas requer reorganização da origem.
- Geração bancária conserva parâmetros, conta/convênio de origem, demonstrativos, total, conteúdo e SHA-256. Sequência repetida com outro conteúdo é recusada; repetição idêntica recupera o mesmo evento.
- Recolhimento sindical é certificado documentalmente contra o desconto fechado; a soma dos comprovantes não supera o desconto. Retificação cancela a comprovação anterior e registra uma nova fonte.
- O relatório sindical usa nome/matrícula preservados e remuneração de todas as execuções oficiais fechadas do contrato na competência, sem duplicar remuneração por comprovante. Acesso parcial à remuneração integral impede a emissão.
- A emissão sindical usa o consumidor e os exportadores RH existentes; a bancária oferece TXT e relações PDF/CSV/XLSX da origem preservada.

## Dados e interface

**Banco:** sem migração ou schema novo. São reutilizados registros funcionais, referências de convênio/conta e eventos de integração imutáveis.

`RH_E5_VERIFICACAO_2026.json` confirma, em transação somente leitura, **198 titulares, 19 execuções e 3.414 demonstrativos**. Os **594 demonstrativos originais** conservam o fingerprint `3d7da83e347a9af7801089cfb17fc48a`. Não foram certificados recolhimentos nem gerados arquivos com dados municipais sem parâmetros/comprovantes fornecidos.

**Tabelas visuais:** a rota `/rh/arquivos-bancarios` usa o shell operacional, paginação de 20, preferência estável, busca antes da paginação e componentes compartilhados. A ficha sindical e seus seletores reutilizam as telas RH existentes. Erros de envio conservam os campos e seleções do formulário. A inspeção estática não substitui o aceite visual/navegação do usuário.

## Verificações

- **7 cenários específicos PASS:** vetores de leiaute por posição, 21 créditos em dois lotes, centavos, limites EDO, serviço transacional Neon/Drizzle em banco isolado, reapresentação idempotente, cancelamento/retificação, autorização e integridade.
- **10 regressões de cálculo/histórico RH PASS.**
- **TypeScript auxiliar do E5 PASS**, incluindo os três arquivos de cenários e o verificador municipal.
- **ESLint dos arquivos RH alterados PASS.**
- **Preservação municipal e emissões sindical CSV/PDF/XLSX PASS.** Não há comprovantes cadastrados; a relação municipal retorna corretamente zero contribuintes certificados.
- A reconciliação operacional estrita global identifica desvios de outros caminhos, discriminados no documento de pesquisa. Não foi registrada como aprovação global ou visual.
- **Build completo PASS:** `npm run build` concluiu com código zero após integração de `origin/main` (`7a19c0f`), preservando as correções da outra equipe. Foram verificadas as 17 partições de tipos, compilação otimizada e geração das 110 páginas estáticas. A rota e a API bancárias constam da saída de produção.

## Planilha e deploy

A publicação utiliza **Robonuvem-dev** e o fluxo GitHub → Vercel. A planilha original recebe apenas os requisitos **5.135, 5.138 e 5.179** integralmente implementados, preservando responsáveis e observações anteriores. A aplicação é conferida por exportação integral, além do estado de salvamento no Drive.

Artefatos independentes do Desktop, em `C:\Users\trici\AppData\Local\Temp\opencode\`:

- `rh-e5-deploy.json`: commit, deployment READY, alias municipal e saúde do banco.
- `rh-e5-planilha/plano-edicao-original.json`: alvos e valores reconciliados.
- `rh-e5-planilha/verificacao-edicao-original.json`: comparação de células, demais conteúdos, fórmulas, formatos e estrutura.

O estado final desses artefatos é confirmado no encerramento da entrega. O acesso do Google Sheets permanece no perfil Chrome independente via CDP, como nas revisões anteriores.

### Confirmação final da publicação e da planilha

- **Código publicado:** `b25793e5c3b3eeb876382fe196b6b491e21b5bed`, autor GitHub `Robonuvem-dev`.
- **Vercel READY:** deployment `dpl_78YMmVzqToBYgjfqAtr1B18QJaar`, conferido em `2026-11-04T01:17:18.527Z`; alias `guarama.celeriflow.com.br` atribuído, `/api/health` com `status: ok` e `database: ready`.
- **Planilha original PASS:** conferida em `2026-11-04T01:28:26.187Z`, após fechar a visualização temporária, com salvamento no Drive e exportação integral. Nove células C/F/G dos requisitos 5.135, 5.138 e 5.179 alteradas; responsáveis Thiago e observações anteriores preservados. Resultado **209 ATENDE / 10 NÃO ATENDE**, em 219 requisitos RH.
- **Integridade:** oito abas e 670 fórmulas preservadas; nenhuma diferença inesperada de conteúdo, formato, validação ou estrutura na comparação final.
- Um filtro compartilhado por responsável ocultava os alvos na reabertura do navegador. A conferência detectou duas células fora do alvo, restauradas integralmente antes da aplicação definitiva. A reaplicação usou uma visualização temporária pessoal e verificação explícita do endereço selecionado antes de cada escrita. A visualização temporária foi fechada ao concluir; o filtro compartilhado foi preservado.
