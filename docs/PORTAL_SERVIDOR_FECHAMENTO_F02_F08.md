# Fechamento de F02–F08 — plano de execução e aceite

Referência: `PORTAL_SERVIDOR_BACKLOG_EXECUCAO.md` e matriz PA-023–065. Data: 12/10/2026.

## Ordem de execução

1. Completar operações e documentos nas fontes existentes, mantendo compatibilidade dos pedidos anteriores.
2. Completar superfícies dos outros atores com autorização própria, sem usar identidade funcional para candidatos externos.
3. Consolidar relações/índices/migrations aditivos depois das implementações. Registros antigos são diagnosticados e preservados; nenhum protocolo ou vínculo histórico é fabricado.
4. Executar testes de domínio e autorização, lint e build completo. Cada fase só recebe aceite conforme evidência; build aprovado isoladamente não encerra requisito funcional.

## Pendências de desenvolvimento

| Fase | Trabalho necessário | Critério de fechamento |
|---|---|---|
| F02 | Relações pedido–serviço–processo, origem/finalidade, preservação de versão, complemento documental, comprovante, execução pendente e uploads sem consumo | Pedido/processo únicos, retry estável, rollback, titularidade dos anexos e histórico pessoal sem notas administrativas |
| F03 | Layouts municipais configuráveis, informe anual com pagamentos conciliados, contribuições com totalizadores e recibo específico de férias | Valores/fontes/versões rastreáveis, revogação efetiva e validação pública sem remuneração |
| F04 | Recorte histórico da jornada/direitos, totalizadores completos, ajustes/abonos com configuração e bloqueios da folha | Operação habilitada individualmente, ponto original preservado, efeito apenas após decisão autorizada |
| F05 | Declarações de vínculo/tempo/magistério, gozos efetivos, histórico ATS, atos/documentos e emissão da margem por banco/validade/bloqueio | Fontes temporais e averbações identificadas; não confundir inscrição, reserva, cálculo e pagamento |
| F06 | Propostas estruturadas de endereço/dependentes/empregos/documentos, conferência, pendências, reenvio e aplicação atômica | Diferenças conferíveis, conflito concorrente bloqueado, cadastro alterado só após decisão, identidade de login preservada |
| F07 | Comprovante de curso e publicação autorizada de resultados por ciclo/comissão, acompanhamento histórico e verificação CIPA | Certificado após reconhecimento, avaliador restrito à designação, resultado apenas após publicação RH |
| F08 | CAT própria com estado/comprovante, PPP completo na fonte, atestados departamentais, convenentes e concursos/PSS | Escopo por ator, fontes clínicas protegidas, candidato sem exigência de Employee e comprovantes próprios |

## Dependências municipais para operação

- Catálogo, destinatários, tipos/assuntos/roteiros e parâmetros de prazos/publicação.
- Modelos oficiais, autoridade/signatário e dados completos dos vínculos e ambientes de trabalho.
- Conciliação financeira efetiva por pessoa/demonstrativo para informe anual; cálculo fechado ou despesa agregada não comprova pagamento ao titular.
- Bancos/convenentes, regras FP-084, instrumentos de avaliação, comissões, janelas e critérios de capacitação.
- Editais, cargos/vagas, critérios e calendário reais de concursos/PSS.
- Pessoas/cadastros e contas reais para comprovação operacional do isolamento.

Essas dependências não substituem implementação. A falta de cadastro ou parâmetro deve produzir indisponibilidade específica no serviço, sem calcular regras presumidas.

## Evidências já disponíveis

- Logs Vercel de `PortalServidor2` e `ajuste portal`: sete erros TS em agenda e catálogo, com duas causas raiz corrigidas.
- Após a correção: `npm run build` completo aprovado (Prisma generate, Next typegen, TypeScript e Next build); lint direcionado aprovado. Esse resultado é anterior às novas mudanças de fechamento e deverá ser repetido ao final delas.

## Registro do fechamento

Manter aqui o código entregue, os comandos/resultados de verificação e os itens ainda abertos. Não marcar todas as fases concluídas a partir de telas ou publicações GED genéricas.

### Implementação e verificação deste lote

| Frente | Implementado |
|---|---|
| F02 | `HrPortalServiceConfiguration` liga regra funcional ao serviço comum e às origens processuais. `HrPortalRequestBinding` liga pedido, processo único, serviço, titular, ator e versão. Processo registra origem/finalidade. Pedido documental deferido fica com execução pendente até vincular documento válido, liberado para o próprio titular. |
| F05 | Relatórios de histórico ATS com apuração/averbações/estornos; licença-prêmio vinculada ao afastamento, com distinção entre programação, período em curso, período decorrido e situação da origem. Ficha inclui endereços, revisões integrais e empregos anteriores declarados/conferidos. |
| F06 | Endereços/dependentes/empregos anteriores/documentos por seções configuradas, upload pessoal GED, snapshot anterior, versões otimistas, aplicação atômica e devolução/reenvio com preservação da proposta anterior. Nome/CPF/nascimento do dependente precisam corresponder à pessoa canônica; declarações de emprego não geram averbação automática. |
| F07 | Comprovante próprio de inscrição em capacitação; resultado de avaliação publicado pelo RH após todos os pareceres, com disponibilização por data e PDF pessoal. Conclusão administrativa é fundamentada pelo RH, sem nota de corte/classificação presumida. Repetição de parecer não reabre avaliação publicada. |
| F08 | Comprovante CAT e marcos de tratamento sem opiniões clínicas; publicação de concursos/PSS, inscrição e comprovante do candidato sem Employee, análise RH por UG; convenentes com contratos/rubricas/fornecedor/folhas expressamente autorizados; recebimento departamental usando a rotina canônica SST e escopo atual/histórico do departamento. |

Rotas principais:

- `/rh/atividades-funcionais` e `/portal-servidor/avaliacoes` — publicação/consulta do resultado; `/api/portal-servidor/avaliacoes/[id]` — emissão própria.
- `/api/portal-servidor/capacitacao/[id]/comprovante` — comprovante da inscrição, distinto do certificado de conclusão.
- `/portal-servidor/recadastramento` e `/api/portal-servidor/recadastramento/anexos` — propostas, seções/documentos e correção; `/rh/solicitacoes` — conferência/aplicação/devolução, com escopo por UG.
- `/portal-servidor/sst/cat` e `/api/portal-servidor/sst/cat/[id]` — comunicação, marcos de andamento e comprovante próprios.
- `/portal/concursos`, `/rh/concursos`, `/api/portal/concursos/[id]/edital`, `/api/portal/concursos/inscricoes/[id]` — editais e inscrições pessoais.
- `/portal/convenentes` — reserva e lançamento das parcelas nas rotinas RH, sem consulta salarial coletiva.
- `/portal/departamentos/atestados` e `/api/portal/departamentos/atestados/[id]` — recebimento/comprovante sem parecer clínico no documento.

Parametrização adicional:

- Campanha `CAMPANHA_RECADASTRAMENTO`: `sections` (`ENDERECOS`, `DEPENDENTES`, `EMPREGOS_ANTERIORES`), `requireEvidence`, `evidenceDocumentClassCode`. Campos antigos continuam compatíveis. Alteração de contato não modifica credencial de login.
- Regra `EDITAL_RECRUTAMENTO`, administrada em `/rh/concursos`: UG, versão GED institucional, número/tipo, cargos/requisitos, janela e termo. Retificação de termos após inscrições exige novo código. Recebimento não é classificação/aprovação no certame.
- Regra PORTAL `DESCONTOS_CONVENENTES`: `budgetUnitId`, `actorUserIds`, `supplierId`, `contractIds`, `sourceRunId`, `consignmentRuleId`, `rubricCode`, `payrollIds`, `instructions`. A regra autoriza somente esse recorte e as rotinas canônicas revalidam margem/parcelas/vigência/folha.
- Atestados departamentais exigem SST/create, autorização clínica ocupacional, UG e departamento compatíveis. Não concedem autorização pericial ou RH ao recebedor.

Migration: `prisma/migrations-ibema/20261012220000_functional_portal_bindings_recruitment/migration.sql` (diretório ativo de `prisma.config.ts`). Tabelas novas e colunas opcionais; backfill apenas de referências existentes e unívocas; view `HrPortalReferenceDiagnostics` para inconsistências preservadas. Triggers impedem troca dos vínculos e edição da fonte/decisão encerrada da inscrição.

Verificações executadas:

- `npx prisma validate`: aprovado.
- Migration executada em PostgreSQL local PGlite: preservação dos registros legados, identidade/interessado dos vínculos, unicidade de CPF/conta/número de inscrição e imutabilidade de fonte/decisão comprovadas.
- Conjunto de 19 testes: 18 aprovados na primeira execução; fixture RH corrigida para disponibilizar a tabela de configuração da instância desde o início e o teste restante aprovado na reexecução. Inclui autenticação/rotas/Proxy, SST histórico, migration e fechamento funcional.
- ESLint direcionado de todos os arquivos alterados de aplicação/testes: aprovado.
- `npm run build`: aprovado com Prisma generate, Next typegen, TypeScript e Next build, incluindo as novas rotas.
- `git diff --check`: aprovado.

Migration preparada e testada localmente; não aplicada por esta execução ao banco de produção. Não houve commit/push/deploy desta rodada. Os testes locais não substituem a jornada com contas/cadastros reais.

### Pendências identificadas antes do fechamento final — histórico

1. F02: complemento documental completo, comprovante de protocolo, tratamento recorrente de uploads sem consumo e conferência do upgrade sobre os dados reais diagnosticados.
2. F03: fonte anual de pagamentos individuais conciliados para IRRF, layouts municipais configuráveis e recibo específico de férias com vínculo aquisitivo/gozo/cálculo. Publicar PDF GED existente não encerra a construção dessas fontes/layouts.
3. F04: totalizadores configuráveis e conciliação completa dos reflexos do ajuste de ponto no livro de banco de horas/folha; ampliar cenários concorrentes de marcação e ajuste.
4. F05: geração própria das declarações de vínculo/tempo/magistério, ato com arquivo autorizado e margem por banco com validade/bloqueio/liberação FP-084; fonte oficial do termo de rescisão. Expor revisões ou um PDF publicado não equivale a entregar esses serviços completos.
5. F06: gestão administrativa assistida das campanhas e bairros, saneamento de dependentes sem pessoa canônica e ampliação da evidência de conflito/rollback/reenvio sobre todas as seções.
6. F07: conferir concorrência de vagas e o percurso operacional CIPA; ampliar evidência por ciclo/comissão/resultado com contas reais.
7. F08: PPP oficial completo a partir dos responsáveis/fontes ambientais, assinatura e versão; aprimorar paginação/filtros e configuração assistida das novas superfícies; validar autorização/isolamento e operações com contas reais de cada ator.

O registro acima descreve o estágio anterior ao fechamento final a seguir; não deve ser utilizado isoladamente como estado atual da implementação.

## Fechamento final de desenvolvimento F02–F08

**Estado:** escopo de desenvolvimento das fases F02–F08 implementado e verificado localmente. A publicação do código, parametrização municipal e homologação com contas/dados reais são etapas operacionais distintas. A entrega não comprova integração no App, LDAP, push ou transmissão externa da F09.

| Fase | Complementos finais implementados | Caminhos principais |
|---|---|---|
| F02 | Complemento textual/documental com códigos exigidos pelo RH, titularidade e consumo único; comprovante do protocolo; rollback de upload sem GED; limpeza recorrente de uploads não utilizados com retenção configurada, proteção de documentos consumidos/assinados e retry do storage | `/portal-servidor/protocolos/[id]`, `/api/portal-servidor/protocolos/[id]/comprovante`, `/api/portal-servidor/manutencao/anexos` |
| F03 | Modelos municipais validados, informe anual por pagamentos individuais conciliados na origem nativa, grupos fiscais por rubrica/tipo de folha, totais anuais de contribuições/salários de contribuição e recibo de férias com aquisitivo/gozo/cálculo de origem | `/portal-servidor/documentos-funcionais`, `/rh/portal-funcional`, `/portal-servidor/relatorios` |
| F04 | Totalizadores de ponto configuráveis e integrais; conciliação transacional de horas extras e banco no ajuste, com compensações, preservação das fontes originais, limites e saldos cronológicos; versões de integração impedem repostagem/stale update; competências fechadas exigem tratamento formal RH/Folha | `attendance-reconciliation.ts`, `attendance-totals.ts`, requerimentos e relatórios pessoais |
| F05 | Geração das declarações de vínculo/tempo/magistério a partir de revisões/história funcional/averbações e exclusões configuradas; bloqueio de lacunas; termo de rescisão vinculado a cálculo e encerramento efetivo; arquivo autorizado dos atos; margem por banco com referência, reservas, validade e liberação RH FP-084 | `/portal-servidor/documentos-funcionais`, `/api/portal-servidor/atos/[id]`, `/rh/portal-funcional` |
| F06 | Configuração assistida de campanhas, seleção do público/campos/seções/classes GED; conferência, saneamento de pessoa física do dependente com autorização de Cadastro Único e comprovação, devolução/reenvio e aplicação atômica; listagem administrativa limitada às unidades autorizadas | `/rh/recadastramento/configurar`, `/rh/solicitacoes`, `/portal-servidor/recadastramento` |
| F07 | Fluxo de cursos/inscrições/comprovantes/conclusão/certificados e resultados de avaliações; teste PostgreSQL da disputa da última vaga e do retry; jornada CIPA validada pelos testes de titularidade, janela, participação única, sigilo e rollback | `/rh/atividades-funcionais`, `/portal-servidor/capacitacao`, `/portal-servidor/avaliacoes`, `/portal-servidor/sst/cipa` |
| F08 | PPP completo na geração: história RH/LTCAT sem lacunas, CBO/atividades/agentes/medições vinculados a fonte técnica assinada, versão ambiental reconhecida, cobertura de responsabilidade técnica e assinatura GED obrigatória na emissão; novas superfícies CAT, agenda, departamentos, convenentes e concursos/PSS; gestão de emissões com filtro/paginação | `/sst/ppp`, `/portal-servidor/documentos-funcionais`, `/rh/portal-funcional`, superfícies específicas do lote anterior |

### Documento de origem, assinatura e autenticidade

- Geração cria documento/versão GED privados, hash do arquivo, modelo congelado, referências de origem e chave de autenticidade. Modelo que exige assinatura não é disponibilizado enquanto o GED não concluir a assinatura real.
- O estado documental `Assinado` do fluxo GED é aceito junto a `Válido` quando a versão assinada corresponde à fonte; nenhum status de assinatura é fabricado pelo Portal.
- Download pessoal revalida o titular ativo, versão e fontes; validação pública em `/validar-emissao/[code]` contém somente tipo, data, hash e estado de assinatura. O manifesto de origem verifica demonstrativos, comprovantes, pagamentos, períodos, versões ambientais, responsabilidades e reservas de margem sem divulgar dados pessoais/remuneração.
- Revogação, validade da margem e fontes canceladas/substituídas impedem a validação/disponibilização da emissão correspondente.
- A contagem de serviço usa dias distintos dos períodos canônicos, exclui afastamentos conforme política expressa e inclui apenas averbações reconhecidas nos escopos configurados. Não há criação automática de direito a partir de emprego anterior declarado.

### Parametrização e operação municipal

1. **Modelos:** em `/rh/portal-funcional`, cadastrar regra PORTAL de origem `MODELO_DOCUMENTO_FUNCIONAL`, com UG, tipos documentais, emitente/CNPJ, título/texto/rodapé/fundamento, classe GED e signatários. Marcadores permitidos são validados; fonte obrigatória ausente impede documento incompleto.
2. **Informe anual:** configurar `annualGroups` com `code`, `label`, `rubricCodes` e `payrollTypes`. Cada rubrica de provento/desconto deve pertencer a exatamente um grupo no tipo de folha. RH/Financeiro concluem a alocação individual de pagamentos nativos confirmados, com comprovante GED e referência. A soma por demonstrativo deve ser exatamente o líquido; a soma por ordem não pode exceder o pago. Encargos patronais não podem ser usados como remuneração individual.
3. **Férias/rescisão:** disponibilizar cálculo oficial fechado de produção e fontes RH correspondentes. Fonte especial marcada como estimada exige conferência definitiva RH, respaldada por documento de cálculo assinado da pessoa, antes da emissão definitiva. A conferência não altera valores nem presume pagamento.
4. **Margem:** informar `supplierIds`, `validityDays` e `blockMarginUntilRelease` no modelo, mantendo política nativa de consignação/bancos vigente. A nova emissão pode permanecer bloqueada até a operação `LIBERAR_MARGEM` fundamentada pelo RH.
5. **Jornada:** configurar regra `TOTALIZADORES_PONTO_FUNCIONAL`, com UG/público e totais por campo/status. A marcação mantém habilitação individual na regra `REGISTRO_PONTO_FUNCIONAL` existente. O ajuste conciliado não altera folha já fechada silenciosamente.
6. **Campanhas:** usar `/rh/recadastramento/configurar` para público, campos, seções, janela e comprovação; saneamento de novo dependente exige RH e permissão de inclusão no Cadastro Único, sem trocar identidade existente divergente.
7. **PPP:** o responsável SST utiliza `/sst/ppp` para carregar os IDs reais dos períodos/riscos e reconhecer a fonte técnica assinada. Informar NIT/CNAE/endereço, CBO/atividades por período e agentes/medições/EPC/EPI/CA por risco. O novo reconhecimento substitui o anterior do mesmo titular/UG/intervalo. O modelo PPP exige signatários e `requireSignature: true`.
8. **Uploads:** administrador da instância define `PORTAL_UNUSED_UPLOAD_RETENTION_HOURS`. A rotina diária já está declarada em `vercel.json`, com autenticação `CRON_SECRET` e ator técnico ativo em `NOTIFICATION_SYSTEM_ACTOR_USER_ID`. Sem parâmetro de retenção, não há descarte por prazo presumido.

Esses dados e decisões são fornecidos/configurados pelo município nas telas implementadas. Serviço sem a configuração/fonte exigida apresenta indisponibilidade específica; o Portal não inventa valores, regras ou assinatura.

### Verificação final executada

- **34 testes aprovados, zero falhas**, abrangendo modelos/fontes, dias históricos e totalizadores integrais, conciliação PostgreSQL/rollback e versões de ponto, disputa da última vaga/retry em cursos, autenticação, rotas/Proxy, relações/migration, RH/Folha, SST histórico, agenda e CIPA.
- ESLint de todos os arquivos do lote: aprovado.
- `npm run build` completo após as correções: aprovado — Prisma generate, Next typegen, TypeScript e compilação Next.js, incluindo as novas rotas.
- Não foi necessária nova alteração de schema/migration neste último lote: os vínculos estruturais são os da migration aditiva anterior; fontes, confirmações e artefatos usam os registros canônicos RH/Folha/GED/SST existentes.
- Nenhum commit/push/deploy realizado por esta execução. A homologação do ambiente publicado e os percursos com contas reais não são apresentados como testes locais realizados.
