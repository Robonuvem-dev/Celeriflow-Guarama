# RH / E5 — fontes e sequência de implementação

Referência de coleta: 03/11/2026. Esta nota registra as fontes oficiais, os contratos de arquivo e a implementação dos primeiros três itens do E5. Publicação e classificação consolidada são registradas ao final.

## Situação de partida

Referência funcional: `RH_ETAPAS_1_A_4_CONCLUSAO.md`: **206 ATENDE / 13 NÃO ATENDE** de 219 requisitos. Permanecem incompletos **82, 95, 104, 113, 124, 131, 135, 138, 141, 179, 180, 181 e 182**.

Ordem priorizada: **179 → 138 → 135**, depois destinações bancárias do 82, abertura/importação de contas 180/181 e demais formatos. Somente o atendimento integral dos três primeiros elevará o resultado para **209/219 = 95,43%**. A coleta dos manuais, isoladamente, não altera a classificação.

Os leiautes Banco do Brasil são referências técnicas escolhidas para o desenvolvimento. Sua publicação oficial não comprova que esse banco seja o atual conveniado de Campo Florido. Da mesma forma, referências regionais de consignação ou avaliação atuarial não comprovam contratação municipal vigente. Não é necessário transmitir pagamentos reais para implementar e verificar geração/importação de arquivos.

## Fontes oficiais coletadas

Os PDFs, textos extraídos e metadados estão em `C:\Users\trici\AppData\Local\Temp\opencode\rh-e5-fontes\`; `manifest.json` registra URL, data, tamanho e SHA-256.

| Documento | Fonte | SHA-256 |
| --- | --- | --- |
| BB — pagamentos CNAB240, junho/2026 | [PgtVer03BB.pdf](https://www.bb.com.br/docs/portal/disem/PgtVer03BB.pdf) | `4c41b8dac0b5a2b5ab49a360b4b3693ee99a0d414ebbbbe3e8d0239ab3b8618c` |
| BB — contracheques EDO001 / EDO901 | [Doc7795edo001edo901.pdf](https://www.bb.com.br/docs/pub/emp/empl/dwn/Doc7795edo001edo901.pdf) | `60f91bc446cf288779952059cf83481def0b7c7945461b3b124cd5c669b75b1f` |
| BB — abertura de contas, remessa MCI460 | [Doc1094MCI460.pdf](https://www.bb.com.br/docs/pub/emp/empl/dwn/Doc1094MCI460.pdf) | `87324a864399f737205d719630bdab1dd054e5a2bfe6a9a38e9c4fea97b6d9f6` |
| BB — abertura de contas, retorno MCI470 | [Doc1095MCI470.pdf](https://www.bb.com.br/docs/pub/emp/empl/dwn/Doc1095MCI470.pdf) | `8eb51de62c4b4fb17c35f981b7c92ea2302295746c12c4187f5a1531a7fffefa` |
| BB — retorno de consignações | [CNAB240Retorno.pdf](https://www.bb.com.br/docs/pub/siteEsp/diemp/dwn/CNAB240Retorno.pdf) | `18d8e79d460ef6072973b094eaff86e44b61e354ec4f00aa655ffcb88c9e17fe` |
| DOU, 15/12/2009, seção 1, página 150 — NT/SRT/MTE 202/2009 | [Imprensa Nacional](https://pesquisa.in.gov.br/imprensa/servlet/INPDFViewer?jornal=1&pagina=150&data=15%2F12%2F2009&captchafield=firstAccess) | `8f04e490200d38b8fb48df15e1afc3e9ec93af143eed9548b83717d04781ab06` |

## 179 — relatório sindical

Texto literal: “Emitir relatório de Contribuição Sindical, para atender a Nota Técnica/SRT/MTE nº 202/2009”.

O item 3 da nota exige relação nominal por entidade sindical com **nome completo, PIS, função exercida, remuneração percebida no mês do desconto e valor recolhido**. O item 4 admite meio magnético, internet ou cópia da folha conforme entendimento entre empregador e entidade; menciona quinze dias após o recolhimento.

Implicações para o serviço e consumidor:

- Identificar sindicato beneficiário, competência e rubricas de origem sem confundir contribuição sindical com qualquer consignação.
- Preservar nome, função, remuneração e identificação trabalhista da referência documental; não reconstruir o passado com o cargo atual.
- Distinguir desconto calculado, reserva/cronograma e **valor efetivamente recolhido**. A consulta de consignações atual declara expressamente que não comprova desconto ou repasse.
- Ligar os valores recolhidos à comprovação ou certificação documental existente, com origem e eventuais estornos, sem criar pagamentos reais ou inventar recolhimentos.
- Expor consulta e emissão integral no catálogo RH com as guardas de titular, lotação, folha e rubrica pertinentes; exportação deve preservar todos os contribuintes do filtro.

Implementação: `union-contribution.ts`, modalidade `RECOLHIMENTO_SINDICAL` de Registros funcionais e relatório **131** do catálogo RH. O serviço exige demonstrativo oficial fechado do contrato, rubrica de desconto existente, comprovante, entidade/CNPJ, PIS/função documentais e recolhimento efetivo em centavos. Sob o lock funcional canônico, verifica duplicidade do comprovante e soma certificada máxima por demonstrativo/rubrica. A retificação cancela a comprovação preservada e cria outra com a nova fonte.

A relação agrupa os recolhimentos por sindicato, competência e contribuinte; usa o nome/matrícula preservados e a remuneração de todas as execuções oficiais fechadas do contrato na competência. Não duplica a remuneração por comprovante e não a apresenta como integral se parte da origem estiver fora da permissão. Cancelados não entram na relação. A remuneração é a da folha; a comprovação de recolhimento é documental, sem criação de pagamento financeiro.

## 138 — BB / EDO001

Texto literal: “Permitir a geração de arquivos de contracheque para o terminal de autoatendimento do Banco do Brasil de acordo com convênio e layout específico”.

Contrato de remessa confirmado no anexo I:

- Registros de **100 posições**; quatro visões: header `0`, destinatário `1`, texto `2` e trailer `9`.
- ASCII sem acentos/cedilha; campos numéricos completados com zeros e alfanuméricos com espaços.
- Header: agência 24–27; conta sem DV 28–38; `EDO001` 39–44; contrato 45–56; sequência 57–62; produto **00315** 63–67; modalidade **00001** 68–72; ano 73–76; mês 77–78; extraordinária 79–80; data de crédito 81–88.
- Destinatário: identificador numérico de 20 posições; agência e conta sem DV; número de linhas em duas posições; nome 41–80 e CPF 81–91.
- Texto: identificador, sequência em duas posições, tipo `2`, **48 posições de texto** em 24–71, indicador de salto na 72 e 28 espaços finais. Não truncar silenciosamente rubricas/campos para caber: compor linhas preservando o conteúdo e respeitar a capacidade de duas posições.
- Trailer: identificador/sequência/tipo e campos bancários preenchidos com noves, quantidade de destinatários 39–49 e espaços 50–100.
- Ordenação pelos primeiros 23 bytes; um documento por destinatário por remessa. Mais de um documento para o mesmo identificador requer nova remessa.
- EDO901 é o retorno específico e tem 150 posições; não confundir com arquivo de remessa nem com o retorno de pagamento CNAB240.

Implementação: `bank-file-layouts.ts`, `bank-file-service.ts` e `/rh/arquivos-bancarios`. O formulário informa contrato e parâmetros do convênio; a geração lê os demonstrativos fechados e a conta BB vigente, normaliza ASCII e preserva o texto em linhas de 48 posições. Matrícula não numérica, matrícula repetida, conta ausente/ambígua ou documento acima de 99 linhas bloqueiam a remessa inteira. Os nomes dos campos bancários seguem as larguras oficiais; o corpo e a relação preservam o nome integral. Credenciais de transmissão não são pré-condição para essa geração.

## 135 — crédito em conta

Texto literal: “Permitir a geração de arquivos para crédito em conta corrente da rede bancária, emitindo relação dos créditos contendo matrícula, nome, conta corrente e valor a ser creditado”.

Base escolhida: particularidades BB CNAB240 **junho/2026**, usando tipo de serviço de pagamento de salário **30**, forma de lançamento correspondente ao destino e os segmentos exigidos pelo manual para cada modalidade. A relação deve reconciliar, por titular e total, o arquivo com as fontes fechadas da folha.

A consulta preparatória anterior (`bank-preparation-report.ts`) continua sendo uma relação de conferência. O gerador próprio em `/rh/arquivos-bancarios` produz CNAB240 BB junho/2026, serviço **30**, lotes separados de crédito BB **01** e TED de outra titularidade **41**, segmentos **A/B**, contadores de registros/lotes e somatórios em centavos. Destinos utilizam a única conta corrente/salário vigente de cada titular; conta ambígua bloqueia a geração. Líquido negativo bloqueia; zero não gera crédito e fica identificado na memória.

Arquivo, parâmetros, convênio, origens, destinatários e SHA-256 são preservados em evento imutável. Reutilizar sequência com outros parâmetros é recusado. Download verifica integridade e acesso a todas as origens. A relação PDF/CSV/XLSX é gerada da mesma memória e contém matrícula, nome integral, agência/conta e valor de cada crédito, além das fontes. Não há transmissão, baixa, pagamento financeiro ou criação de contas Portal.

### Pontos de integração conferidos no código

- `supplementary-records.ts`: `CONVENIO_BANCARIO` mantém banco, finalidade, vigência e fundamento; `CONTA_CONVENIO` mantém servidor, convênio, agência, conta, tipo e autorização. Não presumir que esses campos livres já separam dígitos verificadores ou contenham a conta pagadora/contrato EDO.
- `functional-records.ts`: `SERVICO_BANCARIO` mantém banco, convênio, serviço e versão; será necessário selecionar a referência pertinente e consumir efetivamente seus parâmetros no adaptador.
- `external-configuration.ts` é específico de eSocial, com XSD e endpoints; não deve ser usado como pré-condição artificial para exportar EDO001/CNAB240.
- `report-catalog.ts`, `report-service.ts`, `/rh/relatorios` e `/api/rh/relatorios` preservam a consulta/exportação integral. O catálogo passa de 130 para **131** relatórios com a relação sindical.
- `financeiro/bank-integration-client.ts` não contém serializador CNAB240 de folha. Os dois serializadores próprios foram adicionados em `bank-file-layouts.ts`, conforme os documentos desta nota.

## Lacunas de pesquisa ainda abertas

- Leiautes efetivos por provedor/versão do item 141, inclusive ConsigNet; manual BB de consignação não comprova os demais provedores.
- Manual integral SICOM FLPG 2026 v10.1: a tentativa registrada no manifesto falhou no download.
- Formato de importação SIOPE municipal vigente, pacote cadastral atuarial completo e obrigações anuais/históricas aplicáveis aos demais itens.

## Preservação e publicação

A execução mantém a apresentação **Prefeitura Municipal de Vereda das Auroras**. A verificação de preservação considera 198 titulares, 19 execuções e 3.414 demonstrativos, inclusive os originais de agosto a outubro/2026.

- **Banco:** sem schema ou migração nova. A funcionalidade reutiliza os registros funcionais e os eventos imutáveis existentes. Nesta entrega não são certificados recolhimentos nem gerados arquivos com os titulares municipais sem parâmetros/comprovantes reais fornecidos.
- **Tabelas visuais:** listagem de arquivos usa `OperationalListFrame`, `OperationalTable` e paginação de 20; formulário e referências reutilizam os componentes RH. Navegação e manifesto operacional receberam a rota efetiva. O cadastro sindical reutiliza a ficha e a listagem funcional existentes.
- **Verificação executada:** sete cenários específicos de E5 (leiautes por posição, 21 créditos em dois lotes, centavos, limite de linhas, fontes fechadas, integridade e autorização) e dez regressões de cálculo/histórico RH passaram. Os cenários SQL usam banco isolado com o histórico integral de migrações.
- **Transações:** os cenários específicos também executam o cadastro sindical e a geração bancária pelo driver Neon/Drizzle real em banco isolado; confirmam retificação imutável, cancelamento, reapresentação idempotente e recusa de sequência reaproveitada com parâmetros diferentes.
- **Reconciliação visual estática:** `node scripts/verify-operational-coverage.mjs --strict` não passa globalmente. Registra 36 renderizadores nativos operacionais, três grades de edição GED, renderizadores órfãos e ausência de provider em `/rh/pasta-funcional/[id]`, todos em arquivos não alterados nesta entrega. A rota nova está ligada ao manifesto e aos componentes operacionais; o resultado global não é apresentado como aprovação visual.
- **Banco municipal, somente leitura:** `RH_E5_VERIFICACAO_2026.json` confirma 198 titulares, 19 execuções, 3.414 demonstrativos e os 594 originais com fingerprint `3d7da83e347a9af7801089cfb17fc48a`. O relatório sindical emite CSV/PDF/XLSX e retorna zero contribuintes certificados, coerentemente com a ausência de comprovações documentais cadastradas.
- **Aceite visual:** permanece com o usuário; não há afirmação de homologação bancária externa nesta entrega.
- **Build completo PASS:** `npm run build`, após integração de `origin/main` (`7a19c0f`), passou nas 17 partições de tipos, compilação e geração de produção. Publicação e atualização da planilha são acompanhadas pelos artefatos independentes descritos em `RH_E5_ENTREGA_2026-11-03.md`, com confirmação final no encerramento da entrega.
