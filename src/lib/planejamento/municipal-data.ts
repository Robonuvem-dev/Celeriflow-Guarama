/** Municipal reference data. Load only into the explicitly configured isolated database. */
export const municipalReference = {
  name: "Vila das Araucárias",
  state: "PR",
  entities: [
    { code: "PMVA", name: "Prefeitura Municipal de Vila das Araucárias", type: "PREFEITURA", jurisdiction: "EXECUTIVE" as const },
    { code: "CMVA", name: "Câmara Municipal de Vila das Araucárias", type: "CAMARA", jurisdiction: "LEGISLATIVE" as const },
  ],
  units: [
    { code: "02.01", name: "Secretaria Municipal de Administração e Finanças", manager: "Ana Paula Ribeiro", entity: "PMVA" },
    { code: "03.01", name: "Secretaria Municipal de Saúde", manager: "Mariana Lopes de Almeida", entity: "PMVA" },
    { code: "04.01", name: "Secretaria Municipal de Educação e Cultura", manager: "Carlos Eduardo Moreira", entity: "PMVA" },
    { code: "05.01", name: "Secretaria Municipal de Obras e Serviços Urbanos", manager: "Roberto Henrique Martins", entity: "PMVA" },
    { code: "01.01", name: "Câmara Municipal", manager: "Helena Cristina Duarte", entity: "CMVA" },
  ],
  councilors: [
    { name: "Helena Cristina Duarte", parliamentary: "Helena Duarte", party: "MDB", advisor: "Beatriz Oliveira Santos" },
    { name: "João Henrique da Silva", parliamentary: "João da Silva", party: "PSD", advisor: "Rafael Augusto Pereira" },
    { name: "Luciana Ferreira Costa", parliamentary: "Luciana Costa", party: "UNIÃO", advisor: "Camila Rodrigues Almeida" },
    { name: "Paulo Roberto Nogueira", parliamentary: "Paulo Nogueira", party: "PP", advisor: "Bruno Henrique Fernandes" },
    { name: "Maria Clara dos Santos", parliamentary: "Maria Clara", party: "PT", advisor: "Juliana Carvalho Mendes" },
    { name: "André Luiz Barros", parliamentary: "André Barros", party: "REPUBLICANOS", advisor: "Eduardo Vieira Lima" },
    { name: "Renata Aparecida Martins", parliamentary: "Renata Martins", party: "PSDB", advisor: "Patrícia Azevedo Rocha" },
    { name: "Fernando José Ribeiro", parliamentary: "Fernando Ribeiro", party: "PDT", advisor: "Gabriel Moraes Teixeira" },
    { name: "Sérgio Antônio de Oliveira", parliamentary: "Sérgio Oliveira", party: "PODE", advisor: "Larissa Gomes Batista" },
  ],
  programs: [
    { code: "0001", name: "Gestão Legislativa e Participação Cidadã", unit: "01.01", actionCode: "2001", action: "Manutenção das atividades legislativas", product: "Sessões realizadas", productUnit: "sessões", target: "48", value: "2450000.00", functionCode: "01", subfunctionCode: "031", audience: "Cidadãos, vereadores e servidores do Legislativo", manager: "Helena Cristina Duarte" },
    { code: "0002", name: "Gestão Pública Eficiente e Transparente", unit: "02.01", actionCode: "2002", action: "Modernização dos serviços administrativos", product: "Serviços digitais disponibilizados", productUnit: "serviços", target: "18", value: "4200000.00", functionCode: "04", subfunctionCode: "122", audience: "População e servidores municipais", manager: "Ana Paula Ribeiro" },
    { code: "0003", name: "Saúde Perto de Você", unit: "03.01", actionCode: "2003", action: "Fortalecimento da atenção primária", product: "Atendimentos realizados", productUnit: "atendimentos", target: "26000", value: "8600000.00", functionCode: "10", subfunctionCode: "301", audience: "Famílias residentes no município", manager: "Mariana Lopes de Almeida" },
    { code: "0004", name: "Educação para o Futuro", unit: "04.01", actionCode: "2004", action: "Manutenção e qualificação do ensino fundamental", product: "Alunos atendidos", productUnit: "alunos", target: "1250", value: "7900000.00", functionCode: "12", subfunctionCode: "361", audience: "Estudantes da rede municipal e suas famílias", manager: "Carlos Eduardo Moreira" },
    { code: "0005", name: "Cidade Acessível e Bem Cuidada", unit: "05.01", actionCode: "1005", action: "Pavimentação e acessibilidade de vias urbanas", product: "Vias requalificadas", productUnit: "quilômetros", target: "4.5", value: "5300000.00", functionCode: "15", subfunctionCode: "451", audience: "Moradores dos bairros Jardim Primavera, Centro e São José", manager: "Roberto Henrique Martins" },
  ],
};
