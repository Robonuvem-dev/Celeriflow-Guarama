import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { CentralSignatureMethod } from "../../src/lib/contracts/signature-central";

const subjects = [
  ["Proposta de serviço", "Organização do arquivo administrativo", "Administração", "Digitalização e classificação de 1.200 expedientes, com índice por assunto e entrega em 30 dias.", "Valor global proposto: R$ 4.800,00. O recebimento será acompanhado pela unidade requisitante."],
  ["Ofício", "Manutenção do Centro Administrativo", "Administração", "Solicita-se a programação da revisão das instalações elétricas e da iluminação do Centro Administrativo.", "O atendimento deverá contemplar vistoria, relação de materiais e cronograma de execução."],
  ["Declaração", "Disponibilidade de sala para capacitação", "Administração", "Declara-se a disponibilidade da sala de reuniões do Centro Administrativo para capacitação de equipes.", "A reserva compreende o período das 8h às 12h, com capacidade para 25 participantes."],
  ["Contrato", "Manutenção preventiva de equipamentos", "Administração", "O Município de Aurora das Veredas e Serra Clara Tecnologia Ltda. ajustam a manutenção preventiva de 12 estações de trabalho.", "Prazo de 90 dias, valor de R$ 3.600,00, pagamento após recebimento do relatório mensal e aceite da fiscalização."],
  ["Termo", "Entrega de equipamentos ao almoxarifado", "Administração", "Registra-se a entrega de cinco impressoras e respectivos cabos ao Almoxarifado Central.", "A unidade recebedora deverá conferir os números patrimoniais, as condições de conservação e a destinação dos equipamentos."],
  ["Requerimento", "Reserva de espaço para reunião comunitária", "Governo e Planejamento", "Requer-se a utilização do auditório municipal para reunião de representantes de associações de moradores.", "O pedido compreende organização do espaço, controle de acesso e devolução do ambiente nas mesmas condições de uso."],
  ["Relatório", "Conservação de estradas vicinais", "Obras", "Consolida-se o acompanhamento de patrolamento de 8,4 km nas comunidades de Vale Verde e das Palmeiras.", "Foram registrados os trechos atendidos, as horas de equipamento e os pontos que demandam drenagem complementar."],
  ["Autorização", "Uso de veículo em serviço administrativo", "Administração", "Autoriza-se o deslocamento de equipe administrativa ao centro regional para retirada de materiais de expediente.", "O percurso deverá constar no diário de bordo, com identificação do motorista, horários e quilometragem de saída e retorno."],
  ["Ata", "Reunião de planejamento de compras", "Administração", "Reuniram-se os representantes das unidades requisitantes para consolidar as demandas do próximo trimestre.", "Deliberou-se pela padronização das especificações e pelo encaminhamento das estimativas de consumo ao setor de compras."],
  ["Parecer", "Organização do atendimento ao cidadão", "Administração", "Após análise do fluxo de recepção, recomenda-se a separação entre orientação inicial e protocolo de documentos.", "A medida prevê sinalização dos guichês, prioridade legal de atendimento e acompanhamento do tempo de espera."],
  ["Ofício", "Reposição de materiais escolares", "Educação", "Encaminha-se a relação de materiais necessários à continuidade das atividades nas unidades de ensino.", "A entrega deverá ocorrer por escola, acompanhada de conferência quantitativa e registro do responsável pelo recebimento."],
  ["Declaração", "Participação em formação continuada", "Educação", "Declara-se a participação da equipe pedagógica no encontro de formação continuada da rede municipal.", "A atividade compreendeu planejamento de aulas, acompanhamento de aprendizagem e organização dos registros escolares."],
  ["Termo", "Recebimento de mobiliário escolar", "Educação", "Registra-se o recebimento de vinte conjuntos de carteiras e cadeiras para atendimento da rede municipal de ensino.", "Os bens deverão ser incorporados ao patrimônio e destinados conforme a necessidade das unidades escolares."],
  ["Relatório", "Inspeção da frota de transporte escolar", "Educação", "Apresenta-se o acompanhamento das condições de limpeza, pneus, iluminação e equipamentos dos veículos de transporte escolar.", "As ocorrências foram encaminhadas à manutenção para programação dos serviços, sem alteração das rotas previstas."],
  ["Proposta de serviço", "Limpeza de reservatórios das escolas", "Educação", "Propõe-se a limpeza e higienização de seis reservatórios de água das unidades escolares.", "Prazo de execução de 15 dias e valor de R$ 2.700,00, com entrega de relatório por unidade atendida."],
  ["Requerimento", "Adequação de acesso à biblioteca", "Educação", "Requer-se avaliação técnica do acesso principal da biblioteca municipal para melhorar a circulação de usuários.", "O levantamento deverá incluir condições do piso, sinalização, corrimãos e continuidade da rota acessível."],
  ["Ofício", "Manutenção de equipamentos da unidade de saúde", "Saúde", "Solicita-se a programação de manutenção preventiva dos equipamentos de apoio da Unidade Básica Central.", "A equipe técnica deverá registrar identificação patrimonial, serviço executado e orientação de conservação."],
  ["Declaração", "Disponibilidade de sala para ações de saúde", "Saúde", "Declara-se a disponibilidade do espaço comunitário para atividades educativas de promoção da saúde.", "A organização do local e a guarda dos materiais ficarão sob acompanhamento da equipe responsável pela atividade."],
  ["Contrato", "Manutenção de climatização das unidades de saúde", "Saúde", "O Município e Acácias Serviços de Limpeza Ltda. ajustam os serviços de limpeza e manutenção de oito aparelhos de climatização.", "Valor global de R$ 3.200,00 e prazo de 60 dias, mediante ordem de serviço e aceite da unidade responsável."],
  ["Relatório", "Distribuição de materiais de uso nas unidades", "Saúde", "Apresenta-se o resumo de entrega de materiais administrativos às unidades municipais de saúde.", "Os quantitativos foram conferidos na saída do almoxarifado e no recebimento por cada unidade destinatária."],
  ["Termo", "Responsabilidade pela guarda de equipamentos", "Saúde", "Formaliza-se a responsabilidade pela guarda de dois computadores destinados ao atendimento administrativo da unidade.", "A movimentação dos bens dependerá de comunicação ao patrimônio e de atualização do local de utilização."],
  ["Autorização", "Atividade comunitária de orientação", "Assistência Social", "Autoriza-se a utilização do salão do CRAS Central para encontro de orientação sobre os serviços municipais.", "O atendimento deverá preservar a privacidade dos participantes e utilizar os canais institucionais de encaminhamento."],
  ["Ofício", "Aquisição de materiais para oficinas", "Assistência Social", "Encaminha-se demanda de papel, tintas, tecidos e materiais de apoio para oficinas comunitárias.", "As quantidades deverão observar o planejamento das turmas e a disponibilidade de estoque da unidade."],
  ["Ata", "Reunião de acompanhamento das oficinas", "Assistência Social", "A equipe técnica reuniu-se para avaliar a frequência e a organização das oficinas realizadas nos equipamentos municipais.", "Foram encaminhadas ações de divulgação dos horários, reposição de materiais e melhoria dos registros de participação."],
  ["Proposta de serviço", "Conservação de praças e jardins", "Meio Ambiente", "Propõe-se a execução de roçada, poda de formação e recolhimento de resíduos vegetais em três praças municipais.", "Valor de R$ 6.400,00 e prazo de 20 dias, com destinação dos resíduos ao ponto indicado pela fiscalização."],
  ["Autorização", "Plantio de árvores em área municipal", "Meio Ambiente", "Autoriza-se o plantio de trinta mudas de espécies adequadas à arborização urbana na Praça das Veredas.", "A equipe deverá observar o espaçamento, a proteção das mudas e o acompanhamento de irrigação no período inicial."],
  ["Relatório", "Conservação de áreas verdes", "Meio Ambiente", "Registra-se o acompanhamento de capina, irrigação e reposição de mudas nas áreas verdes do Centro.", "Os pontos de atenção foram relacionados para inclusão no cronograma de manutenção do mês seguinte."],
  ["Contrato", "Reparo de calçadas do Centro Administrativo", "Obras", "O Município e Horizonte Construções e Serviços Ltda. ajustam a recomposição de 65 m² de passeio do Centro Administrativo.", "Valor de R$ 9.750,00, prazo de 30 dias e recebimento condicionado à conferência da área executada e do acabamento."],
  ["Parecer", "Conservação da cobertura do almoxarifado", "Obras", "A análise visual identificou pontos de manutenção nas calhas e nos elementos de vedação da cobertura do almoxarifado.", "Recomenda-se a programação dos reparos e o isolamento preventivo dos pontos de circulação durante a execução."],
  ["Ofício", "Programação de manutenção da iluminação", "Obras", "Encaminha-se a relação dos pontos de iluminação que demandam verificação nas vias do Jardim das Acácias.", "As ordens de serviço deverão informar o local atendido, os materiais utilizados e a data de conclusão."],
  ["Certidão", "Situação cadastral de estabelecimento", "Fazenda", "Certifica-se a existência do cadastro municipal de Veredas Papelaria e Suprimentos Ltda. para acompanhamento administrativo.", "Esta certidão refere-se exclusivamente à identificação cadastral e não substitui licenças específicas ou certidão de regularidade fiscal."],
  ["Certidão", "Registro de atendimento administrativo", "Administração", "Certifica-se o registro do atendimento referente ao pedido de informações sobre conservação de espaço público.", "O expediente foi encaminhado à unidade competente para análise e comunicação da providência ao interessado."],
  ["Declaração", "Recebimento de material de expediente", "Fazenda", "Declara-se o recebimento de papel, pastas e demais materiais de expediente pela unidade administrativa da Fazenda.", "Os itens foram conferidos e destinados ao uso interno, com registro da quantidade disponibilizada à equipe."],
  ["Termo", "Conferência de bens móveis", "Administração", "Formaliza-se a conferência dos bens móveis alocados na sala de atendimento do Centro Administrativo.", "A relação contempla mesas, cadeiras, computadores e impressoras, com encaminhamento de divergências ao setor patrimonial."],
  ["Requerimento", "Apoio logístico para atividade cultural", "Cultura", "Requer-se apoio logístico para organização de apresentação cultural na Praça das Veredas.", "O pedido compreende instalação de pontos de energia, organização do espaço e acompanhamento de limpeza após a atividade."],
  ["Autorização", "Uso do ginásio municipal", "Esporte e Lazer", "Autoriza-se o uso do ginásio municipal para atividades de integração das equipes comunitárias.", "A utilização deverá respeitar os horários reservados, as regras de conservação e a responsabilidade pela devolução do espaço."],
  ["Ata", "Reunião sobre manutenção dos espaços esportivos", "Esporte e Lazer", "Os responsáveis pelos equipamentos esportivos reuniram-se para consolidar as necessidades de manutenção do trimestre.", "Foram priorizados reparos de alambrados, pintura de marcações e revisão dos pontos de iluminação."],
  ["Relatório", "Acompanhamento das hortas comunitárias", "Agricultura e Desenvolvimento", "Apresenta-se o resumo de visitas técnicas às hortas comunitárias do município.", "Foram registradas orientações de irrigação, organização dos canteiros e programação de entrega de insumos às equipes participantes."],
  ["Proposta de serviço", "Confecção de placas de orientação", "Administração", "Propõe-se a confecção de doze placas de orientação para identificação dos setores do Centro Administrativo.", "Valor global de R$ 2.160,00 e entrega em 20 dias, após conferência das artes e dos pontos de instalação."],
  ["Ofício", "Consolidação do planejamento de serviços", "Governo e Planejamento", "Solicita-se às secretarias o encaminhamento das prioridades de serviços e manutenção para consolidação do cronograma municipal.", "Cada unidade deverá informar objeto, local de atendimento, estimativa de prazo e responsável pelo acompanhamento."],
] as const;

export const auroraSignatureDocuments = subjects.map(([type, title, department, scope, terms], index) => ({
  number: index + 1, type, title, department, scope, terms,
  method: (index % 3 === 0 ? "INTERNAL" : index % 3 === 1 ? "A1_ECPF" : "A1_ECNPJ") as CentralSignatureMethod,
}));
export type AuroraSignatureDocument = typeof auroraSignatureDocuments[number];

export async function renderAuroraSignatureDocument(entry: AuroraSignatureDocument, input: { signer: string; role: string; issuedAt: Date; signedAt: Date; code: string }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${entry.type} ${String(entry.number).padStart(3, "0")} — ${entry.title}`);
  pdf.setAuthor("Prefeitura Municipal de Aurora das Veredas");
  pdf.setSubject("Acervo municipal de apresentação");
  pdf.setCreationDate(input.signedAt);
  pdf.setModificationDate(input.signedAt);
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const blue = rgb(0.1, 0.22, 0.36), gray = rgb(0.3, 0.34, 0.39);
  let y = 785;
  function text(value: string, size = 11, font = regular, color = gray) {
    const lines: string[] = []; let line = "";
    for (const word of value.split(/\s+/)) {
      if (font.widthOfTextAtSize(`${line} ${word}`.trim(), size) > 475 && line) { lines.push(line); line = word; }
      else line = `${line} ${word}`.trim();
    }
    if (line) lines.push(line);
    for (const content of lines) { page.drawText(content, { x: 60, y, size, font, color }); y -= size * 1.5; }
    y -= 10;
  }
  text("PREFEITURA MUNICIPAL DE AURORA DAS VEREDAS", 14, bold, blue);
  text(`Secretaria Municipal de ${entry.department}`, 10);
  page.drawLine({ start: { x: 60, y }, end: { x: 535, y }, thickness: 1, color: blue }); y -= 30;
  text(`${entry.type.toUpperCase()} Nº ${String(entry.number).padStart(3, "0")}/2026`, 13, bold, blue);
  text(entry.title, 13, bold);
  text(`Expediente AV-2026-${String(entry.number).padStart(5, "0")} | Emissão: ${input.issuedAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, 9);
  y -= 8;
  text(entry.scope);
  text(entry.terms);
  text("Encaminhe-se à unidade competente para acompanhamento, registro das providências e arquivamento do expediente.");
  y -= 16;
  text(input.signer, 11, bold, blue);
  text(input.role, 10);
  if (y < 220) throw new Error(`Conteúdo excede uma página: ${entry.number}`);
  y = 190;
  page.drawLine({ start: { x: 60, y: y + 15 }, end: { x: 535, y: y + 15 }, thickness: 0.5, color: gray });
  text(`Método: ${entry.method === "INTERNAL" ? "Assinatura eletrônica interna" : `${entry.method === "A1_ECPF" ? "A1 e-CPF" : "A1 e-CNPJ"} - cadeia privada de Aurora das Veredas`}`, 9, bold);
  text("A data e a evidência da assinatura constam no comprovante eletrônico destacado.", 8);
  text(`Validação: https://guarama.celeriflow.com.br/validar-assinatura/${input.code}`, 8);
  page.drawText("Aurora das Veredas | Acervo de apresentação | Página 1 de 1", { x: 60, y: 40, size: 8, font: regular, color: gray });
  return Buffer.from(await pdf.save());
}
