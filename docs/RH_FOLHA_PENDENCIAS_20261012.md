# RH/Folha — pendências após revisão e integração de 12/10/2026

Referências: `RH_FOLHA_EXECUCAO.md`, `RH_FOLHA_PARAMETROS_ESTIMADOS_POC.md` e a matriz dos 114 requisitos Folha/20 eSocial. Situação: **F0–F9 parciais**. As funcionalidades demonstrativas ampliam a cobertura, mas não comprovam homologação integral da matriz.

## 1. Revisão e pull/integração

- Recebidos `0d8d69f` (Plan 4) e `ef2acec` (plan5), incluindo Planejamento/Orçamento, integração contábil/financeira, publicação, migrations e evidências.
- As atualizações remotas corrigem a consulta de servidores em Diárias e a consulta de regimes na página POC, conforme o schema real.
- Trabalho local preservado em stash de backup e reaplicado. Conflito único na página POC resolvido mantendo as contribuições das duas máquinas.
- Lote pós-integração: nove testes POC/transacionais aprovados; ESLint RH e verificação do diff aprovados. Outros 31 testes RH/documentais/de direitos/SST aprovados antes da integração. Build completo pós-integração em execução; consultar o registro de execução para seu resultado final.
- A continuação local ainda não foi commitada/enviada. O pull atualiza o código deste notebook; não implica deploy nem aplicação das migrations remotas em outro banco.
- `npx prisma migrate status` conferido: resta aplicar `20261011220000_planning_publication` no banco configurado. As duas migrations de Planejamento anteriores recebidas nesta atualização já estão aplicadas. Nenhuma migration RH nova é exigida por esta continuação.

## 2. O que já pode ser demonstrado

- Cadastro central, vínculos/revisões, cargos/quadro temporal, dependentes, campos configuráveis, movimentos/importação, reajustes e alterações coletivas.
- Motor Decimal, rubricas/fórmulas, bases, RGPS/teto por PF, IRRF mensal 2026/redução, deduções explícitas e memória de cálculo.
- Mensal, oito especiais demonstrativas, fechamento e publicação; parcela final/diferença de 13º vinculadas ao histórico e férias vinculadas às reservas.
- Rateio mensal civil demonstrativo por salário/jornada/lotação, com memória e resumos por trecho.
- Pensões fixas/percentuais, beneficiário, processo, vigência, tipos de folha, base/dedução fiscal e relatório.
- Férias com faixas de faltas POC, reservas/gozos conjuntos, licença-prêmio e ATS por calendário civil, averbação para ATS.
- Banco de horas, extras, FIFO, transferências, conversão e expiração explícita; provisões e baixa explícita ligada ao empenho.
- Diárias: solicitação calculada, autorização numerada, prestação/restituição declarada e três documentos.
- Desligamento ao fim da competência e reintegração demonstrativos com atos e revisões, preservando as folhas históricas.
- Recibos/relatórios PDF/XLSX/CSV, publicação no Portal, modelos de remessa/pagamento/informe anual e configurações/outbox de obrigações.

Banco demonstrativo preparado: três titulares fictícios, nove execuções de outubro e quatro adicionais de novembro/dezembro, **39 demonstrativos publicados**. Os cenários livres de outubro e os cenários vinculados posteriores são roteiros demonstrativos, não uma sequência integral de pagamentos reais devidos.

## 3. Desenvolvimento que ainda falta

| Área | Pendências reais de implementação | Dependência de dados externos |
|---|---|---|
| **Motor/temporalidade** | Transições de regime/previdência; critérios especiais de movimento/frequência intramês; ajustes de ATS intramês; integração temporal dos consumidores que ainda exigem competência integral. | Critérios municipais para homologar; modelos podem ser desenvolvidos agora. |
| **Tributação** | Compensação entre mensal/complementar/outros pagamentos no mês; retenção por data de pagamento; exterior e exceções; tratamento fiscal completo e separado de férias/13º/RRA/rescisão; restituições e diferenças negativas. | Enquadramentos/casos oficiais para aceite; cálculo-modelo pode avançar. |
| **Férias/licenças/ATS** | Perdas/prorrogações por afastamento; transições; automatizar médias nas especiais; integrar abono/pecúnia/pagamento; evitar remuneração duplicada entre férias e mensal; outros direitos/averbações; critérios do intervalo de reintegração. | Legislação consolidada para homologar as regras. |
| **Folhas especiais/rescisão** | Desligamento intramês; TRCT oficial; retroativos; indenizações/restituições; diferenças sucessivas; fechamento/reabertura compensatória e efeitos oficiais completos em produção. | Casos/modelos oficiais; grande parte do fluxo pode ser construída com estimativas. |
| **Benefícios/consignação/pensões** | Múltiplas linhas/calendários de VT; exceções de benefícios; pensões iniciadas/encerradas intramês; bases judiciais particulares; repasses; submargens por produto, renegociação, compensações e carência/liberação por banco. | Decisões/convênios reais e layouts para integração/homologação. |
| **Contabilidade/Financeiro** | Encadear folha→despesa→empenho→liquidação→pagamento→repasses; conciliar retenções e retorno bancário; automatizar provisões/baixas; razão patrimonial; integração financeira de diárias; produtividade. | Classificações/contas/convênios reais para produção. Planejamento recebido apoia a integração, mas não conclui a cadeia RH. |
| **Cadastro funcional** | Progressões, funções/designações, cessões, estágio, multivínculo temporal completo, anexos específicos e consultas/filtros integrais da matriz. | Documentos reais para preencher/homologar; modelos podem ser construídos. |
| **Portal/relatórios** | Informe fiscal oficial; classificação tributável/isenta/RRA/13º por pagamento real; jornadas restantes do Portal; acesso de titulares desligados conforme política; layouts municipais/específicos e impressão autenticada. | Modelos oficiais e definição de acesso, além da validação visual. |
| **eSocial nativo** | Mapeamento completo de eventos/populações; XML; XSD por versão; assinatura; cliente/worker; envio, consulta e processamento de retornos; retificação, exclusão, reabertura/fechamento e reconciliação. | CNPJ/EFR/estabelecimentos, certificado/procuração e ambiente para transmissão; XML/validação/worker podem ser desenvolvidos antes. |
| **Obrigações externas** | Exportadores próprios e validação dos layouts bancários, TCE-PR/SIM-AM, SIOPE e demais obrigações exigidas. Histórico/CSV configurável não equivalem a esses layouts. | Convênios, leiautes/versões e arquivos aceitos de exemplo. |
| **Homologação POC** | Percurso autenticado, permissões, impressão, casos ouro ampliados e evidências individuais dos 134 requisitos; conferência do ambiente final/deploy/migrations. | Acesso ao ambiente/navegador e critérios de aceite. |

## 4. Dados necessários para implantação, sem exigir base completa para a POC

1. Estatuto/leis consolidados, jornadas/divisores, direitos e efeitos de afastamentos.
2. Rubricas/incidências, enquadramentos previdenciários/eSocial, RAT/FAP/patronal e históricos salariais aplicáveis.
3. Assentamentos/saldos, dependentes, pensões e casos ouro com resultados conferidos.
4. Dotação/fonte/credor/contas contábeis e classificação das retenções/repasses.
5. Banco da folha, convênio, serviço, versão CNAB e exemplos de remessa/retorno.
6. Gestor/consignatárias, produtos/submargens, layouts e APIs.
7. Identificação institucional/eSocial, estabelecimentos/EFR, certificado/procuração e parâmetros de ambiente.
8. Layouts e amostras aceitas das obrigações específicas.

As estimativas atuais estão rastreadas no MD de parâmetros. Ausência desses dados não impede desenvolver modelos; impede tratá-los como parâmetros municipais homologados.

## 5. Ordem recomendada para continuar

1. Fechar a validação técnica/visual e registrar evidências do que já está implementado.
2. Completar tributação entre folhas/pagamentos e o ciclo oficial das especiais/direitos.
3. Integrar RH com Financeiro/Contabilidade até pagamento e repasses, aproveitando o Planejamento recém-integrado.
4. Implementar eSocial nativo e layouts externos específicos.
5. Completar as extensões cadastrais/benefícios e as jornadas restantes exigidas pela matriz.

RH/Folha já tem base demonstrativa substancial. A próxima frente de maior retorno é **RH integrado ao Financeiro/Contabilidade**, acompanhada da trilha eSocial. Não há fundamento para declarar o módulo concluído ou atribuir percentual homologado sem evidência por requisito.
