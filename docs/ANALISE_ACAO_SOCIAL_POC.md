# Ação Social (web) — análise dos 35 requisitos para POC

> **Diagnóstico anterior ao desenvolvimento.** A situação após a implementação, migrações, carga e testes está em [ENTREGA_ACAO_SOCIAL_POC.md](ENTREGA_ACAO_SOCIAL_POC.md). Os números e classificações abaixo registram a condição inicial e foram preservados para comparação.

**Data:** 01/11/2026. **Versão:** 1.235.0. **Commit analisado:** `d507684f` (31/10/2026).

## 1. Parecer executivo e critério

**O módulo ainda não está pronto para uma POC integral dos 35 itens.** Há funcionalidades operacionais aproveitáveis, mas faltam fluxos inteiros, campos, relatórios e uma população coerente de demonstração.

- **Funcional: 6 itens — 4, 9, 10, 11, 13 e 31.**
- **Precisa Desenvolver: 29 itens.** Inclui funcionalidades parciais que precisam ser completadas; não significa reconstruir tudo.
- A base consultada **não está adequadamente populada** para uma demonstração ponta a ponta.
- As listagens principais de Social utilizam o componente oficial compartilhado. A cobertura visual integral **não está homologada**; há exceções concretas no catálogo de benefícios e na gestão complementar de Frotas.

**Funcional** significa que há interface e operação persistente identificadas para a função descrita, considerando o reaproveitamento de módulos internos. A preparação de cadastros e permissões é registrada separadamente. Não significa que cada funcionalidade tenha sido executada por navegador nesta análise.

**Precisa Desenvolver** significa ausência de fluxo operacional ou falta de parte exigida pelo item. A existência isolada de tabela, texto de menu, modelo de impressão ou teste não foi considerada atendimento completo.

### Alcance da verificação

Foram inspecionados páginas, componentes, actions, validações, repositórios Drizzle, schemas, scripts de carga, documentação do padrão de tabelas e testes. Houve conexão ao banco apontado por `DATABASE_URL` do `.env.local`, com transação PostgreSQL **`BEGIN READ ONLY`**, consultas agregadas e `ROLLBACK`. Os números abaixo pertencem a essa conexão; não foi comprovada sua equivalência ao banco do deploy Vercel.

Foram executados **38 testes com sucesso**, em bancos isolados. Não houve homologação autenticada por navegador dos 35 itens, nem envio externo de SMS, importação governamental ou validação oficial de layout. Os testes não comprovam o funcionamento de funções ausentes. A aplicação e a população de negócio não foram alteradas nesta análise.

## 2. Matriz de atendimento

As rotas abaixo são as rotas públicas da aplicação; seus fontes ficam em `src/app/app-domain/`.

| Item | Requisito resumido | Classificação | Evidência, lacuna e condição de demonstração |
|---|---|---|---|
| 1 | Dashboard de atendimentos, eventos SCFV, encaminhamentos e benefícios por período | **Precisa Desenvolver** | `/social` tem totais de famílias, unidades, atendimentos e concessões/entregas. O período é fixo no mês atual. Faltam seleção de período, eventos SCFV e encaminhamentos. |
| 2 | Emissão do relatório do dashboard | **Precisa Desenvolver** | Não há emissão consolidada do painel. Comprovantes individuais de benefício e encaminhamento não atendem a esse relatório. |
| 3 | Unidade com CNPJ, razão social, IE, tipo, número, telefone, responsável e endereço | **Precisa Desenvolver** | `/social/unidades` cadastra nome, tipo, identificação, contato, responsável, endereço textual, patrimônio e coordenadas. Faltam CNPJ, razão social e inscrição estadual vinculados ao equipamento. Cadastro da instituição/PJ não supre a ausência de vínculo por unidade. |
| 4 | Cadastro da função do profissional | **Funcional** | `/administracao/cargos/novo` cadastra Cargo/Função em `Role`, com descrição e nível; existem 42 cargos na base. A descrição de cargo do vínculo SUAS é texto livre, sem associação direta desse campo ao catálogo `Role`. |
| 5 | Profissional com dados pessoais, documentos, unidade, função e registro | **Precisa Desenvolver** | Há pessoa física, servidor, matrícula/cargo e `/social/profissionais` para vínculo e acesso. Falta completar a ficha exigida e integrar o registro profissional específico ao SUAS. Matrícula administrativa não comprova registro em conselho. Nenhum vínculo SUAS está populado. |
| 6 | Beneficiário com todos os campos e histórico de programas/benefícios | **Precisa Desenvolver** | Pessoa física e perfil social cobrem parte dos dados. Religião e certidão não possuem ficha estruturada identificada; naturalidade, RG e pai presentes no modelo de pessoa não estão disponíveis no formulário novo inspecionado. Falta gestão completa dos vínculos a programas com inclusão, desligamento, valor e número de benefício. |
| 7 | Família e membros com os mesmos dados, parentesco SUAS e programas | **Precisa Desenvolver** | `/social/familias` grava responsável, código, NIS, renda e vulnerabilidade. Existe composição no cadastro compartilhado e tabela de parentesco, mas o fluxo Social não oferece todos os dados e vínculos exigidos. As 10 famílias de demonstração não têm vínculo com a família canônica. |
| 8 | Benefício com nome e esfera federal, estadual ou municipal | **Precisa Desenvolver** | A esfera existe em `SocialProgram` e no formulário de programas. `SocialBenefit` e seu formulário não têm esfera. Programa e benefício são cadastros distintos. |
| 9 | Cadastro de despesa | **Funcional** | Há lançamento de renda/despesa por competência no prontuário individual e despesa opcional vinculada ao cadastro de benefício/programa. O primeiro depende do catálogo `EXPENSE`, hoje vazio. O segundo grava `Expense` por integração interna legada; não executa, por si só, o ciclo contábil completo. |
| 10 | Cadastro de encaminhamento CadÚnico | **Funcional** | `/social/encaminhamentos` tem ações explícitas para cadastrar destino `CADUNICO` e encaminhar pessoa/família. É registro municipal; não transmite ao governo federal. Para a POC é preciso cadastrar destino e motivo, ausentes hoje. |
| 11 | Cadastro dos benefícios eventuais da Secretaria | **Funcional** | `/social/beneficios` permite cadastrar benefícios; `/social/requisicoes` configura quantidade/valor, aprovação, autorizador e cotas. Há quatro tipos cadastrados. A completude do catálogo municipal depende da relação de benefícios adotada pela Secretaria. |
| 12 | Solicitação com unidade, profissional, data, família/indivíduo, solicitante, usufrutuário, justificativa, itens e entrega | **Precisa Desenvolver** | O fluxo atual grava unidade, família, justificativa, itens/quantidades/valores e usuário/data automáticos. Não oferece seleção de indivíduo, solicitante e usufrutuário distintos, profissional do atendimento separado do usuário, data informada e modalidade de entrega. `personId` existe na tabela, mas não é preenchido pela action de solicitação. |
| 13 | Aprovação com dados da solicitação e deferimento, indeferimento ou cancelamento | **Funcional** | Reutiliza solicitação persistida e permite autorizar/negar item, registrar parecer e cancelar requisição sem entrega. Auditoria e controle de autorizador estão implementados. Para demonstrar, criar vínculos vigentes e solicitações; a solicitação individual completa depende da correção do item 12. |
| 14 | Entrega com data informada e histórico por família/indivíduo | **Precisa Desenvolver** | A entrega baixa estoque/cota e registra responsável, motivo e data/hora do servidor. Há consulta por família e comprovante. Falta informar a data efetiva e atender ao fluxo individual. A action não recebe data de entrega. |
| 15 | Relatório periódico de profissionais, famílias e benefícios | **Precisa Desenvolver** | Não foi localizado relatório operacional com esse conjunto e recorte temporal. Listagens avulsas e comprovantes não o substituem. |
| 16 | Prontuário SUAS conforme recomendações CadÚnico | **Precisa Desenvolver** | Existem atendimentos, sigilo, fatos sociais e lançamentos socioeconômicos. Não foi identificado prontuário completo com todos os blocos exigidos e correspondência oficial demonstrada. A própria consulta local informa que não emite RMA oficial. Modelos PAF/PIA são preenchimento temporário para impressão. |
| 17 | Descumprimento Bolsa Família: tipo, data, efeito e suspensão | **Precisa Desenvolver** | Não há fluxo ou estrutura específica identificada para condicionalidades, efeitos e suspensão. Relato livre de atendimento não supre o requisito. |
| 18 | Encaminhamento com profissional, origem/destino, data, tipo, status, motivo e beneficiário | **Precisa Desenvolver** | Existe referência/contrarreferência, origem, destino da rede, pessoa/família, motivo, data e profissional de referência no destino. Faltam profissional do atendimento explicitamente vinculado e classificação própria de tipo de encaminhamento; origem/destino não são duas referências homogêneas a unidades SUAS. |
| 19 | Relatório de encaminhamentos por período, unidade e tipo | **Precisa Desenvolver** | Há busca e comprovante individual. Falta emissão com os três filtros e classificação por tipo. |
| 20 | Relatório de famílias acompanhadas | **Precisa Desenvolver** | Não há emissão específica nem ciclo estruturado de acompanhamento familiar suficiente para esse relatório. Família ativa não equivale a família em acompanhamento. |
| 21 | Agendamento de visita à família | **Precisa Desenvolver** | `/social/visitas` consulta visitas existentes. O botão “Agendar visita” não tem action, evento ou navegação; não há cadastro operacional conectado. |
| 22 | Registro de visita realizada | **Precisa Desenvolver** | A tabela tem `realizedDate` e `report`, mas a interface consultada só exibe dados agendados e objetivo. Falta gravar realização, relatório e conclusão. |
| 23 | SMS de condicionalidades e recadastramento para beneficiários | **Precisa Desenvolver** | Não foi localizado fluxo SMS Social, segmentação por programa, calendário, fila ou retorno de entrega. Exige implementação e provedor externo para envio real. |
| 24 | SCFV com serviço, equipe, unidade, faixa etária, datas, dias e horários | **Precisa Desenvolver** | Existe um programa chamado “Convivência e fortalecimento de vínculos”, mas não cadastro operacional de SCFV com os campos exigidos. |
| 25 | Matrícula do beneficiário no SCFV | **Precisa Desenvolver** | A tabela física `SocialProgramParticipation` tem 10 participações familiares genéricas, sem consumidores operacionais encontrados em `src`. Não equivale a matrícula individual em SCFV. |
| 26 | Evento SCFV com planejamento, presença, relatório, fotos e anexos | **Precisa Desenvolver** | Não há fluxo de evento/presença SCFV. GED e armazenamento compartilhado podem ser reaproveitados, mas não estão integrados a essa operação. |
| 27 | Relatório de matriculados por SCFV e datas | **Precisa Desenvolver** | Depende de matrícula SCFV e emissão ainda ausentes. |
| 28 | Relatório de frequência por SCFV e período | **Precisa Desenvolver** | Depende de eventos/chamada/presença e emissão ainda ausentes. |
| 29 | Frota Social com todos os campos documentais do veículo | **Precisa Desenvolver** | Módulo Frotas oferece placa, RENAVAM, marca, modelo, um campo de ano, categoria, cor, combustível e obrigações de licenciamento. Faltam RNTRC e separação explícita de ano de fabricação/ano-modelo. Há um veículo vinculado à Assistência Social. |
| 30 | Motorista com nome, primeira habilitação, vencimento, categoria e CNH | **Precisa Desenvolver** | `/frotas/gestao?area=motoristas` grava identidade, CNH, categorias e validade. Falta data da primeira habilitação no formulário e modelo operacional. A tabela está vazia. |
| 31 | Reserva de veículo com data e hora | **Funcional** | `/frotas/gestao?area=agenda` cadastra veículo, início/fim e finalidade; bloqueia conflito, permite cancelamento e reprogramação com histórico. Os testes isolados de controle confirmaram persistência e concorrência. Não há reservas na base; viagem exige motorista identificado. |
| 32 | Formulário configurável com textos, checkbox, única e múltiplas escolhas | **Precisa Desenvolver** | `/social/modelos` usa modelos fixos e estado temporário no navegador; não cria questionários nem armazena respostas. Há questionários em Saúde/SST, mas não integrados à operação socioassistencial de famílias/beneficiários. |
| 33 | Prestação de contas com todos os blocos CRAS/CREAS | **Precisa Desenvolver** | Não há agregação/emissão com todos os blocos. `SuasProntuarioRma` é registro local simplificado de consulta; não comprova RMA nem prestação de contas oficial. O layout de prestação a ser aceito deve ser definido com a Secretaria. |
| 34 | Relatório de beneficiários por faixa etária | **Precisa Desenvolver** | Existem datas de nascimento, mas falta relatório com universo de beneficiários definido, faixas e data de referência. A listagem de pessoas inclui o cadastro geral, não apenas beneficiários sociais. |
| 35 | Importação de arquivo federal CadÚnico | **Precisa Desenvolver** | `queryCadUnicoMds` faz apenas SELECT em `CadUnicoRecord`; não chama serviço federal nem importa arquivo. Faltam upload, parser de layout versionado, validação, conciliação pessoa/família, lote, rejeições e reprocessamento sem duplicidade. |

## 3. População efetivamente consultada

Consulta agregada em **01/11/2026, 16:51 UTC**, sem extração de dados pessoais.

| Estrutura | Quantidade | Avaliação para demonstração |
|---|---:|---|
| `SocialUnit` | 2 | Um CRAS e um CREAS; ambos com telefone, gestor e endereço textual, sem código de identificação e sem `addressId`. |
| `SocialFamily` | 10 | Todas ativas; todas sem NIS, endereço familiar vinculado e `masterFamilyId`. |
| `SocialFamilyMember` | 10 | Um filho por família, além do responsável informado no cadastro familiar. |
| `Family` / `FamilyMember` | 0 / 0 | Base familiar canônica não reconciliada com Social. |
| `SocialPersonProfile` | 10 | Todos sem NIS. |
| Pessoas envolvidas nas famílias sociais | 20 | Todas com CPF, nascimento e telefone; nenhuma com nacionalidade, naturalidade, mãe, pai, RG, raça/cor ou estado civil preenchidos. |
| `SocialProfessionalLink` | 0 | Bloqueia operação dos profissionais comuns e a validação do autorizador das solicitações existentes no catálogo. |
| `SocialAttendance` | 10 | Todos PAIF e datados em 10/10/2026; zero no mês atual, novembro/2026. Relatos sem variedade operacional. |
| `SocialBenefit` | 4 | Cesta de alimentos, passagem, natalidade e apoio habitacional; todos por quantidade e com aprovação exigida. |
| `SocialBenefitRequest` / itens / concessões | 0 / 0 / 0 | Nenhuma trilha de solicitação, avaliação ou entrega demonstrável. |
| Estoques / movimentos / cotas | 0 / 0 / 0 | Benefício material não pode ser entregue sem abastecimento. |
| `SocialCatalogEntry` / `SocialMinimumWage` | 0 / 0 | Sem motivos, classificações e vigências para operação dos fluxos dependentes. |
| `SocialNetworkOrganization` / `SocialReferral` | 2 / 0 | Destinos comunitários genéricos; nenhum tipo `CADUNICO` e nenhum encaminhamento. |
| `SocialVisit` | 5 | Visitas agendadas para 03 a 07/11/2026, sem fluxo de cadastro/conclusão ligado à interface. |
| `SocialProgram` / `SocialProgramParticipation` | 2 / 10 | Programas e participações genéricos; não há jornada operacional SCFV correspondente. |
| `SocialRecord` | 10 | Históricos textuais físicos sem consumidores operacionais encontrados em `src`; não confundir com prontuário completo. |
| `SocialPersonFact` / `SocialFinancialEntry` | 0 / 0 | Sem histórico socioeconômico evolutivo. |
| `CadUnicoRecord` / `SuasProntuarioRma` | 0 / 0 | Consulta local CadÚnico não tem dados para retornar. |
| `Role` / `Employee` | 42 / 198 | Cadastros gerais existentes não equivalem a equipe com vínculo SUAS vigente. |
| `FleetUnit` | 30 | Inclui máquinas/equipamentos. Uma unidade veicular está na Secretaria de Assistência Social, com placa e RENAVAM. |
| `FleetDriver` / `FleetBooking` | 0 / 0 | Sem motorista e reserva preparados. |
| `BudgetAppropriation` / `Expense` | 45 / 0 | Há dotações para seleção; sem despesa legada demonstrativa cadastrada. |

### Incoerências verificadas

1. **Renda por pessoa divergente em 10 de 10 famílias.** A carga divide renda por três, mas a composição registrada contém responsável e um filho. A consulta comparou a renda com `1 + quantidade de SocialFamilyMember`.
2. **Famílias fora do cadastro canônico.** As actions atuais criam/reconciliam `Family`, mas a carga existente deixou `masterFamilyId` nulo nas dez famílias e nenhuma família canônica. A integração interna não pode ser demonstrada com essa população sem reconciliação.
3. **Autorizadores sem vínculo.** Os quatro benefícios exigem aprovação e têm autorizador configurado; a solicitação verifica vínculo vigente do autorizador no equipamento. Como não há `SocialProfessionalLink`, a solicitação não passa nessa validação, inclusive quando iniciada por administrador.
4. **Painel sem produção corrente.** O dashboard fixa o mês do relógio do servidor; a população só tem atendimentos em outubro, resultando em zero atendimentos em novembro.
5. **Endereço da visita não utiliza o endereço pessoal como fallback.** A consulta usa `SocialFamily.addressId`, vazio nas famílias. Endereços existentes em `Address.personId` não resolvem esse caminho; a tela tende a apresentar “Endereço não cadastrado”.

### Preparação mínima proposta para uma POC realista

Esta é uma sugestão de volume de demonstração, não uma exigência normativa: 25 a 40 famílias com composições variadas e reconciliadas; cadastros pessoais completos; equipe com vínculos vigentes em CRAS/CREAS; catálogos e motivos preenchidos; histórico distribuído por vários meses; solicitações pendentes, deferidas, indeferidas, canceladas e entregues; estoque e movimentos coerentes; encaminhamentos com e sem retorno; visitas agendadas, realizadas e canceladas; motorista e reservas sem conflito.

Para os itens ainda ausentes, a carga depende primeiro de desenvolvimento: SCFV com turmas, matrículas, eventos, chamadas e anexos; condicionalidades e seus efeitos; questionários respondidos; lotes de importação com aceitos e rejeitados; mensagens com retorno de entrega. A população deve ser sintética, identificada como demonstração e internamente coerente.

## 4. Padrão oficial de tabelas

### 4.1 Padrão de interface do projeto

Referência: `docs/Padrão de Tabelas.md`, versão 1.2, 29/10/2026. Exige 20 registros por página, uma linha visual por célula, detalhes para conteúdo excedente, redimensionamento, filtro compacto, paginação visível e menu recolhido para ícones; sem rolagem desktop/notebook, com exceção de tablet/celular.

**Aderência estrutural identificada:** atendimentos, configurações, encaminhamentos/rede, famílias, prontuários individuais, profissionais, prontuário, requisições/estoque/cotas, unidades e visitas utilizam `SocialOperationalList`, que delega a `OperationalTable`, `OperationalListFrame` e paginação comum. A grade de itens da requisição também utiliza o componente oficial. A listagem principal de Frotas usa os mesmos componentes.

**Pendências concretas:**

- `/social/beneficios`: duas listas `<ul>` com `.map` integral, sem paginação e sem componente operacional. Por serem listagens de cadastro, entram no escopo do padrão.
- `/frotas/gestao`: motoristas, agenda e fichas complementares são apresentados por cartões `<article>`, filtros extensos e `ErpPagination`; não usam a composição oficial de tabela operacional. Ter página de 20 registros não cumpre os demais requisitos.
- `/social/encaminhamentos`: faixa adicional de atalhos fora da toolbar compacta merece adequação ao contrato de faixa intermediária única.
- A homologação visual das telas reais, com 21+ registros, arraste, foco, zoom e diferentes viewports, não foi executada nesta análise. O documento histórico `docs/tabelas-lotes/social-educacao-publico.md` também distingue implementação estática de homologação visual Social.

**Conclusão de interface:** boa base de padronização nas listagens principais; não cabe declarar que todas as telas envolvidas estão 100% no padrão.

### 4.2 Estrutura de banco e padrões governamentais

O banco tem tabelas relacionais persistentes e **47 constraints de chave estrangeira** nas tabelas `Social%`. Isso é evidência de integridade estrutural, não de conformidade SUAS/CadÚnico/RMA.

Foram identificados campos ausentes, dados não reconciliados e tabelas físicas sem operação conectada. Valores monetários de solicitações, movimentos e lançamentos sociais usam `numeric`/Decimal, enquanto renda familiar, renda per capita e concessão legada ainda usam `double precision`; a despesa legada também conserva Float. Não foi feita certificação integral de tipos/constraints de todos os módulos.

Não foi identificado mapeamento completo e versionado dos blocos oficiais do prontuário, prestação de contas/RMA ou arquivo federal CadÚnico. Os modelos `POC-1.0` são adaptações e a própria interface os identifica como demonstrativos. O campo `includeInRma` do vínculo não implementa, sozinho, a emissão oficial.

O [portal oficial CadÚnico do MDS](https://www.gov.br/mds/pt-br/acoes-e-programas/cadastro-unico), consultado nesta análise, descreve CPF como chave principal, composição familiar, identificação individual, domicílio, escolaridade, trabalho e renda. A base local reduzida não demonstra essa abrangência.

A tentativa de consulta ao portal legado de Vigilância (`https://aplicacoes.mds.gov.br/snas/vigilancia/index2.php`) foi redirecionada para aviso de indisponibilidade do MDS. Assim, não foi possível conferir por esse canal os layouts oficiais vigentes de RMA/prontuário. É necessário obter os documentos e a amostra de arquivo efetivamente aceitos pela gestão, com versão e dicionário. Essa limitação não altera a constatação de ausência dos fluxos locais.

## 5. Integrações necessárias

| Integração | Situação atual | Necessidade para testar |
|---|---|---|
| Pessoas, documentos, servidores e cargos → SUAS | Estruturas e caminhos parciais existentes | Completar ficha/registro profissional, cadastrar vínculos vigentes e associar usuário ao servidor. O “Cadastro Único” interno do sistema não é a base federal CadÚnico. |
| Família canônica → Social | Actions atuais preveem `Family` e `masterFamilyId` | Reconciliar as dez famílias e a composição; conferir responsável, parentesco, renda e endereço. |
| Aprovação, estoque e cotas | Fluxo transacional implementado e testado isoladamente | Preparar autorizadores vigentes, entradas e solicitações em estados diferentes. Não exige serviço externo. |
| Encaminhamento ao posto CadÚnico | Registro interno implementado | Cadastrar destino e motivos; simular retorno pela própria interface. Não depende de API federal para esse item. |
| Despesa Social → Finanças | Gravação legada `Expense` existente | Selecionar secretaria/dotação e demonstrar persistência. Para apresentar empenho, liquidação, pagamento e prestação integrados, desenvolver/validar ponte com o ciclo financeiro atual. |
| Frota → pessoa/servidor/departamento | Implementada para veículo, motorista e agenda | Preparar motorista da Secretaria e reservas. Complementar os campos dos itens 29/30. Não exige consulta DETRAN/RNTRC para cadastro manual. |
| SCFV → famílias/pessoas/profissionais/GED | Não implementada como jornada SCFV | Desenvolver serviço/grupo, matrícula, evento e chamada; reaproveitar armazenamento e GED para fotos/anexos. |
| SMS → operadora/provedor | Fluxo Social não localizado | Desenvolver seleção por programa, prazos, fila, integração de envio e retorno de entrega. Sandbox prova integração; recebimento real depende de provedor e destino habilitados. |
| CadÚnico federal → importação | Ausente; consulta atual é apenas local | Obter arquivo/dicionário oficial da versão adotada e desenvolver importador. Importação de arquivo disponibilizado não exige API ao vivo; consulta/sincronização externa é uma integração adicional. |
| SUAS/RMA/prestação de contas | Sem emissão completa localizada | Desenvolver agregações e relatórios conforme layout aceito. Emissão local pode ser testada sem transmissão; eventual envio ao governo exige contrato/canal próprio, não demonstrado aqui. |
| Saúde/Educação/Bolsa Família → condicionalidades | Sem fluxo Social integrado identificado | Desenvolver prazos, ocorrência, efeito e suspensão. Pode ser demonstrado com registro manual sintético; sincronização automática exige fonte e mapeamento adicionais. |

## 6. Evidências principais no código

| Evidência | Local |
|---|---|
| Painel com mês fixo e quatro indicadores | `src/app/app-domain/social/page.tsx:12-15,23-75`; `src/db/repositories/social/queries.ts:147-156` |
| Unidade sem campos fiscais exigidos | `src/db/schema/social.ts:21-25`; `src/app/app-domain/social/unidades/UnidadesClient.tsx:11-33` |
| Cargo/função persistente | `src/app/app-domain/administracao/cargos/actions.ts:11-31` |
| Servidor com pessoa canônica e matrícula | `src/app/app-domain/administracao/servidores/novo/NovoServidorForm.tsx:44-80` |
| Vínculo SUAS e ausência de registro em conselho | `src/db/schema/social.ts:53-57`; `src/app/app-domain/social/profissionais/SocialProfessionalsClient.tsx:45-52` |
| Pessoa física: formulário limitado e schema mais amplo | `src/app/app-domain/cadastros/pessoas-fisicas/novo/page.tsx:14-30`; `src/db/schema/people.ts` |
| Família canônica na action atual | `src/db/repositories/social/operations.ts:28-53` |
| Benefícios em listas não padronizadas e esfera apenas em programas | `src/app/app-domain/social/beneficios/BeneficiosClient.tsx:88-150,232-240` |
| Despesa opcional e compatibilidade financeira legada | `src/app/app-domain/social/actions.ts:181-209`; `src/lib/financeiro/legacy-expense.ts` |
| Solicitação sem indivíduo e exigência de autorizador vigente | `src/app/app-domain/social/requisicoes/actions.ts:86-110` |
| Aprovar/negar, entregar e cancelar | `src/app/app-domain/social/requisicoes/actions.ts:123-175`; `src/db/repositories/social/benefit-delivery.ts` |
| Encaminhamento municipal e campos enviados | `src/app/app-domain/social/encaminhamentos/ReferralClient.tsx:48-68`; `encaminhamentos/actions.ts:44-62` |
| Visitas sem mutação ligada ao botão | `src/app/app-domain/social/visitas/page.tsx:24-26`; `visitas/VisitasClient.tsx` |
| CadÚnico apenas SELECT local | `src/lib/social/social-engine.ts:19-27` |
| RMA explicitamente local, sem emissão oficial | `src/app/app-domain/social/prontuario/ProntuarioClient.tsx:94-105` |
| Modelos fixos sem persistência | `src/app/app-domain/social/modelos/SocialModelsClient.tsx:10-23` |
| Campos do veículo e motorista | `src/db/schema/fleet.ts:20-22,59-64`; `src/app/app-domain/frotas/gestao/forms.ts:8-13` |
| Agenda com persistência e bloqueio de conflito | `src/lib/frotas/control-motion.ts:18-35` |
| Padrão compartilhado Social | `src/app/app-domain/social/OperationalList.tsx`; `src/components/app-ui/operational/modules/social-educacao-publico.ts` |
| Carga sintética e renda dividida por três | `scripts/municipal-system-dataset.ts:79-83,189-194` |

As buscas abrangeram `src` para SCFV, importação CadÚnico, descumprimento, SMS, consumidores de `SocialProgramParticipation`/`SocialRecord` e relatórios sociais. Questionários encontrados em outros domínios não foram apresentados como integração Social concluída.

## 7. Testes executados

### Assistência Social — 17 passaram, zero falhas

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 "tests/social-access-policy.test.ts" "tests/social-benefit-delivery.test.ts" "tests/social-catalog-migration.test.ts" "tests/social-catalog-policy.test.ts" "tests/social-person-history.test.ts" "tests/social-referral-migration.test.ts" "tests/social-unit-input.test.ts" "src/app/app-domain/social/requisicoes/benefit-item-drafts.test.ts"
```

Cobertura efetiva: escopo/sigilo, vínculo/expediente, autorização e entrega sem dupla baixa, concorrência/rollback de estoque e cota, constraints de catálogo, datas/valores, histórico, encaminhamento/retorno e integridade dos rascunhos de itens fora da primeira página.

### Frotas — 18 + 3 passaram, zero falhas

```powershell
npm run test:frotas
node --conditions=react-server --import tsx --test "tests/fleet-control-checklist.test.ts"
```

Cobertura pertinente: persistência de frota, identidade/CNH, agenda, conflito concorrente, escopo por departamento, reprogramação/cancelamento presentes no código e relatórios de Frota. A existência desses relatórios não atende aos relatórios sociais ausentes.

As fixtures criam bancos isolados; seus dados não fazem parte da população de demonstração consultada. Nenhum teste torna funcional um campo ausente, como primeira habilitação ou RNTRC. Não foi executado build nesta análise documental; não houve alteração de código da aplicação nem commit/deploy.

## 8. Ordem recomendada de adequação

1. **Desbloquear e reconciliar dados existentes:** vínculos/usuários/autorizadores, catálogos, endereço familiar, composição canônica, renda per capita, estoque e casos de solicitação. Resolve preparação de POC e permite validar os fluxos reaproveitados.
2. **Completar o núcleo cadastral e de benefícios:** itens 3, 5–8, 12, 14, 16 e 18, incluindo distinção entre solicitante, usufrutuário, indivíduo e família.
3. **Implementar visita ponta a ponta:** agendar, realizar, concluir e consultar histórico, itens 21/22.
4. **Implementar SCFV completo:** itens 24–28; base para o dashboard, frequência e relatórios de acompanhamento.
5. **Entregar relatórios a partir de operações consistentes:** itens 1/2, 15, 19/20, 27/28, 33/34. Definir layouts e regras de contagem antes de homologar.
6. **Implementar condicionalidades, questionários e importador:** itens 17, 32 e 35; integrar SMS no item 23.
7. **Completar Frota Social e padronização de interface:** campos 29/30, cartões de gestão e listas de benefícios; homologar as páginas reais no padrão oficial com 21+ registros e perfis distintos.

**Decisão para apresentação:** demonstrar hoje apenas um recorte previamente preparado das funções existentes. A lista integral de 35 requisitos requer desenvolvimento e nova homologação ponta a ponta antes de ser apresentada como atendida.
