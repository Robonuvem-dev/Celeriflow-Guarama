# Dicionário do conjunto municipal verossímil

## 1. Narrativa e identificação

Reutilizar a instituição e as unidades existentes de Aurora das Veredas/MG. O conjunto novo deve parecer uma sequência normal de trabalho municipal: cidadãos procuram serviços, empresas fornecem produtos, servidores atendem, documentos tramitam e os fatos se refletem nos relatórios.

O manifesto técnico identifica a origem fictícia. Nomes, descrições, matrículas e inscrições apresentados não recebem marcadores de demonstração. Exemplos deste documento são especificações de preenchimento, não registros já gravados.

### Personagens centrais

| Pessoa | Papel principal | Vínculos que reaproveitam a mesma identidade |
| --- | --- | --- |
| João da Silva | Cidadão, contribuinte e pedreiro autônomo | Imóvel na Praça da Matriz; paciente da UBS; responsável pelo aluno Pedro; titular de água; requerimento de construção |
| Maria Aparecida dos Santos | Cidadã e comerciante | Cônjuge de João; responsável por Pedro; contribuinte; atendimento social em caso próprio |
| Pedro Henrique da Silva | Aluno, nascido em 2016 | Responsáveis João e Maria; matrícula; biblioteca; transporte escolar; paciente |
| Ana Clara dos Santos | Aluna, nascida em 2014 | Responsável Maria; matrícula em outra turma; notas; oficina cultural; vacinação |
| José Antônio Pereira | Aposentado, nascido em 1953 | Paciente acompanhado; imóvel; benefício tributário com critério registrado; transporte TFD |
| Ana Paula Ribeiro | Servidora administrativa | Matrícula `003147`; contrato; ponto; férias; contracheque; atendimento e protocolo |
| Carlos Eduardo Moreira | Professor | Vínculo funcional; escola; turma; diário; notas; frequência |
| Mariana Lopes de Almeida | Enfermeira | Vínculo funcional; unidade de saúde; agenda; atendimento; vacinação |
| Renata Barbosa Ferreira | Médica do trabalho | Vínculo profissional; agenda SST; exame; ASO; restrição e encaminhamento |
| Roberto Henrique Martins | Engenheiro civil | Servidor de Obras; equipe; medição; análise e vistoria de construção |
| Helena Cristina Duarte | Contadora | Perfil financeiro; lançamentos, conciliação, fechamento e controle interno |
| Beatriz Oliveira Costa | Assistente social | CRAS; visitas; acompanhamento; concessão de benefício e relatório |

Antes de inserir qualquer personagem, resolver pessoa por documento e vínculos existentes. Se o conjunto atual já tiver uma identidade adequada, reutilizá-la e adaptar o caso; não renomear indiscriminadamente um cidadão/servidor cadastrado para forçar a lista acima.

### Endereços

| Logradouro | Número | Bairro | Uso |
| --- | ---: | --- | --- |
| Praça da Matriz | 100 | Centro | Residência e imóvel do caso João da Silva |
| Rua das Acácias | 245 | Jardim das Acácias | Residência familiar e visita social |
| Avenida do Ipê | 850 | Vale Verde | Comércio e cadastro econômico |
| Rua das Nascentes | 320 | Nova Aurora | Obra e ordem de serviço |
| Rua da Estação | 75 | Centro | Escola e evento cultural |
| Alameda dos Cedros | 410 | Boa Vista | Unidade de saúde e referência territorial |
| Rua São José | 68 | Vila Esperança | Leitura de água e atendimento |
| Avenida das Palmeiras | 1200 | Parque das Veredas | Depósito, fornecedor e recebimento |

Validar vínculos entre `Address`, `Street`, `Neighborhood`, imóvel e cadastro territorial. O município narrativo não deve receber um código IBGE oficial inventado: reutilizar o código/configuração de localidade compatível com o ambiente e manter a distinção técnica quando o domínio exigir município oficial.

### Empresas por atividade

| Empresa | Atividade e fluxos |
| --- | --- |
| Veredas Papelaria e Suprimentos Ltda. | Cotação, licitação, contrato, materiais de expediente, recebimento e pagamento |
| Serra Clara Tecnologia Ltda. | Equipamentos de informática, patrimônio e manutenção |
| Horizonte Construções e Serviços Ltda. | Obra, contrato, medição, retenções, pagamento e licença |
| Vale Verde Alimentos Ltda. | Merenda, recebimento por lote, estoque e consumo |
| Aurora Produtos Hospitalares Ltda. | Medicamentos, notas de entrada, lotes, farmácia e dispensação |
| Caminhos Transportes Ltda. | Transporte escolar e TFD, viagens e notas de serviço |
| Planalto Autopeças Ltda. | Manutenção da frota, requisição de peça e faturamento |
| Acácias Serviços de Limpeza Ltda. | Contrato continuado, medição mensal e retenção |
| Verdejar Gestão Ambiental Ltda. | Licenciamento, fiscalização e movimentação de recicláveis |
| Boa Vista Confecções Ltda. | Uniformes, demanda escolar, compra e distribuição |
| Cooperativa de Crédito Vale das Veredas | Instituição fictícia para DES-IF, agências, COSIF/PGCC e apuração |
| Banco Regional das Nascentes S.A. | Segunda instituição fictícia para variação dos relatórios bancários |

As 20 empresas já existentes têm prioridade de reaproveitamento. Completar para ao menos 30 empresas compatíveis e incluir os segmentos que faltarem. Não associar os nomes bancários fictícios a uma instituição real por meio de código de instituição financeira que não lhes pertence.

## 2. Documentos, contatos e códigos

- **CPF:** base numérica gerada e dígitos verificadores calculados. Exemplo de formato válido calculado para o plano: `100.100.010-26`; a aparência `100.100.010-10` citada no pedido não será copiada com dígitos incompatíveis. Todos os campos relacionados reutilizam o documento canônico.
- **CNPJ:** gerar raiz/estabelecimento e calcular dígitos; conferir unicidade na base antes de atribuir à empresa. Não distribuir um mesmo CNPJ entre fornecedores distintos.
- **Outros identificadores:** CNS, PIS/NIS, RENAVAM, placas, chassi, registros profissionais e códigos de produto devem seguir o validador de seu domínio. Formato verossímil e dígito correto não significam inscrição em base oficial.
- **Contato:** nomes de usuário como `joao.silva`, `ana.ribeiro` e `compras`; e-mails cadastrais em domínio reservado, por exemplo `joao.silva@auroradasveredas.example`. Logins reutilizam o e-mail realmente provisionado no provedor e não são renomeados apenas para acompanhar o cadastro.
- **Telefone:** DDD compatível com a narrativa, formato brasileiro e consistência entre cadastros; os casos de comunicação usam os canais configurados pelo sistema.
- **Matrícula funcional:** seis dígitos, como `003147`; gerar pelo sequenciador quando houver.
- **Protocolo/documento:** numeração normal do módulo, como `000128/2026`, mantendo unicidade por ente, tipo e exercício.
- **Inscrição imobiliária:** por setores/quadras/lotes, como `02.01.00124.001`; usar o gerador/parametrização cadastral existente.
- **ID técnico:** utilizar os IDs dos serviços e uma chave estável de caso no manifesto para repetição. Não depender de um prefixo que apareça em PDFs ou tabelas.

## 3. Cronologia

| Período | Conteúdo |
| --- | --- |
| Janeiro a julho/2026 | Contratos, vigências, saldos de abertura e eventos necessários aos históricos |
| Agosto a outubro/2026 | Séries mensais completas, folhas, arrecadação, atendimentos e movimentações concluídas |
| 01 a 08/11/2026 | Registros já realizados até a data de referência |
| Após 08/11/2026 | Agendas, entregas, visitas e eventos ainda programados |
| Exercício 2027 | Planejamento, programação e cenário específico de transporte/abertura de exercício |

Admissão antecede ponto e folha; nascimento é compatível com matrícula/parentesco; atendimento antecede receita/dispensação; empenho antecede liquidação/pagamento; emissão antecede vencimento; medição ocorre dentro do contrato; documento de origem antecede revisão. Usar datas civis e horário de Brasília conforme os contratos do projeto.

## 4. Valores de referência dos casos integrados

### Compra de papel A4

- Solicitação: **100 resmas**, unidade de medida RESMA, preço negociado **R$ 28,00** por resma.
- Documento/contrato: **R$ 2.800,00**; três cotações diferentes para a pesquisa de preços.
- Primeiro recebimento: 60 resmas, **R$ 1.680,00**; segundo: 40 resmas, **R$ 1.120,00**.
- Liquidação e pagamento acompanham os recebimentos; requisição interna consome 15 resmas e devolução retorna 2, levando a 87 resmas se não houver outros movimentos no caso.
- Conciliar essas quantidades no recorte do caso; não substituir o saldo global do material caso já existam movimentos de outros processos.

### IPTU do imóvel da Praça da Matriz

- Valor venal de referência: **R$ 120.000,00**, parâmetro de cálculo **0,50%**, principal **R$ 600,00**.
- O caso pago gera guia, baixa, receita e lançamentos contábeis correspondentes.
- Um segundo contribuinte permanece com guia em aberto; outro recebe parcelamento; um quarto percorre dívida ativa. Não levar o mesmo débito integralmente quitado a uma cobrança em aberto.
- A alíquota é parâmetro do cenário municipal fictício; conferir o motor e os catálogos vigentes antes de executar.

### Saúde e assistência

- Paciente João é acolhido, atendido e tem receita compatível com o prontuário; dispensação reduz o lote efetivamente selecionado.
- José tem encaminhamento e autorização vinculados ao transporte TFD; ida/retorno possuem datas, acompanhante quando necessário e veículo com capacidade.
- Família de Maria tem composição, renda e critério de benefício coerentes. A soma das rendas e a renda per capita devem bater com o número de integrantes considerado pelo serviço.

## 5. Variação para apresentação

Preparar registros com acentos, sobrenomes compostos, logradouros extensos, endereços rurais quando suportados, empresas de segmentos diferentes e itens com descrições longas. As listagens principais precisam ter 21 ou mais resultados **elegíveis ao mesmo perfil/filtro**, sem duplicar pessoas para completar páginas.

Cada documento deve conter assunto específico, parte interessada, responsável e justificativa contextualizada. Modelos e parâmetros singleton não são repetidos 21 vezes; sua demonstração vem dos casos que os utilizam.

## 6. Manifesto dos casos a produzir

O recibo de cada caso deve registrar: versão da carga, ID do fluxo, pacote, chave estável, ator, pessoa/empresa, unidade/ente, IDs gerados/reutilizados, datas, documentos, tabelas atingidas e resultados de reconciliação. Registrar a origem fictícia nesse manifesto e na auditoria técnica. As rotas dinâmicas devem receber os IDs do recibo antes da validação de navegador.
