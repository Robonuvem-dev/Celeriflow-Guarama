# Decisões arquiteturais para atendimento integral do Edital de Ibema/PR

## 1. Objetivo e critério de análise

Este documento responde às 20 questões arquiteturais levantadas para o CeleriFlow com base em três fontes:

1. Edital Retificado e Termo de Referência do Pregão Eletrônico nº 36/2026, Processo Administrativo nº 68/2026.
2. PDFs oficiais armazenados em `docs/Termo de Referencia/`.
3. Estado verificável do repositório na data desta análise.

Fonte oficial publicada pelo Município:

<https://lanceeletronico.blob.core.windows.net/processfiles/616747a2ba7a4a7998b95a57e779bd7a.pdf>

O objetivo adotado é implementar **100% dos requisitos aplicáveis**, e não limitar o produto ao mínimo de aprovação da POC. A organização visual do sistema pode agrupar áreas relacionadas, mas cada módulo oficial deve continuar rastreável, testável e demonstrável de forma independente.

Os termos usados no diagnóstico significam:

| Diagnóstico | Significado |
|---|---|
| Implementado | Há fluxo funcional verificável no repositório para o escopo analisado |
| Parcial | Há telas, persistência ou serviços, mas não todo o fluxo exigido |
| Não comprovado | Não foi localizada implementação suficiente no repositório |

As referências numéricas abaixo são requisitos do TR. A divisão em componentes, serviços e etapas de entrega é recomendação arquitetural, exceto quando o texto indicar expressamente uma obrigação do edital.

## 2. Decisões executivas

| Questão | Decisão |
|---:|---|
| 1 | Unificar a experiência externa no Portal de Autoatendimento; manter Portal do Servidor como workspace especializado por perfil |
| 2 | Manter Segurança e Medicina do Trabalho como área própria dentro de RH e Folha |
| 3 | Manter eSocial como área própria dentro de RH e Folha, com motor de eventos e integração isolados |
| 4 | Manter IPTU, ISS e ITBI como subdomínios separados dentro de Tributação |
| 5 | Entregar aplicativo iOS e Android consumindo a mesma camada de serviços do portal, sem duplicar regras de negócio |
| 6 | Tratar NFS-e como subdomínio fiscal próprio, com adaptadores municipal/ABRASF e ADN nacional |
| 7 | Manter Gestão e Escrita Fiscal como área própria dentro de Tributação |
| 8 | Manter Cemitérios inicialmente dentro de Tributação, com domínio e navegação próprios |
| 9 | Agrupar cartões por macrodomínio e preservar menus, permissões e evidências por módulo oficial |
| 10 | Manter Atenção Primária como área própria dentro de Saúde |
| 11 | Manter Assistência Farmacêutica como área própria dentro de Saúde |
| 12 | Manter Central de Regulação como área própria; auditoria permanece transversal |
| 13 | Manter CadÚnico em Assistência Social; não confundir com o Cadastro Único transversal da plataforma |
| 14 | Implementar Gov.br como provedor OIDC federado, vinculado à identidade única da plataforma |
| 15 | Implementar LDAP/LDAPS como provedor corporativo configurável e com múltiplos servidores |
| 16 | Implementar governança LGPD completa; banner de cookies é somente uma parte do requisito |
| 17 | Compartilhar plataforma e base lógica entre Prefeitura e Câmara, com segregação obrigatória por entidade |
| 18 | Centralizar auditoria em serviço transversal, com trilha imutável e consultas por entidade/módulo |
| 19 | Separar hash de integridade, assinatura interna e assinatura ICP-Brasil A1/A3 |
| 20 | Criar Suporte Técnico Robonuvem como domínio operacional separado do atendimento municipal |

## 3. Respostas detalhadas

### 1. Portal do Servidor e Portal de Autoatendimento devem ser unidos?

**Referência oficial.** O Portal de Autoatendimento é o módulo `EXE-22`, requisitos `1.1255` a `1.1374`. O TR prevê serviços externos para diferentes públicos e inclui funcionalidades relacionadas ao funcionário. O Portal do Servidor não aparece na relação oficial como um 35º módulo independente.

**Estado atual.** Há um portal funcional parcial em `src/app/app-domain/portal-servidor/`, com ficha funcional, documentos, ponto, férias, benefícios e folha. O controle de vínculo está em `src/lib/portal-servidor/access.ts`. Não foi comprovado um Portal de Autoatendimento único cobrindo integralmente os requisitos `1.1255–1.1374` para cidadão, contribuinte, fornecedor/credor e funcionário.

**Decisão.** Unificar a experiência externa em um único **Portal de Autoatendimento**, com autenticação, identidade, caixa de notificações, documentos e acompanhamento comuns. O Portal do Servidor deve permanecer como um workspace especializado exibido ao usuário que possua vínculo funcional. A unificação é de experiência e infraestrutura; dados e regras de RH, Tributação, Protocolo e Compras continuam pertencendo aos respectivos domínios.

**Implementação necessária.** Criar um shell externo responsivo, catálogo de serviços por perfil, representação/procuração, caixa de entrada, acompanhamento de solicitações, emissão de documentos e roteamento para os serviços internos. Migrar a navegação de `portal-servidor` para esse shell sem duplicar as regras já existentes.

**Dependências.** Identidade única, Gov.br, LGPD, notificações, assinatura e APIs estáveis dos módulos internos.

**Prioridade.** `P0`, porque o portal será canal de acesso para diversos requisitos e para o aplicativo.

### 2. Segurança e Medicina do Trabalho deve ficar dentro de RH?

**Referência oficial.** É o módulo `EXE-10`, requisitos `1.732` a `1.805`, totalizando 74 requisitos próprios.

**Estado atual.** O repositório contém o macrodomínio `src/app/app-domain/rh/`, mas não foi comprovado um fluxo completo de SST e Medicina do Trabalho que cubra cadastros ocupacionais, riscos, exames, programas, ocorrências, documentos, alertas, relatórios e integrações exigidos pelo intervalo oficial.

**Decisão.** Manter SST e Medicina do Trabalho dentro do macrodomínio **RH e Folha**, mas como área funcional própria, com menu, permissões, entidades e roteiro de demonstração independentes. Não criar cartão adicional no dashboard principal apenas para reproduzir a divisão do edital.

**Implementação necessária.** Modelar estabelecimentos e ambientes, cargos/funções, riscos e agentes, EPIs/EPCs, exames e ASO, acidentes/CAT, afastamentos, programas e laudos, profissionais responsáveis, agenda, vencimentos, anexos e relatórios. Os dados ocupacionais devem alimentar o eSocial por contratos internos versionados.

**Dependências.** Cadastro de servidores, estrutura organizacional, GED, assinatura, notificações e motor do eSocial.

**Prioridade.** `P0`, devido ao volume do módulo e à inexistência de cobertura integral comprovada.

### 3. Gestão eSocial deve ficar dentro de RH?

**Referência oficial.** É o módulo `EXE-11`, requisitos `1.806` a `1.825`. A comunicação externa também está registrada como `INT-006` no checklist técnico.

**Estado atual.** Existem referências cadastrais e infraestrutura genérica de integrações em `src/lib/integrations/registry.ts` e `src/lib/integrations/runtime.ts`, mas não foi comprovado o ciclo integral de geração, validação, assinatura, envio, protocolo, consulta, retorno, retificação e exclusão dos eventos do eSocial.

**Decisão.** Manter eSocial dentro de **RH e Folha**, em área própria. O motor de eventos deve ser um componente desacoplado da interface de folha, pois precisa processar dados de folha, cadastro funcional, benefícios e SST sem misturar seus ciclos transacionais.

**Implementação necessária.** Criar catálogo versionado de eventos e leiautes, regras de elegibilidade, fila idempotente, assinatura XML, ambientes de Produção e Produção Restrita, armazenamento de XMLs e recibos, consulta de processamento, tratamento de rejeições e reconciliação com a origem. Toda transmissão deve ter correlação e auditoria.

**Dependências.** Certificado ICP-Brasil, credenciais oficiais, dados completos de RH/SST e filas de processamento.

**Prioridade.** `P0`, por ser integração legal e depender da qualidade dos dados de outros módulos.

### 4. IPTU, ISS e ITBI devem permanecer juntos em Tributação?

**Referência oficial.** São três módulos avaliados separadamente: `EXE-12` IPTU, requisitos `1.826–1.913`; `EXE-13` ISS, requisitos `1.914–1.972`; e `EXE-14` ITBI, requisitos `1.973–1.989`.

**Estado atual.** Há implementação substancial no macrodomínio `src/app/app-domain/tributacao/`, incluindo cadastro territorial, cadastro econômico, operações, dívida, ITBI, NFS-e, fiscalização e emissão de documentos. Exemplos relevantes estão em `tributacao/base-territorial/`, `tributacao/economico/`, `tributacao/itbi/` e `tributacao/operacoes/`. A existência dessas áreas não comprova, isoladamente, todos os itens dos três checklists.

**Decisão.** Permanecer no macrodomínio **Tributação**, mas como subdomínios explícitos e independentes. Devem compartilhar pessoa, imóvel, empresa, legislação, lançamento, arrecadação e dívida, sem compartilhar indevidamente regras específicas de cálculo.

**Implementação necessária.** Manter motores de cálculo versionados por tributo e exercício, memória de cálculo reproduzível, vigência legal, simulação, revisão, cancelamento, lançamentos em lote, documentos e auditoria. Criar matrizes individuais de cobertura para `EXE-12`, `EXE-13` e `EXE-14`.

**Dependências.** Cadastro Único, base territorial, cadastro econômico, arrecadação, dívida ativa, bancos, PIX, GED e portal externo.

**Prioridade.** `P0`, preservando a rastreabilidade separada dos três módulos.

### 5. O que deve existir no aplicativo?

**Referência oficial.** O Aplicativo Mobile é o módulo `EXE-21`, requisitos `1.1182` a `1.1254`, com 73 itens. O item `1.1182` possui redação que aparenta contradição no material oficial e deve ser objeto de pedido formal de esclarecimento; isso não elimina os demais requisitos do módulo.

**Estado atual.** Não foi comprovado aplicativo nativo/híbrido, pacote instalável, publicação para iOS/Android nem PWA que cubra o módulo. Páginas web responsivas não bastam para comprovar os requisitos específicos do aplicativo.

**Decisão.** Criar aplicativo para iOS e Android usando a mesma identidade e os mesmos serviços do Portal de Autoatendimento. As regras de negócio devem permanecer no backend; o aplicativo será um canal, não uma segunda implementação do ERP.

**Implementação necessária.** Cobrir individualmente os 73 requisitos, incluindo autenticação segura, catálogo de serviços autorizado por perfil, consulta e emissão de documentos, solicitações e acompanhamento, notificações push, anexos/câmera quando exigidos, pagamentos ou redirecionamentos seguros quando aplicáveis, acessibilidade, tratamento de indisponibilidade e observabilidade. O pipeline deve gerar artefatos assinados e versões rastreáveis para ambas as lojas.

**Dependências.** Portal de Autoatendimento, Gov.br, APIs externas, push notifications, política de privacidade, contas Apple/Google e processo de publicação.

**Prioridade.** `P1`, iniciando a fundação técnica em paralelo ao portal e concluindo após estabilização das APIs.

### 6. Como organizar NFS-e municipal e NFS-e nacional?

**Referência oficial.** Nota Fiscal Eletrônica é o módulo `EXE-24`, requisitos `1.1442` a `1.1500`. O requisito `1.1447` exige relação com o Ambiente de Dados Nacional da NFS-e. Os requisitos `1.1525–1.1527`, dentro da Escrita Fiscal, também exigem tratamento relacionado ao ADN. As integrações são rastreadas como `INT-009` e `INT-037`.

**Estado atual.** Existe área de NFS-e em `src/app/app-domain/tributacao/nfse/`, com ações e rotas para documento, PDF e XML. Há indicação explícita na interface de simulação de certificado oficial. Não foi comprovado ciclo produtivo completo com WebService municipal/ABRASF e ADN nacional.

**Decisão.** Manter um subdomínio único de **NFS-e**, com núcleo fiscal canônico e adaptadores separados por provedor: emissão municipal, padrão ABRASF quando aplicável e Ambiente de Dados Nacional. O modelo interno não deve depender diretamente do XML de um único provedor.

**Implementação necessária.** Implementar RPS/lotes, numeração, assinatura, transmissão, protocolo, consulta, autorização, rejeição, cancelamento/substituição, armazenamento imutável de XMLs, DANFSe/documentos, contingência prevista, sincronização com ADN e reconciliação. Separar claramente homologação, produção e simulação.

**Dependências.** Credenciais e documentação dos ambientes oficiais, certificado ICP-Brasil, cadastro econômico, ISS, portal, filas e armazenamento seguro.

**Prioridade.** `P0`, pois a tela existente não substitui a integração real.

### 7. Gestão e Escrita Fiscal deve ficar dentro de Tributação?

**Referência oficial.** É o módulo `EXE-25`, requisitos `1.1501` a `1.1565`.

**Estado atual.** Há funcionalidades fiscais em `src/app/app-domain/tributacao/`, especialmente `cadastros-fiscais/`, `simples-nacional/`, `iss-bancario/`, `vaf/`, `fiscalizacao/` e `motor-fiscal/`. A cobertura integral dos 65 requisitos e dos intercâmbios externos não foi comprovada.

**Decisão.** Manter Gestão e Escrita Fiscal como área própria dentro de **Tributação**. Ela deve consumir documentos fiscais e cadastros do ISS/NFS-e, mas ter apuração, declarações, livros, importações e cruzamentos próprios.

**Implementação necessária.** Completar escrituração, competências, declarações, retenções, apuração, encerramento/reabertura, livros e relatórios, importações e exportações nos leiautes requeridos, tratamento de inconsistências e rastreabilidade entre documento, declaração e lançamento. Cada integração deve registrar arquivo original, validações, resultado e responsável.

**Dependências.** NFS-e, cadastro econômico, motor tributário, Simples Nacional, ADN e demais intercâmbios fiscais descritos no TR.

**Prioridade.** `P0`, com entrega coordenada com NFS-e e ISS.

### 8. Gestão de Cemitérios deve ficar em Tributação?

**Referência oficial.** É o módulo `EXE-27`, requisitos `1.1661` a `1.1686`.

**Estado atual.** Existe implementação em `src/app/app-domain/tributacao/cemiterios/`, com página, cliente e ações. A localização atual favorece integração com receitas e débitos, mas ainda deve ser validada requisito a requisito.

**Decisão.** Manter inicialmente em **Tributação**, com área, permissões e modelo de domínio próprios. Cemitérios não deve ser tratado como simples tipo de receita: sepulturas, quadras, concessões, responsáveis, falecidos, movimentações e documentos têm ciclo de vida próprio.

**Implementação necessária.** Auditar e completar os 26 requisitos, garantir mapa/localização, disponibilidade, concessão, sepultamento, exumação, transferência, histórico, responsáveis, anexos, cobranças e relatórios. A integração financeira deve ocorrer por serviços de lançamento, não por acoplamento às tabelas tributárias.

**Dependências.** Cadastro de pessoas, receitas diversas/arrecadação, GED, georreferenciamento quando requerido e auditoria.

**Prioridade.** `P1`, porque já há uma base funcional relevante, sujeita à auditoria de completude.

### 9. Como agrupar os módulos pela quantidade e pelo tema?

**Referência oficial.** O Executivo possui 34 módulos no item `10.37`, e cada módulo é avaliado separadamente. O edital não exige um cartão de dashboard para cada módulo, nem determina a taxonomia visual do produto.

**Estado atual.** O dashboard usa macrodomínios, e as funcionalidades são organizadas em rotas internas. Essa direção é adequada, desde que não esconda permissões, acesso ou evidências dos módulos oficiais.

**Decisão.** Usar três níveis: plataforma, macrodomínio e área funcional. O dashboard apresenta macrodomínios; a navegação lateral apresenta áreas; permissões, métricas, testes e evidências preservam o código do módulo oficial.

| Macrodomínio | Áreas oficiais relacionadas |
|---|---|
| Financeiro e Contábil | Contábil e Financeiro, Controle Interno, Custos |
| Planejamento e Orçamento | PPA, LDO, LOA, programação e alterações orçamentárias, integrado ao Financeiro |
| Segurança e Medicina do Trabalho | Saúde ocupacional e segurança dos servidores, integrado ao RH |
| Administração | Compras e Licitações, Almoxarifado, Patrimônio, Frota, Protocolo e Processo Digital |
| RH e Folha | Folha, vínculos funcionais e eSocial |
| Tributação | IPTU, ISS, ITBI, Receitas Diversas, Arrecadação, Dívida Ativa, NFS-e, Escrita Fiscal, Fiscalização Fazendária, Cemitérios |
| Obras e Serviços | Construção Civil e Serviços Públicos |
| Canais Externos | Aplicativo, Portal de Autoatendimento e Portal da Transparência |
| Saúde | Gestão da Saúde, Faturamento, Atenção Primária, Assistência à Saúde, Farmácia e Regulação |
| Assistência Social | Gestão da Assistência Social e CadÚnico |
| Legislativo | Áreas funcionais da Câmara previstas no caderno próprio |

**Regra de volume.** Quantidade de requisitos define esforço, equipe e roteiro de testes, mas não deve, sozinha, definir fronteira de domínio. Módulos grandes recebem navegação e responsáveis próprios; módulos pequenos continuam separados quando possuem ciclo de vida, permissão ou avaliação independente.

**Atualização aprovada em 10/10/2026.** Planejamento e Orçamento (`PLANEJAMENTO`) e Segurança e Medicina do Trabalho (`SST`) passam a ter cards, ativação, permissões e layouts próprios. A estrutura inicial e o mapeamento das dependências estão em `docs/MODULOS_PLANEJAMENTO_SST.md`. Os dados e fluxos existentes continuam compartilhados conforme as autorizações dos módulos de origem.

**Implementação necessária.** Associar rotas e permissões a identificadores oficiais, criar matriz requisito-evidência e permitir acesso direto a cada área durante a demonstração.

**Prioridade.** `P0` para a taxonomia e rastreabilidade; `P1` para ajustes visuais.

### 10. Atenção Primária deve ser uma área separada em Saúde?

**Referência oficial.** É o módulo `EXE-30`, requisitos `1.2058` a `1.2098`.

**Estado atual.** Há um macrodomínio extenso em `src/app/app-domain/saude/`, com cadastros, unidades, vacinação, vigilância e documentos. A navegação e os fluxos de território/e-SUS aparecem em `saude/layout.tsx`, `saude/territorio/`, `saude/sisab/` e `saude/esus/`. A própria tela de integração informa que o lote oficial e-SUS ainda está indisponível sem contrato externo configurado. Não foi comprovada cobertura integral e isolada dos 41 requisitos da Atenção Primária.

**Decisão.** Manter **Atenção Primária** como área própria dentro de Saúde, compartilhando paciente, profissional, estabelecimento, prontuário e agenda. Não misturar sua navegação com Farmácia ou Regulação apenas porque todos usam dados clínicos.

**Implementação necessária.** Mapear cada requisito para jornadas de território/equipe, cidadão, atendimento, procedimentos, acompanhamento, agenda, produção e relatórios. Garantir interoperabilidade e rastreabilidade com os padrões e sistemas externos requeridos, sem duplicar o prontuário.

**Dependências.** Cadastro de saúde, profissionais e unidades, CADSUS, e-SUS, documentos, assinatura e consentimento.

**Prioridade.** `P0`, por envolver dados sensíveis e fluxos assistenciais centrais.

### 11. Assistência Farmacêutica deve ser uma área separada em Saúde?

**Referência oficial.** É o módulo `EXE-32`, requisitos `1.2173` a `1.2229`. A integração BNAFAR é rastreada como `INT-014`.

**Estado atual.** Existem estruturas de Saúde e funcionalidades de estoque/dispensação em `src/app/app-domain/saude/farmacia/`, além da consulta de medicamentos no portal em `src/app/app-domain/portal-paciente/saude/page.tsx`. O ciclo integral dos 57 requisitos e a transmissão real para BNAFAR não foram comprovados. Cadastro de integração ou exportação isolada não equivale a integração concluída.

**Decisão.** Manter **Assistência Farmacêutica** como área própria dentro de Saúde. Ela compartilha produto, lote, pessoa, unidade e prescrição, mas exige controles específicos de estoque sanitário, dispensação e rastreabilidade.

**Implementação necessária.** Cobrir solicitação, entrada, lote/validade, armazenamento, transferência, inventário, dispensação vinculada a paciente e prescrição, estorno, perdas, medicamentos sujeitos a controle, alertas e relatórios. Implementar BNAFAR com ambientes, credenciais, lotes de envio, protocolos, inconsistências, reprocessamento e consulta de histórico.

**Dependências.** Estoque, cadastro de pacientes/profissionais/unidades, prescrição, BNAFAR e conectividade externa.

**Prioridade.** `P0`, especialmente para integridade de estoque, dispensação e integração oficial.

### 12. Central de Regulação e auditoria devem ficar juntas?

**Referência oficial.** Central de Regulação é o módulo `EXE-33`, requisitos `1.2230` a `1.2311`, totalizando 82 requisitos. O TR também prevê integrações de Saúde como RIRA e RNDS, conforme o comportamento exigido em cada item.

**Estado atual.** Há fluxo regulatório em `src/app/app-domain/saude/regulacao/` e regras em `src/lib/saude/regulation-service.ts`. A plataforma possui serviços de auditoria em `src/lib/platform/audit-query.ts`, `audit-query-service.ts` e `audit-evidence.ts`. Não foi comprovada cobertura integral da fila regulatória nem que todas as mutações relevantes estejam auditadas.

**Decisão.** Manter **Central de Regulação** como área funcional própria dentro de Saúde. A auditoria técnica e administrativa deve continuar transversal à plataforma. Caso o TR exija auditoria clínica/regulatória, ela será uma capacidade de negócio da Regulação, alimentada pela mesma infraestrutura de trilha, mas não substituirá o log geral.

**Implementação necessária.** Implementar solicitações, classificação/priorização, filas, cotas, agendas/ofertas, encaminhamento, autorização, devolução, cancelamento, comparecimento, histórico e indicadores. Registrar toda mudança de estado, usuário, justificativa e integração, além de completar RIRA/RNDS quando exigido.

**Dependências.** Unidades, profissionais, pacientes, agenda, serviços/procedimentos, RIRA, RNDS e serviço transversal de auditoria.

**Prioridade.** `P0`, pelo maior volume entre os módulos analisados e pelo caráter assistencial.

### 13. Cadastro Único e CadÚnico são a mesma coisa?

**Referência oficial.** `PT-002` exige um **Cadastro Único compartilhado entre os módulos**, incluindo pessoas, famílias, estrutura organizacional, bancos, endereços, produtos e outros cadastros básicos. Já os requisitos `1.1716` e `1.1717` tratam da integração com o **CadÚnico** do Governo Federal, rastreada como `INT-042`, dentro do contexto da Assistência Social.

**Estado atual.** Há cadastros distribuídos pelos domínios e uma área social em `src/app/app-domain/social/`. Não foi comprovada uma implementação integral de `PT-002` que elimine duplicidades em todos os módulos, nem integração produtiva completa com o CadÚnico federal.

**Decisão.** Tratar como conceitos distintos:

| Conceito | Papel no CeleriFlow |
|---|---|
| Cadastro Único da plataforma | Dados mestres compartilhados por todos os módulos |
| CadÚnico federal | Sistema externo e conjunto de dados sociais consumidos pela Assistência Social |

O CadÚnico deve permanecer em **Assistência Social**. Seus dados externos devem ser vinculados à pessoa/família mestra, com origem, competência, autorização e histórico, sem sobrescrever silenciosamente o cadastro corporativo.

**Implementação necessária.** Criar governança de dados mestres, deduplicação, chaves externas, merge auditado, qualidade de dados e contratos de sincronização. Implementar importação/consulta do CadÚnico segundo os meios oficiais disponíveis.

**Dependências.** Convênio, leiaute ou credencial oficial do CadÚnico, LGPD e definição municipal de governança cadastral.

**Prioridade.** `P0`, porque o cadastro mestre sustenta toda a plataforma.

### 14. Como implementar o login Gov.br?

**Referência oficial.** `PT-016` exige login único Gov.br. A integração é rastreada como `INT-001`.

**Estado atual.** Foram localizadas menções comerciais ao Gov.br, mas não um fluxo funcional de autenticação OIDC, callback, validação de tokens, vínculo de conta e tratamento de falhas. A autenticação atual usa sessão própria, visível em `src/app/api/auth/session/route.ts` e `src/lib/platform/session.ts`.

**Decisão.** Implementar Gov.br como provedor federado **OpenID Connect**, sem substituir a identidade interna. Uma identidade interna poderá ter credenciais locais, vínculo Gov.br e, quando cabível, vínculo LDAP; permissões continuam administradas no CeleriFlow.

**Implementação necessária.** Implementar Authorization Code Flow com PKCE, `state`, `nonce`, callback seguro, validação de issuer/audience/assinatura/expiração, vínculo por identificador confiável, prevenção de tomada de conta, revogação de sessão e logs sem tokens. Separar os clientes e URLs de homologação e produção.

**Dependências.** Credenciamento oficial, `client_id`, segredo ou mecanismo de autenticação definido pelo Gov.br, URLs públicas, política de vinculação e ambiente HTTPS.

**Prioridade.** `P0` para arquitetura e homologação; ativação produtiva condicionada ao credenciamento.

### 15. Como implementar LDAP?

**Referência oficial.** `PT-017` exige configuração de servidor LDAP e `PT-018` exige autenticação por usuário/senha com possibilidade de múltiplos servidores. A integração é rastreada como `INT-002`.

**Estado atual.** Não foi localizada implementação LDAP/LDAPS no fluxo de autenticação.

**Decisão.** Criar provedor de identidade LDAP configurável por entidade, com múltiplos servidores ordenados e política explícita de failover. A autenticação valida a credencial no diretório; o CeleriFlow mantém usuário, vínculos, perfis, permissões e auditoria localmente.

**Implementação necessária.** Suportar LDAPS ou StartTLS, bind técnico seguro quando necessário, busca por filtro/base DN, bind do usuário, timeout, failover, mapeamento configurável de atributos/grupos e teste administrativo de conexão. Segredos devem ficar em cofre, nunca no banco em texto puro. Falha LDAP não deve liberar acesso local automaticamente sem política expressa.

**Dependências.** Endereços, certificados TLS, regras de rede, contas de serviço e esquema do diretório do Município.

**Prioridade.** `P0`; pode ser validado antes das credenciais municipais com servidor LDAP controlado de homologação.

### 16. Um banner de cookies atende à LGPD?

**Referência oficial.** Os requisitos LGPD são `PT-080` a `PT-089`. Eles abrangem termos por perfil/serviço, inventário de tratamentos, tratamentos externos, transparência ao cidadão, relatório de vínculos, consentimento, controlador, encarregado, aceite de políticas/cookies e WebService de consulta de consentimento.

**Estado atual.** Existem usos técnicos de cookies de sessão e consentimento pontual em formulário comercial, mas não foi comprovado um domínio de governança LGPD que cubra os dez requisitos. Cookie de sessão estritamente necessário não equivale a registro de aceite da política.

**Decisão.** Implementar LGPD como capacidade transversal. O banner será apenas a interface para cookies não essenciais e para apresentação das políticas no primeiro acesso. Consentimento não deve ser usado como base legal universal; cada tratamento precisa registrar sua hipótese legal apropriada.

**Implementação necessária.** Versionar termos e políticas, segmentar por perfil/serviço, registrar aceite/revogação com evidência, inventariar tratamentos e bases legais, cadastrar controlador/encarregados, publicar transparência, gerar relatórios ao titular e expor consulta de consentimento para aplicações autorizadas. Bloquear scripts não essenciais até a escolha do usuário e permitir revisão posterior.

**Dependências.** Definições do encarregado de dados, textos jurídicos, classificação de cookies, autenticação e política de retenção.

**Prioridade.** `P0`, devido ao uso de dados pessoais e sensíveis em praticamente todos os módulos.

### 17. Prefeitura e Câmara devem usar a mesma base?

**Referência oficial.** O item `15.1` prevê contratos administrativos distintos para Prefeitura e Câmara. Os itens `4.12`, `8.2` e `3.117` apontam para base única, segregação por entidade/unidade e consolidação quando aplicável. Separação contratual não implica, por si só, bancos físicos separados.

**Estado atual.** Existe domínio da Câmara em `src/app/app-domain/camara/` e contexto de acesso em `src/lib/platform/tenant-context.ts`. O código atual indica uma instância municipal ativa, mas ainda não comprova isolamento multientidade integral em todas as tabelas, consultas, arquivos, caches, jobs, relatórios e integrações.

**Decisão.** Usar a mesma plataforma e **uma base lógica compartilhada**, com segregação obrigatória por entidade. Prefeitura e Câmara terão configurações, usuários, perfis, numerações, documentos e integrações próprios, além das consolidações legalmente exigidas. A arquitetura deve permitir separação física futura por política ou escala, sem torná-la requisito agora.

**Implementação necessária.** Introduzir `entityId`/escopo equivalente em todos os agregados aplicáveis, resolver entidade no contexto autenticado, impedir consultas sem escopo, separar namespaces de arquivos/cache/filas e adicionar testes de não vazamento. Usuários com atuação em mais de uma entidade devem selecionar contexto e cada troca deve ser auditada.

**Dependências.** Inventário de tabelas, matriz de compartilhamento cadastral, migração de dados e definição dos perfis Prefeitura/Câmara.

**Prioridade.** `P0`, antes de ampliar dados reais ou integrações.

### 18. Como devem funcionar os logs gerais?

**Referência oficial.** `PT-040` exige log para cada uso de certificado. Outros requisitos funcionais exigem históricos e rastreabilidade específicos. O edital não reduz auditoria a um único arquivo de log técnico.

**Estado atual.** Há infraestrutura em `src/lib/platform/audit-query.ts`, `audit-query-service.ts` e `audit-evidence.ts`, além de registros específicos em alguns serviços. Não foi comprovada cobertura uniforme de todas as mutações, autenticações, acessos sensíveis, integrações e operações privilegiadas.

**Decisão.** Criar um serviço transversal de auditoria append-only, separado de logs de diagnóstico e métricas. Cada domínio pode produzir eventos próprios, mas todos obedecem ao mesmo envelope, retenção, segregação e mecanismo de consulta.

**Implementação necessária.** Registrar entidade, módulo, ação, ator real e representado, data/hora confiável, alvo, resultado, motivo, IP/origem quando permitido, correlação e diferenças antes/depois com mascaramento de segredos. Cobrir login, falhas, troca de entidade, leitura de dados sensíveis, exportações, mudanças de permissão, assinaturas, integrações e exclusões. Restringir acesso, impedir alteração pela aplicação e exportar evidências verificáveis.

**Dependências.** Política de retenção, classificação de dados, armazenamento imutável e sincronização de relógio.

**Prioridade.** `P0`, como requisito transversal e evidência dos demais módulos.

### 19. Hash interno e certificados A1/A3 são a mesma solução?

**Referência oficial.** `PT-037` a `PT-056` estabelecem repositório A1, assinaturas básica/avançada/qualificada, controle de validade, auditoria, assinatura na aplicação, fluxos de solicitação, certificados A1/A3, visualização e PDF com autenticidade/QR Code. Em especial, `PT-051` exige certificados do repositório e/ou locais, A1 ou A3.

**Estado atual.** `src/lib/signatures/internal-signature.ts` implementa assinatura eletrônica interna baseada em hash. `src/lib/security/icp-brasil.ts` possui fundação criptográfica para certificado A1 via variáveis de ambiente, validação de cadeia e SHA-256. Não foram comprovados repositório administrável, cofre de chaves, gestão de validade, seleção de certificados, A3 local, fluxos completos de múltiplos signatários ou aplicação de assinatura qualificada em todos os documentos requeridos.

**Decisão.** Separar três capacidades:

| Capacidade | Uso |
|---|---|
| Hash de integridade | Detectar alteração e identificar conteúdo |
| Assinatura eletrônica interna | Vincular usuário autenticado, ato, data e hash conforme política interna |
| Assinatura ICP-Brasil A1/A3 | Produzir assinatura avançada/qualificada com certificado e cadeia verificável |

Um hash isolado não deve ser apresentado como assinatura ICP-Brasil. A1 deve operar com chave em cofre/HSM e controle de privilégio. A3 deve usar componente local ou provedor compatível para acessar token/cartão sem enviar a chave privada ao servidor.

**Implementação necessária.** Criar inventário e validade de certificados, alertas, privilégios, auditoria por uso, seleção A1/A3, assinatura unitária e em lote, ordem sequencial/simultânea, rejeição, notificações, validação, carimbo visível, QR Code e página pública de autenticidade. Preservar documento original, versão assinada e evidências criptográficas.

**Dependências.** Certificados oficiais, política de custódia, cofre/HSM ou provedor, componente A3 homologado e validação jurídica dos formatos de assinatura.

**Prioridade.** `P0`, porque a capacidade é transversal e habilita eSocial, NFS-e, processos e relatórios.

### 20. Como criar o Suporte Técnico Robonuvem?

**Referência oficial.** Suporte Técnico Robonuvem não foi identificado como módulo funcional autônomo entre os 34 módulos do Executivo ou no caderno da Câmara. O edital, porém, contém obrigações de suporte e atendimento da contratada, incluindo o item `2.131` e as condições gerais de suporte/implantação. Portanto, o módulo é uma decisão operacional para cumprir e evidenciar essas obrigações, não um novo módulo oficial da POC.

**Estado atual.** `src/app/app-domain/atendimento/` atende demandas municipais e possui fila própria. Esse domínio não deve ser convertido automaticamente em suporte da fornecedora, pois os públicos, SLAs, permissões e dados são diferentes.

**Decisão.** Criar **Suporte Técnico Robonuvem** como domínio operacional separado, com dois lados: portal do cliente autorizado e console interno da equipe Robonuvem. Pode reutilizar componentes de fila, anexos, notificações e auditoria, mas não deve misturar chamados técnicos com protocolos ou atendimentos prestados pelo Município ao cidadão.

**Implementação necessária.** Incluir abertura e classificação, produto/módulo/ambiente, impacto e urgência, SLA contratual, atribuição, comunicação, anexos, diagnóstico, escalonamento, problema/incidente, solução, aceite, reabertura, satisfação, base de conhecimento e relatórios. Acesso remoto e dados de produção devem exigir autorização temporal, finalidade, auditoria e mascaramento. Incidentes de segurança precisam de fluxo específico.

**Dependências.** Definição contratual de canais e SLAs, usuários autorizados do Município/Câmara, notificações, observabilidade e política de acesso da equipe técnica.

**Prioridade.** `P1`; antecipar o modelo de SLA e auditoria antes da implantação produtiva.

## 4. Fundações transversais obrigatórias

As respostas acima não devem resultar em vinte implementações isoladas. Para evitar duplicação e lacunas, a plataforma precisa consolidar estas fundações:

| Fundação | Responsabilidade |
|---|---|
| Identidade | Conta interna, Gov.br, LDAP, MFA quando adotado, sessão e representação |
| Autorização | Entidade, unidade, centro de custo, papel, recurso, operação e delegação |
| Multientidade | Segregação Prefeitura/Câmara em banco, arquivos, cache, filas e integrações |
| Cadastro mestre | Pessoas, famílias, endereços, organizações, produtos e demais itens de `PT-002` |
| Auditoria | Eventos imutáveis, pesquisa, retenção, evidência e correlação |
| Documentos e assinatura | GED, versionamento, hash, A1/A3, solicitações e autenticidade pública |
| Integrações | Adaptadores, segredos, ambientes, fila, idempotência, protocolo, retry e reconciliação |
| Notificações | Caixa interna, e-mail, push e comprovantes de envio |
| LGPD | Tratamentos, bases legais, termos, consentimentos e solicitações do titular |
| Relatórios | Fila, formatos, armazenamento, assinatura, autenticidade e permissões |

## 5. Sequência recomendada de implementação

| Fase | Entregas principais |
|---|---|
| 0 | Matriz integral requisito-evidência para os módulos e requisitos transversais deste documento |
| 1 | Multientidade, identidade, autorização, Cadastro Único, auditoria, LGPD, documentos e certificados |
| 2 | Portal de Autoatendimento e APIs compartilhadas; Gov.br e LDAP em homologação |
| 3 | RH/SST/eSocial e Tributação/IPTU/ISS/ITBI/NFS-e/Escrita Fiscal |
| 4 | Saúde: Atenção Primária, Farmácia e Regulação, com integrações oficiais |
| 5 | Aplicativo móvel, conclusão de Cemitérios e Suporte Técnico Robonuvem |
| 6 | Testes integrais, segurança, carga, acessibilidade, recuperação, roteiro e evidências de demonstração |

As fases indicam dependência técnica, não autorização para deixar requisitos fora do produto final. Um item só deve ser considerado concluído quando interface, regra de negócio, persistência, permissão, auditoria e integração aplicável puderem ser demonstradas de ponta a ponta.

## 6. Dependências e esclarecimentos formais

Devem ser obtidos o quanto antes:

| Dependência | Motivo |
|---|---|
| Esclarecimento do item `1.1182` | A redação do primeiro requisito do aplicativo aparenta contradição |
| Credenciais Gov.br | Homologação e produção do login federado |
| Infraestrutura LDAP municipal | Configuração final de servidores, certificados e mapeamentos |
| Certificados A1 e dispositivos/provedor A3 | Homologação de assinatura qualificada e integrações fiscais |
| Acessos e documentação eSocial | Transmissão e consulta de eventos reais |
| Provedor municipal/ABRASF e ADN | NFS-e municipal e nacional |
| Credenciais de Saúde | CADSUS, e-SUS, RIRA, RNDS e BNAFAR |
| Regras de segregação Prefeitura/Câmara | Migração, perfis e compartilhamento cadastral |
| Política LGPD municipal | Bases legais, textos, controlador, encarregado e retenção |
| SLAs de suporte | Parametrização e evidência do atendimento contratual |

## 7. Critério de encerramento

Para cada uma das 20 decisões, o encerramento exige:

1. Requisitos oficiais vinculados a histórias e testes.
2. Fluxo real, sem depender apenas de mock, tela estática ou botão sem ação.
3. Persistência e regras de negócio verificáveis.
4. Permissões e segregação por entidade testadas.
5. Auditoria e evidências geradas.
6. Integrações validadas em homologação ou produção, conforme disponibilidade oficial.
7. Dependências externas identificadas sem declarar simulação como atendimento real.
8. Roteiro reproduzível para demonstrar integralmente o comportamento exigido.
