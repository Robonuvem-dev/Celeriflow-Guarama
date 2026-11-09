# Previews fora da main e impacto na POC — 09/11/2026

> **Registro da inspeção anterior ao merge.** A branch principal abaixo foi posteriormente integrada à `main` em `094782ae`. Consulte a [reavaliação pós-merge dos 48 requisitos](RELATORIO_POC_POS_MERGE_2026-11-09.md) para o resultado da árvore integrada.

## Conclusão

Existe trabalho ainda fora da `main`, principalmente na branch `feat/cf26-cf29-cf31-cf32-mateus`. O preview está **READY**, porém a inspeção encontrou operações demonstrativas, gravações somente em memória e infraestrutura incompleta. **Não foi comprovado aumento de atendimento dos requisitos apenas pela integração desse código.**

O código é aproveitável para concluir os módulos, mas os percentuais do [relatório da main](RELATORIO_POC_33_MODULOS_2026-11-09.md) permanecem válidos para o conteúdo efetivamente auditado.

## Referências conferidas

- `git fetch origin --prune` executado; comparadas as 15 branches remotas além de `main`.
- Main atual: `6a08ccb4b3ad73e3df2e53fa4aa8c5c4df3db00c`.
- Corte da auditoria: `aeaf772b646b31ee0f1644b68d8ce9eac1eb47a4`. A diferença para a main atual é documental; nenhuma alteração em `src`, `db`, `scripts`, dependências ou configuração de runtime.
- Branch pendente principal: `38f51cf4c542ba1c73fe696b4afeb0b9a1000414`.
- **6 commits exclusivos**, enquanto a main possui **46 commits ausentes nessa branch**. O diff da branch desde a base comum abrange 33 arquivos, 7.460 inserções e uma exclusão.
- Vercel: deployment `dpl_BDt4zVAcFuEGSnP1Z6ow2k81skyM`, ambiente Preview, estado READY, SHA `38f51cf4`.
- [Preview correspondente](https://celeriflow-guarama-3fxklw2u1-celeriflow-dev.vercel.app).
- [Código exato da branch inspecionada](https://github.com/Robonuvem-dev/Celeriflow-Guarama/tree/38f51cf4c542ba1c73fe696b4afeb0b9a1000414).

READY comprova a publicação/build daquele snapshot; não comprova atendimento funcional da POC. A análise desta etapa foi de Git, metadados Vercel e código, sem navegação ou execução de operações no banco.

## Conteúdo novo e impacto

| Módulo | Resultado na main | Conteúdo exclusivo encontrado | Impedimento para pontuar como concluído |
| --- | ---: | --- | --- |
| CF26 — Arrecadação Online | 0/7 — 0,00% | Tela, API, seis métodos nominados, descritor WSDL e cálculo de código de barras. | Consultas usam catálogo demonstrativo/JSON de parâmetros; confirmações e cancelamentos alteram memória. SOAP ignora os parâmetros das consultas e não implementa confirmação/cancelamento por XML. Não integra a baixa ao crédito tributário real. |
| CF29 — Administradoras de Cartões | 2/9 — 22,22% | Equipamentos, termos, declarações, DAM, receptor e relatórios DECRED. | Inclusões/alterações não são gravadas pelo fluxo web no banco; o aceite não é verificado por usuário e há aceite inicial fictício. Recepção fabrica operação quando o lote vem vazio; DAM tem vencimento fixo e não demonstra cobrança real. |
| CF31 — Backup | 0/11 — 0,00% | Console web, primitivas AES-256-GCM, políticas de retenção, catálogo e script Windows. | O backup cifra um manifesto JSON, não o banco nem os arquivos. Tamanhos e histórico são gerados; restauração apenas cifra/decifra novo JSON. Não há upload efetivo para storage nem cópia WAL. |
| CF32 — Data Center | 3/21 — 14,29% | Painel de requisitos e diagnóstico real de DNS/certificado TLS/URL. | Diagnóstico pontual não entrega SLA, certificações, redundância, backup ou suporte. A própria matriz registra dependência do provedor. Login web não cobre a plataforma de sistemas desktop exigida pelo item 19. |

Essa tabela é uma revisão dirigida das novidades e bloqueios, não uma nova homologação dos 48 requisitos desses quatro módulos. Não foi calculado um percentual hipotético de uma árvore integrada ainda inexistente.

### Evidências de código no SHA 38f51cf4

1. `src/lib/platform/tributacao-infra-persistence.ts:26-96`: executa somente `select` e hidratação de estado. Não grava as operações. Usa parâmetros `CF26:*`, `CF29:*`, `CF31:*`; em erro retorna o estado demonstrativo em memória.
2. `src/app/api/tributacao/arrecadacao-online/route.ts:37-149`: carrega o estado, chama funções síncronas e devolve resultado; nenhuma persistência da mutação. Linhas 45–74 reconhecem nomes de operação XML e passam `{}` às consultas.
3. `src/lib/tributacao/febraban-arrecadacao-service.ts:142-305,526-642,686-706`: débitos/logs sintéticos, confirmação/cancelamento em objetos locais e WSDL sem definição integral de mensagens/tipos/binding.
4. `src/app/api/tributacao/decred/route.ts:28-120` e `src/lib/tributacao/card-administrators-decred-service.ts:399-418,423-447,455-594`: carregamento seguido de alteração em memória; aceites e gravações não são associados transacionalmente ao ator autenticado.
5. `src/app/api/tributacao/declaracao-cartoes/webservice/route.ts:46-78`: na ausência de operações, cria uma operação de R$ 64.000,00 com taxa de R$ 1.600,00 e identificadores demonstrativos.
6. `src/lib/tributacao/card-administrators-decred-service.ts:600-638`: geração de DAM usa vencimento fixo `2026-11-20`, atualiza arrays locais e não cria o crédito/guia no domínio tributário.
7. `src/lib/platform/backup-service.ts:223-264`: criptografia AES-GCM efetiva para o payload recebido. Isso é uma peça reutilizável, não a implementação integral do backup.
8. `src/lib/platform/backup-service.ts:340-458,530-658`: catálogo e tamanhos sintéticos; execução cifra JSON descritivo; teste de restauração gera e decifra um novo payload em vez de restaurar um arquivo previamente armazenado.
9. `src/lib/platform/backup-service.ts:35-61`: `CONECTADO_ATIVO` é inferido de duas variáveis, sem teste/upload do destino.
10. `scripts/backup-service-windows.ps1:25-33,64-74`: chama o endpoint sem o token requerido e dorme uma hora entre chamadas; não lê banco/WAL nem implementa por si só o contrato de um serviço Windows.
11. `src/lib/platform/datacenter-governance.ts:41-153,206-241`: separa dependências do provedor e diagnóstico DNS/TLS. O código de inspeção de certificado é concreto; a matriz estática não comprova implantação dos demais requisitos.
12. `scripts/seed-cf26-cf29-cf31.ts:491-582`: existem inserções em parâmetros no script de carga, mas não são a persistência das operações posteriores da UI/API. Carga demonstrativa não aumenta atendimento funcional.

## Outras branches

| Branch/grupo | Situação encontrada | Consequência |
| --- | --- | --- |
| `fix/paulo-portal-finalizacao` | Um commit exclusivo (`17bcc72b`), mas formulário, scripts de provisionamento e correção GED já estão presentes na main. No conjunto comparado, o GED difere apenas no comentário explicativo. | Não há ganho funcional adicional identificado para a POC. |
| `implement_celeriflow_sprint_requirements` | Um commit exclusivo (`37ae9b13`) de tipagens/build. Alterações equivalentes e posteriores estão na main; a branch ainda contém cancelamento de NFA-e que apenas retorna sucesso. | Não equivale a novas funcionalidades completas; importar o estado antigo pode perder melhorias já auditadas. |
| `feat/auditoria-qa-correcoes-e-ui-global`, `eduardo-07112026` | Zero commits exclusivos. | Entregas já estão no histórico da main e foram consideradas na auditoria. |
| `feat/cf10-cf30-cf33-mateus`, `feat/requisitos-cf22-cf23-cf27-cf28`, Patrimônio e Frotas | Zero commits exclusivos. | Não há lote novo de implementação pendente nessas branches atuais. |
| `fix/cf04-migration-order` | Um commit antigo de documentação e renomeação de duas migrações; 100 commits atrás da main. | Não acrescenta requisito funcional. |
| `feat/migracao-integral-drizzle` | Quatro commits divergentes, 121 commits atrás; delta histórico de 2.802 arquivos. | Trabalho técnico antigo de migração, não classificado como novos requisitos prontos. Não foi feita uma segunda auditoria integral dessa árvore obsoleta. |

### Particularidade de Licitação

O preview antigo de `b91e1e7d` antecede o revert documentado em 03/11. A main recebeu posteriormente `7969da2a`, que recriou os serviços/repositórios de relatórios. A branch atual `feat/cf11-licitacao-relatorios` não tem commits exclusivos. Recuperar algo do snapshot anterior exige comparar a lógica específica; reintegrar a mesma branch não restaura automaticamente a versão revertida nem comprova melhoria de pontuação.

## Encaminhamento técnico

Priorizar a conclusão da branch CF26/CF29/CF31/CF32: persistência transacional real e integração com os registros tributários, contratos completos dos webservices e backup/restauração de dados reais. Reaproveitar telas, cálculos e diagnóstico que forem compatíveis com a main atual. Depois, reavaliar somente os requisitos efetivamente afetados.

Nenhum merge, deploy, alteração de implementação ou migração foi executado nesta inspeção.
