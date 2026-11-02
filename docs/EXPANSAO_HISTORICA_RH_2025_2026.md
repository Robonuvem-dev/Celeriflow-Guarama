# Expansão histórica de RH e Portal — 2025/2026

## Autorização e apresentação

Em 02/11/2026, o solicitante autorizou completar 2026, incluir dezembro/2025 com décimo terceiro e férias e emitir comprovantes anuais de 2025 para os 198 servidores já cadastrados. Também determinou que a apresentação do sistema use a identidade **Prefeitura Municipal de Vereda das Auroras**, com a nomenclatura normal de cadastro, folha e documentos.

Os identificadores de origem, o escopo `DEMONSTRACAO`, os indicadores de estimativa e os registros técnicos permanecem na persistência e nestas evidências internas. A apresentação dos documentos e consultas não altera snapshots fechados nem transforma eventos locais em liquidação bancária ou pagamento nativo do Financeiro.

## Recorte e método

- **2026:** doze folhas mensais de 198 titulares. Agosto, setembro e outubro reutilizam as 594 versões publicadas do pacote anterior. Os meses restantes usam a revisão contratual vigente em cada competência.
- **2025:** uma folha mensal de dezembro para os mesmos 198 titulares, com vínculos históricos separados, encerrados em 31/12/2025. A admissão de referência desses vínculos é 01/01/2024; não se altera a admissão dos vínculos de 2026. Remuneração de 2025: referência por cargo de novembro/2026 dividida por 1,05, arredondada em centavos.
- **Informe 2025:** janeiro a novembro são histórico de abertura de rendimentos, com onze competências e valores individualizados, sem criar onze folhas operacionais ou onze meses adicionais de ponto em 2025. Dezembro e as folhas especiais vêm de cálculos canônicos fechados e de eventos locais que preservam o ano da data de pagamento.
- O histórico de abertura exige conciliação `bruto − previdência − IRRF = líquido`, onze competências distintas e datas no respectivo mês de 2025. Duplicidade com folha mensal do mesmo contrato/competência impede a emissão. O acesso aos valores importados depende do vínculo e da folha de dezembro que ancora o histórico.
- **13º:** adiantamento e quitação em 2025 e 2026, doze avos; a quitação vincula a execução anterior para abater o adiantamento sem duplicar rendimentos.
- **Férias:** 18 programações de 30 dias em dezembro/2025; em dezembro/2026 são utilizadas as 30 programações existentes. Os dias remunerados em folha de férias são compensados no vencimento mensal para evitar pagamento dobrado. Gozo que atravessa dezembro/janeiro conserva sua programação e o período antecipado deve ser considerado na folha de 2027 quando esse exercício for processado.
- **Ponto:** dias úteis e feriados nacionais explicitamente relacionados no executor; secretários municipais são dispensados da geração automática. Datas a partir da execução usam situação `Previsto`, sem batidas ou horas trabalhadas. Gozo de férias usa `Férias`, também sem batidas.
- **Portal:** comprovante anual por titular, de 01/01 a 31/12, sem filtro arbitrário de terceiro. A emissão usa somente demonstrativos reconhecidos pela política de publicação do Portal, além do histórico de abertura autorizado pela folha-âncora.
- Não há criação de usuários, remessa bancária ou upload em massa de PDFs. Documentos são gerados sob demanda.

## Regras de 2025

O exercício usa conjunto de regras separado: teto RGPS de R$ 8.157,41 e faixas de 7,5%, 9%, 12% e 14%. O histórico de janeiro a abril usa a tabela mensal IRRF anterior a maio/2025 e desconto simplificado de R$ 564,80; maio a dezembro usam a tabela vigente desde maio/2025 e R$ 607,20. A redução mensal criada para 2026 não é aplicada em 2025.

Fontes: [Receita Federal — tributação de 2025](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2025) e Portaria Interministerial MPS/MF nº 6/2025. Os demais parâmetros municipais permanecem os do pacote interno autorizado, sem alegação de homologação externa.

## Execução e conferência

- Executor retomável: `scripts/expand-rh-history-2025-2026.ts`; sem `--apply`, apenas informa o escopo previsto.
- Progresso da aplicação: `docs/RH_HISTORICO_EXPANSAO_2025_2026.json`.
- Conferência final somente leitura: `scripts/verify-rh-history-2025-2026.ts`; resultado **PASS** em `docs/RH_HISTORICO_VERIFICACAO_2025_2026.json`.
- Resultado confirmado: 19 execuções fechadas/publicadas, 3.414 demonstrativos, 198 comprovantes anuais com cobertura de doze meses.
- A conferência reconcilia cálculos/demonstrativos/projeção financeira, férias/folha mensal, abatimento da primeira parcela do 13º, rendimentos líquidos anuais e propriedade dos documentos. PDFs são extraídos em memória para conferir emitente e textos visíveis; nenhum PDF é arquivado pelo verificador.
- Armazenamento posterior: a conferência registra `pg_database_size` e tamanho físico das relações de pessoal. A análise anterior de capacidade permanece como evidência anterior à expansão; seu modelo mensal simples não inclui todas as folhas especiais adicionadas aqui.

## Validação disponível nesta etapa

- Dois testes do histórico de renda de 2025: **PASS**; abrangem mudança da tabela no decorrer do ano, teto previdenciário, não aplicação da redução de 2026 e rejeição de histórico inconsistente.
- Regressão PostgreSQL do serviço de RH: **PASS**; inclui segregação por titular/escopo, importação anual, competências duplicadas e revogação da origem duplicada.
- Sete verificações adicionais de rateio em centavos, contagem civil, impressão matricial, PDFs integrais, contracheques, relatórios cadastrais e margem consignável: **PASS**.
- Build de produção `sh_19cebc5fc001WSkUfjBB58O3LN`: **PASS**, exit 0, incluindo dezesseis partições de tipos e Next.js. Build final `sh_19cfdaffb001lEhAbv17Z4urZi`: **PASS**, exit 0; 473 segundos de verificação particionada e 99 segundos de Next.js, incluindo os ajustes finais de apresentação e do comprovante individual.
- Impressão digital das 594 versões originais registrada durante a expansão, com as folhas originais excluídas das escritas: `docs/RH_HISTORICO_BASELINE_ORIGINAL_2026.json`. A conferência final compara essa impressão digital; não se apresenta essa coleta intermediária como captura anterior ao início de toda a expansão.
- Conferência específica de rendimentos de 2025: **PASS**, em `docs/RH_RENDIMENTOS_2025_VERIFICACAO.json`: 198 titulares, doze competências por titular, líquido anual consolidado de R$ 9.393.915,38, propriedade do comprovante conferida e PDF individual de uma página com emitente municipal. Conferência somente leitura, sem upload.
- Na primeira execução, a folha de férias de dezembro/2026 foi bloqueada porque os aquisitivos das 30 programações legadas estavam registrados ao meio-dia, enquanto o ledger canônico usa a data civil à meia-noite. O executor foi corrigido para normalizar somente o horário dessas datas do pacote legado identificado, preservando dia civil, gozo, quantidade de dias e uma evidência interna com os instantes anteriores/posteriores. A validação canônica permanece integral. A retomada reutiliza os cálculos já fechados.
- Aplicação concluída pela retomada `sh_19d1683be0017MaZG4RicBlX6h`, exit 0. A conferência integral confirmou totais conciliados, 396 quitações de 13º com abatimento do adiantamento, 51.720 registros de ponto nos treze meses abrangidos e 7.626 registros futuros sem batidas/horas concluídas. As 594 versões anteriores conservaram a impressão digital registrada.
- Foram extraídos e conferidos cinco PDFs: mensal, adiantamento do 13º, quitação do 13º, férias e comprovante anual. O comprovante anual tem uma página; emitente e textos de apresentação passaram na conferência.
- Armazenamento medido após a expansão: banco completo **210.788.352 bytes (210,79 MB decimais)**; relações de pessoal incluídas na consulta **56.705.024 bytes (56,71 MB)**. Nenhum upload foi feito pelo executor ou pelos verificadores desta expansão.
- Validação visual autenticada indisponível nesta sessão: navegador desktop desconectado. Inspeção de código e extração de PDF não substituem aceite visual.
- Nenhuma migração adicional de banco foi criada para esta expansão. As mudanças de apresentação reutilizam componentes operacionais compartilhados, com paginação de vinte registros e preferências estáveis.
