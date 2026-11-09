# Paulo Silva — Portal do Servidor

## Conta e autenticação

- E-mail: `paulo@aurora.mg.gov.br`; matrícula `004218`.
- Perfil: Servidor — Serviços Integrados.
- Firebase verificado em 08/11/2026: `disabled=false`, `emailVerified=true`, provedor password, login por senha HTTP 200 e ID token validado pelo Admin SDK.
- UID Firebase confere com Usuario; usuário e Employee ativos.
- Senha fornecida pelo solicitante somente em variável de ambiente de execução; não consta dos scripts.
- Sessões de produção do Celeriflow e Portal validadas.

## Dados aplicados

- Cadastro pessoal, endereço, nomeação e contrato ativo de analista administrativo, admissão 02/01/2024.
- Folhas agosto/setembro/outubro 2026 calculadas e fechadas no escopo demonstrativo, com PDFs publicados: bruto R$ 4.800,00, descontos R$ 473,51 e líquido R$ 4.326,49 em cada competência.
- 63 registros de ponto.
- Direitos de férias e programação de 07 a 21/12/2026: 15 dias, protocolo PROC-2026-000010 deferido/executado.
- Três cursos, uma participação concluída com certificado e uma inscrição ativa.
- Publicação de aniversariante de novembro: Paulo Silva, 18/11.
- Cadastro de paciente, atendimento preventivo concluído, triagem e solicitação de hemograma.
- Consulta SST agendada em 15/11/2026, 09h de Brasília, com outros horários disponíveis.
- História funcional canônica e declaração de vínculo gerada.

## Permissões

Portal com operações próprias; RH e Saúde para consulta/relatórios; GED, Documentos, Atendimento e Processos com criação/edição, sem exclusão. Unidade orçamentária Administração; escopo de Saúde UBS Jardim das Acácias.

## Verificação e pendências

Navegação autenticada em produção a 1366×768: 15 rotas HTTP 200, sem erros JavaScript registrados. Três contracheques baixados e reconhecidos como PDF. Certificado, comprovante de inscrição, aniversariantes e comprovante SST também retornaram PDF HTTP 200.

O acervo GED ainda está vazio para a conta. A geração de documento por modelo encontrou `Arquivo não pertence ao upload registrado`; os modelos e uploads pendentes dessa tentativa foram preservados para diagnóstico. A declaração funcional é consultada pela rota `documentos-funcionais`, distinta das publicações em `emissoes`.

Verificação complementar: declaração de vínculo e relatórios PDF de ponto, ficha financeira, férias, ficha de registro e atos retornaram HTTP 200. O envio de novo pedido de férias pelo formulário não concluiu a navegação nem criou solicitação; não foram encontrados campos HTML inválidos ou mensagem de erro. A programação existente foi criada e deferida pelos serviços de domínio, mas o envio pela interface permanece pendente de correção/validação. Não considerar esse fluxo homologado.

Evidências locais: `C:/Users/trici/AppData/Local/Temp/opencode/paulo-portal-evidence/` e `paulo-portal-evidence-actions/`. Scripts de população no repositório: `scripts/provision-paulo-portal.ts` e `scripts/populate-paulo-care.ts`. Nenhuma migração/schema foi aplicada; não houve alteração de telas.

## Finalização

- Identificada a ausência de `type="submit"` no botão de requerimento; definido explicitamente no formulário funcional.
- GED: o GET do Vercel Blob retorna `paulo-silva-2026%3Auser`, enquanto HEAD retorna a chave original `paulo-silva-2026:user`. A confirmação passou a comparar a chave canônica via HEAD, mantendo igualdade estrita com a intenção e leitura validada dos bytes.
- Recuperado o upload original `eaeba5d6-04eb-4681-9cd2-8d6f982c6044`: documento GED `cmw8fwcf50001vkhy65hrn6de`, Plano de atividades Paulo Silva.
- Publicada a declaração em Emissões funcionais: `cmw8fwdhq0005vkhy8045pcpf`. Consulta pelo contexto do Paulo aprovada.
- Script idempotente de finalização: `scripts/finalize-paulo-portal.ts`.
- Testes GED: 11 aprovados (`ged-storage.test.ts` e `ged-management.test.ts`).
- A main remota tinha deployment com erro de tipagem. Hotfix preparado na branch `fix/paulo-portal-finalizacao`, sobre a versão de produção `0ed6f1e`, mantendo o histórico publicado. Validação publicada ainda em andamento.

### Resultado final em produção

- Build completo aprovado: 17 partições TypeScript e Next.js, saída 0.
- Commit publicado: `17bcc72b9e247ed4d582ff3a6365db9097b57254`.
- Deployment `dpl_2qyD4QNCTtYMSoQneeREBhwewYxb`: READY, target production, alias `guarama.celeriflow.com.br` confirmado.
- PR de integração na main: https://github.com/Robonuvem-dev/Celeriflow-Guarama/pull/21 .
- Verificação autenticada final: PASS, sem erros JavaScript; GED e declaração visíveis, 11 downloads PDF e um DOCX com HTTP 200.
- Formulário de férias submetido pela interface: protocolo **PROC-2026-000011**, pedido `cmw8h9ufo000607idd1fpo2nj`, 15 dias a partir de 11/01/2027, situação EM_ANALISE / AGUARDANDO_DECISAO. Preservado para demonstração da análise pelo RH.
- Firebase reconferido: conta habilitada, e-mail verificado, login por senha HTTP 200, ID token verificado e UID compatível com Usuario/Employee ativos.
- As duas pendências funcionais registradas acima estão resolvidas em produção. Nenhuma alteração de schema/migração foi necessária.
