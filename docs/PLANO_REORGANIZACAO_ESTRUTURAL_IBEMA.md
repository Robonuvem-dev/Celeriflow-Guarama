# Plano de reorganização estrutural do CeleriFlow para Ibema/PR

## 1. Objetivo

Este plano organiza a implementação das decisões de produto tomadas após a análise do edital e do estado do repositório. O objetivo é criar fronteiras navegáveis, autorizáveis e testáveis para os portais e módulos prioritários sem romper os serviços de domínio já existentes.

O trabalho estrutural não equivale à conclusão automática dos requisitos oficiais. Um requisito somente será considerado atendido quando houver fluxo funcional, persistência, autorização, auditoria, tratamento de erro e evidência reproduzível.

## 2. Precedência das decisões

Este documento complementa `docs/DECISOES_ARQUITETURAIS_IBEMA.md` e prevalece sobre ele nos seguintes pontos:

| Tema | Decisão vigente |
|---|---|
| Portal institucional e cidadão | Aplicação externa em `/portal`, com autenticação em `/portal/entrar` e área autenticada em `/portal/minha-area` |
| Portal do Servidor | Aplicação externa separada em `/portal-servidor`, com autenticação em `/portal-servidor/entrar` |
| Cards de portal no sistema interno | Administram conteúdo, links, imagens, funções e autorizações; não são o acesso cotidiano do público externo |
| Cemitérios | Módulo independente `CEMITERIOS`, preservando integração com o motor tributário |
| Auditoria | Módulo independente `AUDITORIA`, inicialmente liberado apenas à Administração Geral e configurável por perfil |
| Suporte | Módulo independente `SUPORTE_TECNICO`, inicialmente liberado apenas à Administração Geral e configurável por perfil |
| Aplicativo | Adiado até a estabilização dos dois portais e das APIs compartilhadas |
| Câmara e multientidade | Card e requisitos preservados; reorganização multientidade adiada para estudo próprio |
| Certificados | Implementar A1 e assinatura interna; A3 fica fora desta etapa |

## 3. Princípios de execução

1. Preservar dados, tabelas e regras de negócio já funcionais.
2. Separar fronteira de acesso sem duplicar serviços de domínio.
3. Manter redirecionamentos para rotas internas substituídas quando houver links existentes.
4. Cadastrar cada novo módulo em ativação, dashboard e matriz de perfis.
5. Aplicar negação por padrão aos novos módulos, exceto ao perfil técnico de Administração Geral.
6. Não declarar provedores, integrações ou certificados como ativos sem configuração e validação reais.
7. Não alterar assinatura ou retorno de Server Actions sem verificar todos os consumidores.
8. Executar lint, testes pertinentes e `npm run build` antes de concluir a etapa.

## 4. Fase 1: catálogo de módulos e autorização

### Entregas

- Criar um catálogo compartilhado para eliminar a divergência entre dashboard, Configurações > Módulos e Configurações > Perfis.
- Incluir `CEMITERIOS`, `AUDITORIA` e `SUPORTE_TECNICO` com nome, descrição, rota, ícone e identidade visual.
- Preservar os códigos atuais e os cards de `CAMARA`, `PORTAL_SERVIDOR` e demais módulos.
- Garantir que os novos códigos sejam aceitos na normalização de permissões.
- Criar ou atualizar registros de `ConfiguracaoModulo` de modo idempotente.
- Restringir Auditoria e Suporte Técnico à Administração Geral na configuração inicial.

### Critérios de aceite

- Os três cards aparecem no dashboard quando o módulo está ativo e o perfil permite visualização.
- A desativação em Configurações remove o card e bloqueia o acesso direto.
- A matriz de perfis permite configurar leitura e operações de cada novo módulo.
- Um perfil sem permissão recebe bloqueio ao acessar diretamente a rota.
- O perfil técnico de Administração Geral mantém acesso integral.

## 5. Fase 2: Cemitérios como módulo independente

### Entregas estruturais

- Disponibilizar o módulo em `/cemiterios` com `getTenantContextForModule("CEMITERIOS")`.
- Mover a interface e as Server Actions para a nova fronteira sem duplicar o serviço `src/lib/tributacao/s9-service.ts`.
- Trocar a autorização das operações de `TRIBUTACAO` para `CEMITERIOS`.
- Manter `/tributacao/cemiterios` como redirecionamento compatível para `/cemiterios`.
- Revalidar a nova rota após mutações.
- Manter lançamentos, guias e dívida ativa integrados pelos serviços tributários existentes.

### Matriz obrigatória `EXE-27`

Os itens `1.1661–1.1686` serão registrados individualmente na matriz requisito-evidência. A implementação deve cobrir, conforme a redação oficial:

- cadastros de cemitérios, setores/quadras, sepulturas, vagas e ossários;
- localização, capacidade, disponibilidade, ocupação e interdição;
- falecidos, responsáveis, funerárias, funcionários e causas de óbito;
- sepultamento, exumação, remoção, traslado e histórico completo;
- concessões temporárias ou indeterminadas, titulares, vigência e transferências;
- documentos, anexos, pesquisa, mapas/listagens e relatórios;
- taxas, guias, pagamentos e dívida ativa sem acoplamento indevido ao domínio fiscal;
- trilha de auditoria para todas as alterações relevantes.

### Critérios de aceite

- Os 26 requisitos possuem linha própria com rota, regra, persistência, teste e evidência.
- Não há ação meramente visual: cada comando altera e recupera o estado persistido.
- Movimentações preservam histórico e mantêm a ocupação consistente.
- Operações financeiras continuam reconciliáveis com Tributação.
- O módulo pode ser concedido ou bloqueado independentemente de `TRIBUTACAO`.

## 6. Fase 3: Auditoria

### Entregas

- Criar `/auditoria` como interface para a infraestrutura transversal existente.
- Exibir indicadores por período, módulo, evento, resultado e usuário.
- Oferecer filtros, paginação, detalhamento e exportação autorizada.
- Mascarar segredos e dados pessoais desnecessários nas consultas.
- Registrar acessos e exportações da própria auditoria.
- Usar o código `AUDITORIA` na proteção da rota e das operações.

### Critérios de aceite

- Apenas perfis autorizados acessam logs, gráficos e relatórios.
- Filtros são executados no servidor e não carregam a trilha inteira no navegador.
- O detalhamento permite correlacionar ator, evento, alvo, data, resultado e contexto disponível.
- A trilha não pode ser editada ou excluída pela interface.

## 7. Fase 4: Suporte Técnico Robonuvem

### Entregas desta etapa

- Criar `/suporte-tecnico` com card e fronteira `SUPORTE_TECNICO`.
- Criar tela inicial que deixe explícito tratar-se da manutenção e do SLA da Robonuvem.
- Exibir visão inicial de disponibilidade, canais, severidades e compromissos de atendimento.
- Não misturar o módulo com `src/app/app-domain/atendimento/`.

### Evolução posterior

- Chamados, classificação, impacto, urgência, SLA, atribuição, comunicação e anexos.
- Incidente, problema, escalonamento, solução, aceite, reabertura e satisfação.
- Base de conhecimento, acesso remoto autorizado e relatórios contratuais.

### Critérios de aceite

- O card é independente de Atendimento ao Cidadão.
- A tela inicial é protegida por módulo/perfil.
- Administração Geral possui acesso inicial e pode delegá-lo na matriz de perfis.

## 8. Fase 5: portais e autenticação

### Fronteiras

| Público | Entrada | Área autenticada | Provedores previstos |
|---|---|---|---|
| Cidadão | `/portal/entrar` | `/portal/minha-area` | E-mail/senha, Google e Gov.br |
| Servidor | `/portal-servidor/entrar` | `/portal-servidor` | E-mail/senha, Microsoft e LDAP |
| Usuário interno | Login administrativo existente | Sistema interno | E-mail/senha, Microsoft e LDAP |

### Entregas

- Separar layout, sessão de entrada e navegação dos dois portais.
- Permitir que o mesmo indivíduo mantenha identidades/vínculos de cidadão e servidor sem misturar permissões.
- Criar componentes explícitos de provedor e estados de disponibilidade.
- Manter Microsoft, Gov.br e LDAP visíveis e desabilitados como `Em configuração` até a validação real.
- Validar o fluxo Google já configurado no Firebase antes de apresentá-lo como funcional.
- Preparar Gov.br somente para cidadão, via OIDC/Firebase.
- Deixar LDAP para a última etapa de provedores.
- Ajustar `src/proxy.ts` para preservar rotas públicas e proteger apenas áreas autenticadas.

### Critérios de aceite

- Acesso direto aos portais não depende do dashboard interno.
- Login e redirecionamento respeitam o público correto.
- Provedor indisponível não inicia fluxo parcial nem sugere autenticação concluída.
- Vínculo funcional continua obrigatório no Portal do Servidor.
- Sessões e permissões internas não são derivadas apenas da existência de um cookie.

## 9. Fase 6: Saúde

### Entregas

- Destacar Atenção Primária, Assistência Farmacêutica e Central de Regulação na navegação de Saúde.
- Preservar paciente, profissional, unidade, prontuário e agenda compartilhados.
- Manter autorização sob `SAUDE` nesta etapa; subdivisão granular será feita durante a auditoria requisito a requisito.
- Não apresentar e-SUS, BNAFAR, RIRA ou RNDS como integrações concluídas sem credenciais e homologação.

### Critérios de aceite

- As três áreas possuem acesso evidente e responsivo dentro de Saúde.
- Rotas existentes continuam válidas.
- O destaque visual não cria dados ou regras duplicados.

## 10. Fase 7: LGPD e assinaturas

### LGPD nesta etapa

- Publicar política de privacidade versionada e acessível nos portais.
- Implementar banner de cookies reutilizável, separando cookies necessários dos opcionais.
- Criar componente reutilizável para ocultação visual de dados sensíveis.
- Não bloquear processos internos apenas por ausência de aplicação global do mascaramento.
- Registrar a aplicação tela a tela em backlog rastreável.

### Assinaturas nesta etapa

- Consolidar assinatura eletrônica interna com hash, ator, data, documento e validação pública pelos portais.
- Criar configuração administrável para certificado A1, validade, finalidade, permissão e auditoria de uso.
- Nunca persistir senha ou chave privada em texto puro.
- Conectar A1 aos módulos apenas após validar o formato exigido em cada fluxo.
- Não implementar ou simular A3 nesta etapa.

### Critérios de aceite

- A política e a preferência de cookies podem ser consultadas e revisadas.
- O componente de mascaramento não altera o valor persistido nem o enviado ao servidor.
- Documento assinado internamente possui código ou URL de validação pública.
- Cada uso de A1 gera trilha de auditoria e falha de modo seguro quando a configuração está ausente ou vencida.

## 11. Itens preservados para ciclos posteriores

- Aplicativo iOS/Android após estabilização dos portais.
- Estudo multientidade Prefeitura/Câmara, sem remover card ou requisitos da Câmara.
- NFS-e nacional como principal e emissão municipal básica como contingência.
- SST/Medicina do Trabalho e eSocial como áreas próprias de RH.
- IPTU, ISS e ITBI como subdomínios separados de Tributação.
- Gestão e Escrita Fiscal dentro de Tributação.
- CadÚnico federal em Assistência Social e Cadastro Único transversal em Cadastros.
- Aplicação de mascaramento LGPD tela a tela.
- LDAP após os demais provedores.
- A3 fora do escopo atual.

## 12. Verificação e encerramento

Cada fase exige:

1. Testes unitários das regras adicionadas ou alteradas.
2. Testes de autorização para perfil permitido e bloqueado.
3. Testes de navegação e compatibilidade de rotas.
4. Verificação responsiva das interfaces principais.
5. `npm run lint` ou o comando equivalente do repositório.
6. Testes pertinentes do projeto.
7. `npm run build` sem erros.
8. Atualização da matriz requisito-evidência sem marcar integrações simuladas como concluídas.

## 13. Ordem de execução

1. Catálogo/RBAC.
2. Cemitérios independente e matriz `1.1661–1.1686`.
3. Auditoria.
4. Suporte Técnico Robonuvem.
5. Portal cidadão e Portal do Servidor.
6. Destaques de Saúde.
7. LGPD e assinaturas.
8. Testes integrados, build e revisão da documentação.

Essa ordem reduz retrabalho porque todas as rotas posteriores passam a consumir a mesma fronteira de ativação e autorização desde sua criação.
