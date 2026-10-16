# SST — rastreabilidade dos 74 requisitos

## Referência e critérios

Conferência de código/documentação: 11/10/2026, base `7f28090 — sst4`, hardening publicado em `76728e5 — sst5` e integração `f78c851 — rh1`. Fonte contratual e texto integral: `PLANO_IMPLEMENTACAO_SST.md`, checklist PDF páginas 86–96; especificações 1.732–1.805. Pacote de providências/modelos para retomada: `SST_PENDENCIAS_E_RETOMADA.md`.

Esta matriz identifica **onde demonstrar** cada requisito e o que falta verificar. Não é ata de aceite. Nenhum item recebe aqui status de homologado; não há contagem 74/74 ou mínimo de 67 atingido. Os testes de serviço/PGlite não substituem execução com usuários, dados, documentos e integrações reais.

Estados:

- **D**: rotina identificada no código, demonstração/aceite pendente.
- **C**: rotina identificada, depende também de configuração ou fonte operacional canônica.
- **P**: entrega parcial/preparatória com lacuna de implementação ou integração.
- **B**: capacidade requerida bloqueada/indisponível.

Todas as linhas exigem validar escopo entidade/UG, operação, persistência e saída quando pertinente. Relatórios clínicos exigem autorização adicional; dados clínicos não devem aparecer nos logs gerais. Uma linha D não comprova todos os detalhes do texto integral.

## Índice de artefatos

Os serviços abaixo estão em `src/lib/sst/`; os testes estão em `tests/` e as rotas administrativas em `src/app/app-domain/sst/`.

| Ref. | Rotas e serviços | Testes de referência |
|---|---|---|
| A | `/sst/atestados`, `/sst/configuracoes`, `/sst/juntas`; `certificate-service.ts`, `functional-certificate-service.ts`, `functional-leave-posting.ts` | `sst-certificates`, `sst-functional-certificates`, `sst-functional-leave-posting` |
| R | `/sst/jornadas`, `/sst/relatorios`, `/sst/vinculos`; `report-service.ts`, `functional-service.ts`, `functional-report-export.ts` | `sst-report`, `sst-functional-report`, `sst-functional-history` |
| G | `/sst/agenda`; `agenda-service.ts` | `sst-agenda` |
| E | `/sst/ghe`, `/sst/programas`, `/sst/ordens-servico`; `program-service.ts`, `service-order-service.ts`, `exposure-policy.ts` | `sst-exposure`, `sst-programs`, `sst-functional-history` |
| O | `/sst/aso`, `/sst/questionarios`; `aso-service.ts`, `aso-flow-registration.ts`, `aso-flow-service.ts`, `aso-flow-document.ts`, `questionnaire-service.ts` | `sst-aso`, `sst-aso-flow`, `sst-questionnaires` |
| K | `/sst/profissionais`, `/sst/prontuarios`, `/sst/vacinacao`; `clinical-access.ts`, `clinical-service.ts` | `sst-clinical-services` |
| Q | `/sst/equipamentos`; `equipment-service.ts`, `equipment-queries.ts`; serviço canônico `src/lib/patrimonio/stock-service.ts` | `sst-equipment` |
| T | `/sst/acidentes`, `/sst/restricoes`; `accident-service.ts`, `accident-layout-service.ts`, `accident-layout-pdf.ts`, `restriction-service.ts`, `restriction-cron-service.ts` | `sst-accidents`, `sst-accidents-layout` |
| V | `/sst/prevencao`; `prevention-service.ts`, `prevention-fields.ts` | `sst-prevention` |
| H | `/sst/planos`, `/rh/folha`; `benefit-service.ts`, `benefit-query.ts`, `benefit-posting.ts`, `benefit-fiscal.ts`, `functional-payroll-origin.ts` | `sst-benefits`, `sst-benefits-service`, `sst-benefits-posting`, `sst-functional-payroll-origin` |
| I | `/sst/integracoes`, `/sst/consolidado`; `esocial-source.ts`, `esocial-service.ts`, `esocial-contract.ts`, `closure-service.ts`, `closure-document.ts` | `sst-integrations`, `sst-integrations-state`, `sst-integrations-closure` |
| P | `/portal-servidor/sst/cat`, `/portal-servidor/sst/cipa`, `/portal-servidor/sst/planos`, `/portal-servidor/sst/relatorios` | Testes dos respectivos domínios T/V/H/I |

Os nomes de testes da tabela recebem sufixo `.test.ts`. Consultar também a migração aditiva `20261011120000_harden_sst_clinical_integrity`, ainda pendente no banco operacional; os testes clínicos e de upgrade a exercitam em banco isolado.

## Matriz de demonstração

| Item | Ref. | Estado | Evidência a coletar / condição específica |
|---|---|---|---|
| 1 | A | D | Atestado completo, múltiplos CIDs do catálogo oficial, dependente e anexos GED protegidos. |
| 2 | A | D | Comprovante e impressão automática conforme parâmetro, sem diagnóstico administrativo. |
| 3 | A/H | C | Perícia, Leave vinculado e postagem real por regra monetária RH aprovada; retry e compensação. |
| 4 | A/R | D | Relatório com todos os filtros funcionais, profissionais e CID; CSV/PDF autorizados. |
| 5 | R | C | Dias, frequência CID, idade e custo; conferir fonte e metodologia da estimativa. |
| 6 | A | D | Protocolo/entrega automáticos e manuais; reenvio idêntico e conflito. |
| 7 | R | C | Jornada variável, união/interseção de minutos, competências e denominador; custo opcional. |
| 8 | A | D | Cadastro abre confirmação imediata conforme parâmetro e mantém vínculo com afastamento. |
| 9 | A/R | C | Motivo bloqueia regime/cargo usando período funcional canônico vigente. |
| 10 | A | D | Dependente habilitado, desabilitado, obrigatório e opcional. |
| 11 | A | D | Junta com membros, conselho e vigência; perito fora do período bloqueado. |
| 12 | G | D | Disponibilidade/bloqueios por profissional/unidade; reserva concorrente e conflitos. |
| 13 | G | D | Comprovante com profissional, unidade, servidor, data e hora. |
| 14 | V | D | Mandato CIPA, membros, funções e atas relacionadas. |
| 15 | V | D | Plano CIPA com ação, objetivo, local, estratégia, período e responsáveis. |
| 16 | V | D | Inspeção datada, autoria e formulário personalizado. |
| 17 | V | D | Participantes da comissão, adiamento justificado, nova data, ata e presenças. |
| 18 | V | D | Calendário anual CIPA com reuniões e alterações. |
| 19 | V | D | SIPAT, organizadores, atividades, locais/horários, custos e programação impressa. |
| 20 | V/P | D | Comissão/candidatos, voto único, participação e apuração; validar sigilo da urna. |
| 21 | O | D | Exame toxicológico com laboratório canônico, número, data, profissional e laudo. |
| 22 | E/R | C | GHE por local/cargo/função e vigência, sem associação manual individual. |
| 23 | E | D | Consulta com e sem GHE; filtros e contagem no escopo autorizado. |
| 24 | E | D | Ordem individual/coletiva com riscos, equipamentos, treinamento e condutas. |
| 25 | Q | D | Material canônico, CA, validade e intervalo de revisão. |
| 26 | Q | D | Entrega/baixa individual e coletiva, recibos e quantidades. |
| 27 | Q | B | Leitor/SDK indisponíveis; implementar e demonstrar biometria real. |
| 28 | Q | C | Almoxarifado contratado, parâmetro, saída real, saldo/lote/inventário e rollback. |
| 29 | Q | D | Revisão com responsável, observações e próxima data. |
| 30 | Q | D | Tempo/média de uso por servidor/cargo/centro/local/GHE; entrega/baixa/quantidade. |
| 31 | E | C | Responsável ambiental/biológico canônico, tipo, fonte e vigência. |
| 32 | E | D | LTCAT estruturado/versionado por GHE com todos os campos e EPI aplicáveis. |
| 33 | E | D | PGR, avaliação de riscos/perigos/danos e matriz informada. |
| 34 | E/Q | D | Necessidade PGR por GHE/servidor, opção de incluir entregas. |
| 35 | E/O | D | PCMSO completo e protocolos por GHE/tipo; preservação de versões. |
| 36 | K/O | D | Questionários por atuação em branco/preenchidos, versões e grants específicos. |
| 37 | O | D | ASO/exames/resultados/datas/validade, impressão em branco/preenchida e GED. |
| 38 | O | D | Anamnese personalizada pré-emissão; histórico/revisões preservados. |
| 39 | O | D | Demonstrar os sete tipos e validar correspondência dos protocolos PCMSO. |
| 40 | O | D | Cinco conclusões; detalhes obrigatórios das condicionais. |
| 41 | O/I | P | Preparação S-2220 rastreável; adaptador real e recibos oficiais pendentes. |
| 42 | O/G | C | Parâmetro da conclusão sugere disponibilidade real; confirmar nova reserva. |
| 43 | O | D | Candidato Person sem Employee artificial; referência do concurso/processo é textual. |
| 44 | O/R | C | Retorno apto, parâmetro e fonte RH do segundo período aquisitivo/concessivo. |
| 45 | O | D | Consulta por intervalo de vencimento e paginação persistente. |
| 46 | T | D | CAT com agente, partes, situação, depoimentos, testemunhas e valores Decimal. |
| 47 | T/P | D | Comunicação no portal deriva Employee autenticado e recusa identidade alheia. |
| 48 | T | D | Investigação revisada, parecer técnico/médico separados, homologação da revisão atual. |
| 49 | T | D | Conferir todos os campos pessoais, ambientais e circunstanciais da investigação. |
| 50 | T | D | Relatório conjunto de CAT e investigação autorizada. |
| 51 | T/I | P | PDF oficial INSS preenchido e suplemento; registro oficial depende do recibo produção. |
| 52 | T/I | P | Preparação S-2210 da versão exata; envio/retorno oficial pendentes. |
| 53 | T | D | Atendimento ligado à CAT/investigação com profissional, lesão, CIDs e diagnóstico. |
| 54 | T | D | Incidente, testemunhas, local/data/hora, descrição e causas. |
| 55 | R/E/I/P | P | PPP preparatório com histórico funcional/LTCAT/CAT; validar fonte e emissão final aplicável. |
| 56 | T | D | Restrição, profissional/CIDs, grau/período e acompanhamentos datados. |
| 57 | T/R | C | Restrições vinculadas às atribuições canônicas do cargo e liberação por atribuição. |
| 58 | T | C | Configurar cron/ator/grants/Resend; registrar recibo real, retries e reconciliação. |
| 59 | V | D | Visita técnica, tipo, responsável e detalhes. |
| 60 | V | D | Brigada/pavimentos, treinamento/exames, plano e reuniões. |
| 61 | V | D | Extintor, responsável, fornecedor, localização, instalação e validade. |
| 62 | V | D | Recarga/teste hidrostático, datas/validade, empresa e responsável técnico. |
| 63 | K | D | Solicitações/encaminhamentos/exames e prescrição Medicina com medicamento canônico. |
| 64 | I/K | D | Consolidado PDF por fonte; grants por disciplina antes da consulta/contagem. |
| 65 | H | C | ANS/operadora, rubricas canônicas e postagem mensal/extraordinária em Folha. |
| 66 | H/P | D | Adesão, carteiras, titular/dependentes/vigências, despesas e devoluções individualizadas. |
| 67 | H/I | B | Saída fiscal oficial não implementada; exige pagamentos, conciliação e adaptador aplicável. |
| 68 | H | D | Demonstrativo por servidor/período, titular/dependentes e devoluções. |
| 69 | V | D | Ergonomia coletiva/individual, fatores ambientais, equipamentos, recomendações e anexos. |
| 70 | V/K | D | PCA e audiometria protegidos; verificar resultados e autoria. |
| 71 | K | P | Comprovante externo de vacinação ocupacional; aplicação/importação assistencial não implementadas. |
| 72 | K | D | Prontuário Medicina, autoria/vigência, parecer, CIDs, exames e diagnóstico. |
| 73 | K | D | Laudo baseado no prontuário, template institucional e emissão autorizada. |
| 74 | K | D | Psicologia/Assistência Social: pareceres/encaminhamentos e isolamento por atuação. |

## Registro de execução da POC

Para cada item, registrar: commit e versão da migração; data; perfil/usuário de teste; entidade/UG; IDs dos dados; passos e resultado esperado/observado; arquivo emitido/hash quando aplicável; evidência de bloqueio e reexecução; responsável pelo aceite. Guardar evidência clínica em local autorizado, não anexar dados pessoais ao repositório.

Roteiro transversal obrigatório: base com mais de 40 registros, 20 por página, filtros/ordenação estáveis; nomes longos e viewports 1366/1440/1920 e estreito; ausência de rolagem interna da tabela; negativa de acesso cruzado, downloads e exportações; concorrência de agenda/estoque/folha/voto; impressão multipágina; GED privado operacional.

O arquivo `20261011030000_hr_workforce_foundation` chegou em `rh1`, mas seu checksum diverge do registrado no banco. A conferência read-only `npx tsx scripts/verify-sst-migration-history.ts --all` encontrou 57 migrações aplicadas, essa única divergência e nenhum arquivo ausente. O modo SST conferiu 18 sem divergências. Recuperar a versão original e reconciliar o histórico antes do deploy do hardening SST; não alterar o checksum para mascarar diferenças. A suíte integrada após `rh1` passou com 142 testes e o build completo passou. Isso não equivale à homologação operacional nem verifica drift de schema.

**Atualização de 11/10/2026 após `17ff495`:** o diagnóstico do notebook RH comprovou finais mistos LF/CRLF, sem mudança de SQL. Os bytes originais das três migrations RH foram restaurados e protegidos em `.gitattributes`; os três previews verificaram o checksum exato. A conferência completa passou com 59 migrations, nenhuma divergência e nenhum arquivo ausente. O hardening SST continua pendente; a correção não reaplicou SQL nem alterou o histórico do banco. Ver `RH_MIGRATION_FOUNDATION_CORRECAO_CHECKSUM.md`.
