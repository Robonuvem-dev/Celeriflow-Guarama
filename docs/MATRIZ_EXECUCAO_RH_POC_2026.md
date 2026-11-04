# Matriz de execução dos 74 itens — RH/Folha/Portal

**Referência:** 02/11/2026. Plano: `PLANO_AJUSTES_RH_FOLHA_PORTAL_POC_2026.md`. Evidência executada: `RH_POC_RELATORIOS_VERIFICACAO_2026.json`. A matriz é de **execução técnica**, não de aprovação integral da POC.

- **Local:** código implementado no workspace, ainda sem deploy RH.
- **Serviço/CSV:** consulta executada e exportação CSV integral gerada; inclui o retorno vazio como comportamento válido, mas não como cobertura do cenário positivo.
- **Dados:** registros retornados no recorte do verificador, não quantidade de servidores em todos os casos. Totais não aditivos são identificados no relatório.
- **Visual:** todos os 74 **pendentes**, navegador desktop desconectado. Amostras PDF/XLSX foram geradas por serviço, sem equivaler à inspeção visual de todas as modalidades.
- **Integração externa:** **não exercida** nesta entrega; itens bancários/fiscais/previdenciários/contábeis dependem das configurações e ambientes indicados no plano.
- **Homologação:** todos os 74 **pendentes**. Nenhuma limitação listada abaixo é convertida em aceite pela aprovação do executor.

| ID | Implementação local / limite de aceite | Serviço + CSV | Dados retornados |
| --- | --- | --- | ---: |
| 1 | Retorno civil de férias; ajuste à escala/feriado pendente | PASS | 30 |
| 2 | Término do vínculo comissionado; ato completo pendente | PASS — vazio | 0 |
| 3 | Término contratual; cenário positivo de vencimento pendente | PASS — vazio | 0 |
| 4 | Treinamento por curso, participantes e conclusão | PASS | 18 |
| 5 | Histórico de treinamento por servidor | PASS | 18 |
| 6 | Memória ATS canônica; regra municipal requer homologação | PASS | 594 |
| 7 | Aniversariantes; cenário com aniversários no mês não exercido | PASS — vazio | 0 |
| 8 | União de dias afastados por causa; cenário positivo pendente | PASS — vazio | 0 |
| 9 | Previsão VT por calendário/tarifa/adesão | PASS | 24 |
| 10 | Conferência de previsto/aquisição/concessão/consumo/desconto | PASS | 24 |
| 11 | Ocupação e consulta ao quadro legal; dados legais ausentes explicitados | PASS | 42 |
| 12 | Catálogo central de agências; não há agência cadastrada no recorte | PASS — vazio | 0 |
| 13 | Causas utilizadas; catálogo/efeitos completos pendentes | PASS — vazio | 0 |
| 14 | Cargo/regime/natureza na referência; completar classificação oficial | PASS | 198 |
| 15 | Mensagens por vigência e destinatários | PASS | 1 |
| 16 | Rubricas, método/fórmula e incidências | PASS | 16 |
| 17 | Salários contratuais na referência; escala legal completa pendente | PASS | 198 |
| 18 | Margem consignável compartilhada por pessoa | PASS | 198 |
| 19 | Catálogo central de bancos | PASS | 2 |
| 20 | Consulta mapeamento cargo/CBO; parametrização do quadro pendente | PASS | 42 |
| 21 | Cursos/instituições/modalidades de graduação | PASS | 3 |
| 22 | Treinamentos ordenados pelo cargo histórico da inscrição | PASS | 18 |
| 23 | Escala/faixa/intervalo/jornada/divisor; turnos especiais parametrizáveis | PASS | 198 |
| 24 | Índices e moedas por fonte/data | PASS | 3 |
| 25 | Catálogo de desligamento; utilização estruturada pendente | PASS | 3 |
| 26 | Parâmetros e faixas previdenciárias do pacote | PASS | 4 |
| 27 | Etiquetas por mês; cenário positivo do mês pendente | PASS — vazio | 0 |
| 28 | Etiquetas configuráveis de servidores | PASS | 198 |
| 29 | Etiquetas configuráveis do cartão de ponto | PASS | 198 |
| 30 | Cartão monoespaçado; TXT com 132 bytes por linha | PASS + TXT | 198 |
| 31 | Evolução global por competência/tipo/escopo | PASS | 3 |
| 32 | Evolução por pessoa; casos especiais de rateio temporal pendentes | PASS | 594 |
| 33 | Evolução por unidade histórica/local; casos temporais pendentes | PASS | 72 |
| 34 | Projeção demonstrativa explicada; regras oficiais pendentes | PASS | 198 |
| 35 | Informe por ano de pagamento; nenhum pagamento registrado pela carga | PASS — vazio | 0 |
| 36 | Ficha resumida por verba, pessoa e período | PASS | 3564 |
| 37 | Relação de assinatura; identidade/modelo institucional pendente | PASS | 198 |
| 38 | Frequência dos dias registrados; mapa de lacunas por escala pendente | PASS | 198 |
| 39 | Ponto de entrada/saída; não há quatro batidas registradas | PASS | 12474 |
| 40 | Histórico integrado das origens disponíveis; cessões estruturadas pendentes | PASS | 1062 |
| 41 | Admissões/revisões/atos; origem/destino/ônus de cessões pendentes | PASS | 414 |
| 42 | Cadastro resumido por pessoa, vínculos preservados | PASS | 198 |
| 43 | Dotação explícita/vigente; legado sem data não retroage | PASS | 198 |
| 44 | Cadastro geral por pessoa, incluindo ausência de contrato | PASS | 198 |
| 45 | Cadastro por local histórico | PASS | 198 |
| 46 | Cadastro por lotação histórica | PASS | 198 |
| 47 | Experiência declarada/reconhecida/revogada com fonte/período | PASS | 6 |
| 48 | Atos/ocorrências e cancelamentos preservados | PASS | 18 |
| 49 | Movimentos/cronogramas/credor/parcela/reserva; baixa externa pendente | PASS | 654 |
| 50 | Mesmo motor ATS do item 6, execução separada | PASS | 594 |
| 51 | Pensão alimentícia calculada; cenário positivo pendente | PASS — vazio | 0 |
| 52 | Direito/cota/beneficiário de vitalícia; fluxo legal completo pendente | PASS | 1 |
| 53 | Efetivo/comissionado simultâneo; cenário positivo e opção pendentes | PASS — vazio | 0 |
| 54 | Contratos/salário estimado/divisor/jornada e origem | PASS | 198 |
| 55 | Contas de crédito fictícias vigentes por convênio | PASS | 198 |
| 56 | Contas de débito fictícias com autorização declarada | PASS | 4 |
| 57 | Cursos complementares com conclusão/certificado | PASS | 18 |
| 58 | Graduação individual com evidência/situação/período | PASS | 18 |
| 59 | Dependentes e flags cadastrais; elegibilidade temporal pendente | PASS | 8 |
| 60 | Modelo de ordem interna; envio/numeração bancária pendentes | PASS | 594 |
| 61 | Folha de crédito por convênio e subtotais; leiaute/retorno pendentes | PASS | 597 |
| 62 | Análise consignável parametrizada, execução própria do ID | PASS | 198 |
| 63 | Revisões/atos de pessoal; tipificação completa pendente | PASS | 414 |
| 64 | Conferência específica; importador existente com prévia/idempotência | PASS | 654 |
| 65 | Sintético lotação, rateio demonstrativo | PASS + conciliação | 897 |
| 66 | Analítico dotação, rateio demonstrativo | PASS + conciliação | 13662 |
| 67 | Dotação/fonte, mesma origem apropriada | PASS + conciliação | 621 |
| 68 | Dotação/fonte/natureza, mesma origem apropriada | PASS + conciliação | 621 |
| 69 | Fonte, mesma origem apropriada | PASS + conciliação | 621 |
| 70 | Analítico lotação, rateio demonstrativo | PASS + conciliação | 13662 |
| 71 | Dotação/local histórico, mesma origem apropriada | PASS + conciliação | 897 |
| 72 | Lotação/dotação, mesma origem apropriada | PASS + conciliação | 897 |
| 73 | União de contratos/certidões; efeitos oficiais de interrupções pendentes | PASS | 198 |
| 74 | Ocupação versus demanda fictícia explicitada; quadro oficial pendente | PASS | 42 |

Nos itens 65–72 foram conferidos os quatro totais (bruto/descontos/líquido/encargos) contra os demonstrativos originais e o escopo negado. **Congelamento/classificação contábil oficial e integração externa seguem pendentes** em todas essas visões.

## Evidências transversais

- `RH_PORTAL_VERIFICACAO_2026.json`: 198 titulares × três meses, publicação, conciliação, PDFs e isolamento por titular — PASS por serviço.
- `RH_POC_RELATORIOS_VERIFICACAO_2026.json`: 74 IDs, filtros cadastrais/históricos, conciliação das oito visões e amostras PDF/XLSX — PASS.
- `tests/hr-print-layouts.test.ts` e `tests/hr-poc-report-primitives.test.ts`: cinco testes aprovados.
- Regressões `personnel-cadastral-reports`, `personnel-reference-records`, `hr-documentary-reports`, `hr-workforce-service` e `employee-portal-final-services`: 13 testes aprovados ao final, incluindo a reexecução completa do ciclo RH e cenários positivos de cancelamento/parcelas.
- Registros de população salarial, cenários, escalas e migração listados em `EXECUCAO_AJUSTES_RH_FOLHA_PORTAL_2026.md`.
