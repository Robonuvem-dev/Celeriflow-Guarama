# Entrega interna — Ação Social e preparação da POC

> Registro da etapa anterior. A evolução dos modelos municipais, SMS, importação e fechamento mensal está documentada em [OPERACAO_MUNICIPAL_ASSISTENCIA_SOCIAL.md](OPERACAO_MUNICIPAL_ASSISTENCIA_SOCIAL.md).

**Data:** 01/11/2026. **Plano:** [PLANO_DESENVOLVIMENTO_ACAO_SOCIAL_POC.md](PLANO_DESENVOLVIMENTO_ACAO_SOCIAL_POC.md).

## Resultado

Implementadas as etapas internas de cadastros, famílias canônicas, benefícios, encaminhamentos, acompanhamento, visitas, condicionalidades, formulários versionados, SCFV, complementos da Frota, dashboard, relatórios, anexos privados e importação cadastral local.

O código foi compilado em build de produção e exercitado com o banco configurado no `.env.local`. As três migrações foram aplicadas pela autoridade SQL do projeto. A carga sintética e seus complementos foram aplicados nesse banco, preservando os registros anteriores. As mudanças de código permanecem na árvore de trabalho, sem commit/publicação nesta entrega.

**A entrega não declara os 35 itens oficialmente homologados:** permanecem pendentes os itens 16, 23, 33 e 35 na parte dependente de referência oficial, provedor externo ou adequação final. Regras municipais continuam identificadas como parâmetros de demonstração até sua confirmação.

## 1. Matriz atualizada e roteiro dos 35 itens

**Funcional** nesta matriz significa operação disponível para a POC interna com os dados e regras de demonstração. A cobertura executada está discriminada na seção de validação; não significa que todos os campos e perfis de cada item tenham sido homologados por navegador.

| Item | Classificação | Roteiro / entrega |
|---|---|---|
| 1 | Funcional | `/social`: selecionar período e unidade, consultar atendimentos, eventos SCFV realizados, encaminhamentos e entregas. |
| 2 | Funcional | Links PDF/CSV/XLSX do painel; consultar a composição em `/social/relatorios`. |
| 3 | Funcional | `/social/gestao/unidades`: identificação, razão social, CNPJ, IE/isenção, tipo, número, responsável, telefone e endereço. |
| 4 | Funcional | Cadastro compartilhado de cargos/funções em Administração e seleção no vínculo profissional Social. |
| 5 | Funcional | `/social/gestao/profissionais`: servidor/pessoa canônica, cargo, registro/conselho, período e escopo de acesso por unidade. Dados pessoais permanecem na pessoa física de origem e documentos podem ser vinculados pelo GED. |
| 6 | Funcional | `/social/gestao/beneficiarios`: ficha pessoal completa; programas e histórico em `/social/gestao/participacoes`. |
| 7 | Funcional | `/social/gestao/familias` e `/social/gestao/membros`: composição central integrada, parentesco e renda per capita recalculada. |
| 8 | Funcional | `/social/gestao/beneficios`: nome, descrição, recorrência e esfera municipal/estadual/federal. |
| 9 | Funcional | Rendas/despesas por competência no prontuário; preservada a despesa opcional legada em `/social/beneficios`. Lançamento legado não é apresentado como ciclo completo de pagamento. |
| 10 | Funcional | `/social/encaminhamentos`: destino municipal CadÚnico e encaminhamento com motivo, beneficiário e referência. |
| 11 | Funcional | Catálogo de benefícios e regras de dispensação/estoque/cotas em `/social/requisicoes`. |
| 12 | Funcional | Requisição para família ou indivíduo, profissional, data da demanda, solicitante, usufrutuário, justificativa, itens e modalidade de entrega. Solicitação individual foi criada pelo navegador. |
| 13 | Funcional | Avaliar/autorizar/negar e cancelar requisição; parecer e comprovante. Aprovação foi executada pelo navegador. |
| 14 | Funcional | Entregar com data efetiva, controlar estoque/cota, consultar por pessoa/família e imprimir comprovante com os participantes. Entrega foi executada pelo navegador. |
| 15 | Funcional | Relatório “Profissionais, famílias e benefícios”, com período e filtros. |
| 16 | Precisa Desenvolver | Base de prontuário, acompanhamento, evolução, dados socioeconômicos e relatório disponível. Falta confrontar e completar a correspondência ao modelo oficial efetivamente exigido pela Secretaria. |
| 17 | Funcional | `/social/gestao/condicionalidades`: programa, beneficiário, prazo, ocorrência, efeito, período de suspensão e situação. Operação municipal manual; sincronização externa não configurada. |
| 18 | Funcional | Encaminhamento com profissional de origem, tipo, órgão e unidade de destino, motivo, data, status e contrarreferência. |
| 19 | Funcional | Relatório “Encaminhamentos”, com período, unidade e tipo. |
| 20 | Funcional | Relatório “Famílias acompanhadas” a partir dos períodos reais de acompanhamento, em vez de contar simplesmente famílias ativas. |
| 21 | Funcional | `/social/gestao/visitas`: agendar com unidade, família, profissional, data/hora e objetivo. Cadastro foi executado pelo navegador. |
| 22 | Funcional | Mesma ficha: registrar realização, relatório, reagendamento ou cancelamento; data efetiva e histórico preservados. |
| 23 | Precisa Desenvolver | Fila por programa, participantes vigentes, telefones, mensagem, prazo e chave de deduplicação pronta. Falta conector de envio e retorno do provedor SMS escolhido. Nenhuma mensagem foi tratada como entregue. |
| 24 | Funcional | `/social/gestao/scfv`: cadastro com equipe, unidades, serviço, faixa etária, período, dias e horários. |
| 25 | Funcional | `/social/gestao/matriculas`: matrícula individual com validação de período e idade; desligamento preserva a matrícula. |
| 26 | Funcional | `/social/gestao/eventos`, `/presencas`, `/anexos` e `/social/anexar`: planejamento, execução, chamada, relatório e arquivos no GED privado. Upload e download reais foram exercitados. |
| 27 | Funcional | Relatório “Matriculados SCFV”, com grupo e período de matrícula. |
| 28 | Funcional | Relatório “Frequência SCFV”, distinguindo presente, ausente e chamada não registrada. |
| 29 | Funcional | Cadastro compartilhado de Frota com RNTRC e anos de fabricação/modelo separados, mantendo os campos e obrigações anteriores. |
| 30 | Funcional | Cadastro compartilhado do motorista complementado com primeira habilitação. |
| 31 | Funcional | Agenda compartilhada de Frota com veículo, horários, motorista, finalidade, conflitos e reprogramação. |
| 32 | Funcional | `/social/gestao/formularios` e `/respostas`: textos curtos/longos, checkbox, escolha única/múltipla, obrigatoriedade e versões com respostas preservadas. |
| 33 | Precisa Desenvolver | Emissão de blocos operacionais municipais CRAS/CREAS disponível e explicitamente identificada como POC. Falta o modelo definitivo e o mapeamento de todos os blocos oficiais exigidos; não representa transmissão RMA. |
| 34 | Funcional | Relatório “Beneficiários por faixa etária”, usando cadastro Social e data de referência, não o cadastro geral de todas as pessoas. |
| 35 | Precisa Desenvolver | Importador local CSV V1 com prévia, rejeições, família integral, conciliação, aplicação atômica e repetição idempotente. Falta implementar/adequar o parser ao arquivo federal e dicionário oficiais fornecidos. O fluxo local foi aplicado pelo navegador. |

**Síntese:** 31 itens funcionais para a POC interna; 4 itens com base implementada e fechamento oficial/externo pendente. A classificação “Funcional” não substitui a confirmação dos parâmetros municipais nem o aceite final.

## 2. População final consultada

Consulta agregada em **01/11/2026, 19:01 UTC**, após carga e verificações autenticadas; quantidade de anexos atualizada após a verificação profissional de **19:16 UTC**.

| Estrutura / cenário | Quantidade |
|---|---:|
| Famílias sociais e canônicas conciliadas | 26 |
| Pessoas nas composições | 63 |
| Pessoas da carga principal com ficha completa | 62 |
| Pessoa adicional trazida pelo exemplo de importação local | 1 |
| Famílias sem vínculo canônico | 0 |
| Famílias com renda per capita divergente | 0 |
| Famílias com endereço e NIS | 26 |
| Vínculos profissionais vigentes | 2, para o mesmo profissional em CRAS/CREAS |
| Atendimentos | 35 |
| Solicitações/itens de benefício | 26 / 26 |
| Situações dos itens | 3 pendentes, 6 autorizados, 7 entregues, 5 negados, 5 cancelados |
| Estoques / cotas | 8 / 8 |
| Lançamentos socioeconômicos / fatos sociais | 50 / 25 |
| Acompanhamentos / evoluções | 25 / 25 |
| Visitas | 35, incluindo agendas criadas na homologação |
| Encaminhamentos | 6, com exemplos abertos e retornados |
| Condicionalidades | 25 |
| SCFVs / matrículas / eventos / chamadas registradas | 3 / 27 / 6 / 27 |
| Formulário / resposta de exemplo | 1 / 1 |
| Avisos preparados, aguardando provedor | 26 |
| Anexos privados registrados nas verificações | 4, incluindo documentação profissional |
| Lote local aplicado / registro CadÚnico local | 1 / 1 |
| Motorista / reserva de veículo | 1 / 1 |

Os dados são sintéticos. A pessoa do lote local tem somente os campos previstos no CSV de exemplo; sua complementação cadastral pode ser demonstrada na ficha de beneficiário. Não se inventaram documentos ausentes do arquivo importado.

As participações e prontuários textuais legados foram preservados. As novas operações usam as estruturas integradas; não foi declarada uma conversão automática de todo histórico legado em blocos oficiais.

### Cargas reproduzíveis

```powershell
npm run seed:social:poc -- --apply
npm run seed:social:history -- --apply
```

Sem `--apply`, os scripts exibem sua finalidade. Com a carga já registrada, retornam `replay: true`. A repetição foi executada e não duplicou a carga. O script principal exige a estrutura sintética Aurora identificada no diagnóstico; não deve ser usado como carga genérica de um município real.

## 3. Banco, contratos e histórico

Migrações aplicadas pela autoridade do repositório:

1. `20261101180000_social_poc_workflows`: cadastros complementares, participação em programas, acompanhamento, condicionalidades, formulários, SCFV, anexos, fila e importação.
2. `20261101181000_fleet_documentary_fields`: RNTRC, fabricação/modelo e primeira habilitação.
3. `20261101190000_social_workflow_revisions`: revisões de campos das novas operações.

Não foram alterados os arquivos de migração histórica. As tabelas existentes continuam disponíveis, e os contratos das actions chamadas pelos clients conservam retorno de erro para tratamento na interface. A entrega mantém o acesso por unidade e as verificações de profissional vigente.

Questionários são versionados; respostas e evoluções não são sobrescritas. Matrícula e evento com chamada têm proteções contra troca de identidade/grupo/data que invalidaria o histórico. Revisões estão disponíveis por “Detalhes → Histórico de revisões” nas novas listagens; registros anteriores à implantação desse histórico mantêm sua auditoria e dados existentes.

## 4. Validação executada no encerramento

- **Build de produção aprovado:** `npm run build`, incluindo autoridade de migrações, geração de tipos de rotas, 15 partições integrais de TypeScript e compilação Next.
- **46 testes selecionados aprovados**, zero falhas/skips: suítes Social existentes, novos workflows e suites de abertura, integração e controle de Frota. Após as alterações finais de histórico e entrega, os nove testes diretamente afetados foram reexecutados e aprovados.
- **ESLint aprovado** no código Social novo/alterado, complementos de Frota, scripts de população e teste novo.
- **Tipos auxiliares do escopo aprovados:** scripts de população, teste novo, fixtures e imports reais foram incluídos em uma checagem sem emissão, além do build de produção.
- **Aplicação das migrações e repetição das cargas aprovadas.**
- **Navegador autenticado contra build de produção:** 28 páginas HTTP 200, sem erros JavaScript, sem erros registrados pelo servidor e sem overflow horizontal nas páginas observadas. Depois da complementação do upload profissional, o build foi novamente aprovado e essa operação foi revalidada por HTTP autenticado.
- **20 verificações funcionais adicionais no navegador/HTTP aprovadas:** cadastro de visita, histórico, paginação 20/20/3, aprovação, entrega, aplicação de importação local, solicitação individual completa, nove relatórios CSV, PDF/XLSX e upload/download privado com verificação de integridade.
- **Documentação profissional no build final:** upload e download HTTP 200 para pessoa com vínculo profissional vigente na unidade, sem cadastrá-la artificialmente como beneficiária; arquivo privado registrado no GED.
- **Geometria:** listagens observadas em 1366×768; beneficiários, SCFV e requisições também em 1280×720 e 800×600, com `data-fit=ready`. O conflito original de requisições em 800px foi corrigido reduzindo o espaço fixo excessivo da coluna de ações, sem ocultar campos.
- Catálogos legados de benefícios/programas e listagem complementar de Frota foram convertidos para painéis com a tabela oficial compartilhada.

As primeiras execuções do harness encontraram consentimento de cookies e seletores/esperas de automação que precisaram ser ajustados. Também detectaram overflow do shell e o conflito de largura em requisições; esses problemas foram corrigidos e o último ensaio passou. Essas tentativas não são contabilizadas como falhas pendentes da aplicação.

**Limites da evidência:** a navegação real utilizou o administrador existente. Escopo/sigilo e concorrência foram exercitados nas fixtures. Não foi executada uma matriz exaustiva de todos os perfis, estados, níveis de zoom e dispositivos; não houve envio SMS nem leitura de arquivo federal.

Artefatos locais da última verificação: `C:/Users/thiag/AppData/Local/Temp/opencode/social-browser-result.json`, harness `social-browser-homologation.mjs` e screenshots `social-beneficiarios.png`, `social-scfv.png`, `social-requisicoes.png`. Verificação adicional do build final: `social-professional-upload-result.json` e `social-professional-upload-check.mjs`, no mesmo diretório. Credenciais e cookies não foram gravados nesses artefatos.

## 5. Entradas necessárias para o encerramento externo

| Entrada do solicitante | O que permitirá concluir |
|---|---|
| Arquivo CadÚnico de exemplo e dicionário/layout com versão | Parser federal, campos adicionais, conciliação e validação do item 35. |
| Modelo de prontuário SUAS e modelo de prestação de contas CRAS/CREAS aceitos na POC | Correspondência final dos itens 16/33 e regras de agregação dos blocos. |
| Provedor SMS escolhido, documentação e credenciais de homologação, remetente e destinatários de teste | Conector de envio/retorno e recebimento real do item 23. |
| Regras municipais de benefícios, cotas, autorizadores e entrega; referência dos prazos/efeitos das condicionalidades | Substituição dos parâmetros sintéticos pelos critérios aceitos na demonstração. |
| Confirmação do ambiente final da apresentação e equipe/perfis que participarão do aceite | Aplicação da versão e verificação dos perfis/serviços no ambiente efetivamente apresentado. |

O armazenamento privado já configurado foi utilizado com sucesso. Não é necessário solicitar um novo provedor de arquivos para os cenários que foram exercitados. As entradas acima podem ser fornecidas em conjunto; a camada interna está preparada para receber essas definições.
