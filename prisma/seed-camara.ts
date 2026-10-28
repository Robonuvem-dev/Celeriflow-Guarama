import { and, eq, sql } from 'drizzle-orm';
import { createDatabaseConnection } from '../src/db/connection';
import { createId } from '../src/db/ids';
import { legislatures, councilors, cabinets, boardPositions, committees, committeeMembers, sessions, propositions, minutes, laws, hearings } from '../src/db/schema/chamber';

const connection = createDatabaseConnection(process.env.DATABASE_URL!);
const db = connection.db;

async function main() {
  console.log('Iniciando seed do Módulo 19 - Câmara Municipal...');

  const legislatura = (await db.select().from(legislatures).where(eq(legislatures.numero, 19)).limit(1))[0] ??
    (await db.insert(legislatures).values({ numero: 19, inicio: new Date('2025-01-01'), fim: new Date('2028-12-31'), status: 'Ativa', descricao: '19ª Legislatura da Câmara Municipal' }).onConflictDoNothing({ target: legislatures.numero }).returning())[0] ??
    (await db.select().from(legislatures).where(eq(legislatures.numero, 19)).limit(1))[0];

  await db.insert(legislatures).values({ numero: 18, inicio: new Date('2021-01-01'), fim: new Date('2024-12-31'), status: 'Encerrada', descricao: '18ª Legislatura - encerrada em dezembro de 2024' }).onConflictDoNothing({ target: legislatures.numero });

  const vereadoresData = [
    { nomeCompleto: 'Carlos Alberto Ferreira Lima', nomeParlamentar: 'Carlos Lima', cpf: '123.456.789-01', partido: 'PSDB', email: 'carlos.lima@camara.gov.br', status: 'Em Exercício' },
    { nomeCompleto: 'Maria das Graças Oliveira Santos', nomeParlamentar: 'Graça Santos', cpf: '234.567.890-12', partido: 'PT', email: 'graca.santos@camara.gov.br', status: 'Em Exercício' },
    { nomeCompleto: 'José Wellington Pereira da Silva', nomeParlamentar: 'Zé Wellington', cpf: '345.678.901-23', partido: 'MDB', email: 'ze.wellington@camara.gov.br', status: 'Em Exercício' },
    { nomeCompleto: 'Antônia Rodrigues Bezerra', nomeParlamentar: 'Tônia Bezerra', cpf: '456.789.012-34', partido: 'PSD', email: 'tonia.bezerra@camara.gov.br', status: 'Em Exercício' },
    { nomeCompleto: 'Francisco Soares Cavalcanti Neto', nomeParlamentar: 'Chicão Cavalcanti', cpf: '567.890.123-45', partido: 'Republicanos', email: 'chicao.cavalcanti@camara.gov.br', status: 'Licenciado' },
  ];

  const vereadores = [];
  for (const v of vereadoresData) {
    const ver = (await db.select().from(councilors).where(eq(councilors.cpf, v.cpf)).limit(1))[0] ??
      (await db.insert(councilors).values({ ...v, legislaturaId: legislatura.id }).onConflictDoNothing({ target: councilors.cpf }).returning())[0] ??
      (await db.select().from(councilors).where(eq(councilors.cpf, v.cpf)).limit(1))[0];
    vereadores.push(ver);
  }
  const [carlos, graca, ze, tonia, chicao] = vereadores;
  console.log('5 vereadores criados');

  for (const g of [
    { vereadorId: carlos.id, sala: '101', andar: '1º', telefone: '(87) 3861-2001', ramal: '201', status: 'Ativo' },
    { vereadorId: graca.id, sala: '102', andar: '1º', telefone: '(87) 3861-2002', ramal: '202', status: 'Ativo' },
    { vereadorId: ze.id, sala: '103', andar: '1º', telefone: '(87) 3861-2003', ramal: '203', status: 'Ativo' },
    { vereadorId: tonia.id, sala: '201', andar: '2º', telefone: '(87) 3861-2004', ramal: '204', status: 'Ativo' },
    { vereadorId: chicao.id, sala: '202', andar: '2º', telefone: '(87) 3861-2005', ramal: '205', status: 'Inativo' },
  ]) {
    await db.insert(cabinets).values(g).onConflictDoNothing({ target: cabinets.vereadorId });
  }
  console.log('5 gabinetes criados');

  for (const m of [
    { cargo: 'Presidente', vereadorId: carlos.id, status: 'Ativo' },
    { cargo: '1º Vice-Presidente', vereadorId: graca.id, status: 'Ativo' },
    { cargo: '2º Vice-Presidente', vereadorId: ze.id, status: 'Ativo' },
    { cargo: '1º Secretário', vereadorId: tonia.id, status: 'Ativo' },
    { cargo: '2º Secretário', vereadorId: chicao.id, status: 'Inativo' },
  ]) {
    await db.insert(boardPositions).values({ ...m, legislaturaId: legislatura.id }).catch(() => {});
  }
  console.log('Mesa Diretora configurada');

  await db.transaction(async (tx) => {
    const [committee] = await tx.insert(committees).values({ nome: 'Comissão de Constituição, Justiça e Cidadania', sigla: 'CCJ', tipo: 'Permanente', descricao: 'Análise da constitucionalidade dos projetos.', status: 'Ativa', legislaturaId: legislatura.id }).returning();
    await tx.insert(committeeMembers).values([{ cargo: 'Presidente', vereadorId: graca.id }, { cargo: 'Vice-Presidente', vereadorId: ze.id }, { cargo: 'Membro', vereadorId: tonia.id }].map(member => ({ ...member, comissaoId: committee.id })));
  });
  await db.transaction(async (tx) => {
    const [committee] = await tx.insert(committees).values({ nome: 'Comissão de Finanças, Orçamento e Contabilidade', sigla: 'CFOC', tipo: 'Permanente', descricao: 'Analisa matérias de natureza financeira.', status: 'Ativa', legislaturaId: legislatura.id }).returning();
    await tx.insert(committeeMembers).values([{ cargo: 'Presidente', vereadorId: carlos.id }, { cargo: 'Membro', vereadorId: graca.id }].map(member => ({ ...member, comissaoId: committee.id })));
  });
  await db.transaction(async (tx) => {
    const [committee] = await tx.insert(committees).values({ nome: 'Comissão de Obras, Transportes e Meio Ambiente', sigla: 'COTMA', tipo: 'Permanente', descricao: 'Acompanha projetos de infraestrutura.', status: 'Ativa', legislaturaId: legislatura.id }).returning();
    await tx.insert(committeeMembers).values([{ cargo: 'Presidente', vereadorId: ze.id }, { cargo: 'Membro', vereadorId: carlos.id }].map(member => ({ ...member, comissaoId: committee.id })));
  });
  console.log('3 comissoes criadas');

  const [sessao1] = await db.insert(sessions).values({ numero: 1, tipo: 'Ordinária', data: new Date('2025-02-03T14:00:00'), local: 'Plenário Vereador João de Barro', status: 'Encerrada', quorum: 5, legislaturaId: legislatura.id }).onConflictDoUpdate({ target: sessions.numero, set: { legislaturaId: legislatura.id } }).returning();
  const [sessao2] = await db.insert(sessions).values({ numero: 2, tipo: 'Ordinária', data: new Date('2025-02-17T14:00:00'), local: 'Plenário Vereador João de Barro', status: 'Encerrada', quorum: 4, legislaturaId: legislatura.id }).onConflictDoUpdate({ target: sessions.numero, set: { legislaturaId: legislatura.id } }).returning();
  const [sessao3] = await db.insert(sessions).values({ numero: 3, tipo: 'Extraordinária', data: new Date('2025-03-05T10:00:00'), local: 'Plenário Vereador João de Barro', status: 'Encerrada', quorum: 5, legislaturaId: legislatura.id }).onConflictDoUpdate({ target: sessions.numero, set: { legislaturaId: legislatura.id } }).returning();
  await db.insert(sessions).values({ numero: 4, tipo: 'Ordinária', data: new Date('2025-07-21T14:00:00'), local: 'Plenário Vereador João de Barro', status: 'Agendada', legislaturaId: legislatura.id }).onConflictDoUpdate({ target: sessions.numero, set: { legislaturaId: legislatura.id } });
  await db.insert(sessions).values({ numero: 5, tipo: 'Solene', data: new Date('2025-09-07T09:00:00'), local: 'Auditório da Prefeitura Municipal', status: 'Agendada', legislaturaId: legislatura.id }).onConflictDoUpdate({ target: sessions.numero, set: { legislaturaId: legislatura.id } });
  console.log('5 sessoes criadas');

  const prop1 = (await db.insert(propositions).values({ numero: 'PL-001/2025', tipo: 'Projeto de Lei', ementa: 'Criação do Fundo Municipal de Desenvolvimento Urbano.', status: 'Aprovada', urgente: false, autorId: carlos.id, sessaoId: sessao2.id, dataProtocolo: new Date('2025-01-20') }).onConflictDoNothing({ target: propositions.numero }).returning())[0] ?? (await db.select().from(propositions).where(eq(propositions.numero, 'PL-001/2025')).limit(1))[0];
  await db.insert(propositions).values({ numero: 'REQ-002/2025', tipo: 'Requerimento', ementa: 'Informações sobre o Posto de Saúde do Bairro Centro.', status: 'Protocolada', urgente: true, autorId: graca.id, dataProtocolo: new Date('2025-02-10') }).onConflictDoNothing({ target: propositions.numero });
  const prop3 = (await db.insert(propositions).values({ numero: 'IND-003/2025', tipo: 'Indicação', ementa: 'Sinalização de trânsito na Rua das Flores.', status: 'Aprovada', urgente: false, autorId: ze.id, sessaoId: sessao1.id, dataProtocolo: new Date('2025-01-15') }).onConflictDoNothing({ target: propositions.numero }).returning())[0] ?? (await db.select().from(propositions).where(eq(propositions.numero, 'IND-003/2025')).limit(1))[0];
  await db.insert(propositions).values({ numero: 'PL-004/2025', tipo: 'Projeto de Lei', ementa: 'Programa Municipal de Incentivo ao Esporte e Lazer.', status: 'Em Análise', urgente: false, autorId: tonia.id, dataProtocolo: new Date('2025-03-01') }).onConflictDoNothing({ target: propositions.numero });
  const prop5 = (await db.insert(propositions).values({ numero: 'MOC-005/2025', tipo: 'Moção', ementa: 'Congratulações ao Corpo de Bombeiros do Município.', status: 'Aprovada', urgente: false, autorId: carlos.id, sessaoId: sessao3.id, dataProtocolo: new Date('2025-03-01') }).onConflictDoNothing({ target: propositions.numero }).returning())[0] ?? (await db.select().from(propositions).where(eq(propositions.numero, 'MOC-005/2025')).limit(1))[0];
  console.log('5 proposicoes criadas');

  await db.execute(sql`INSERT INTO "CamVotacao" (id, modalidade, resultado, "votosSim", "votosNao", abstencoes, observacao, "proposicaoId", "sessaoId") VALUES (${createId()}, 'Nominal', 'Aprovada', 4, 1, 0, 'Aprovado com maioria absoluta.', ${prop1.id}, ${sessao2.id}) ON CONFLICT ("proposicaoId") DO NOTHING`);
  await db.execute(sql`INSERT INTO "CamVotacao" (id, modalidade, resultado, "votosSim", "votosNao", abstencoes, "proposicaoId", "sessaoId") VALUES (${createId()}, 'Simbólica', 'Aprovada', 5, 0, 0, ${prop3.id}, ${sessao1.id}) ON CONFLICT ("proposicaoId") DO NOTHING`);
  await db.execute(sql`INSERT INTO "CamVotacao" (id, modalidade, resultado, "votosSim", "votosNao", abstencoes, "proposicaoId", "sessaoId") VALUES (${createId()}, 'Simbólica', 'Aprovada', 5, 0, 0, ${prop5.id}, ${sessao3.id}) ON CONFLICT ("proposicaoId") DO NOTHING`);
  console.log('Votacoes registradas');

  await db.insert(minutes).values({ numero: 'ATA-001/2025', conteudo: 'Aos três dias de fevereiro de 2025 reuniu-se o Plenário para a 1ª Sessão Ordinária...', status: 'Publicada', dataAprovacao: new Date('2025-02-17'), sessaoId: sessao1.id }).onConflictDoNothing({ target: minutes.numero });
  await db.insert(minutes).values({ numero: 'ATA-002/2025', conteudo: 'Dezessete de fevereiro de 2025, 2ª Sessão Ordinária. Aprovação do PL-001/2025 com 4 votos favoráveis...', status: 'Aprovada', dataAprovacao: new Date('2025-03-05'), sessaoId: sessao2.id }).onConflictDoNothing({ target: minutes.numero });
  await db.insert(minutes).values({ numero: 'ATA-003/2025', conteudo: 'Rascunho da 3ª Sessão Extraordinária de 05/03/2025...', status: 'Rascunho', sessaoId: sessao3.id }).onConflictDoNothing({ target: minutes.numero });
  console.log('3 atas criadas');

  await db.insert(laws).values({ numero: 'Lei nº 1.247/2025', tipo: 'Lei Ordinária', ementa: 'Criação do Fundo Municipal de Desenvolvimento Urbano.', dataPublicacao: new Date('2025-03-01'), dataVigor: new Date('2025-03-01'), status: 'Vigente', proposicaoId: prop1.id }).onConflictDoNothing({ target: laws.numero });
  await db.insert(laws).values({ numero: 'Decreto Leg. nº 005/2025', tipo: 'Decreto Legislativo', ementa: 'Título de Cidadão Honorário ao Dr. Paulo Roberto Mendes.', dataPublicacao: new Date('2025-01-28'), dataVigor: new Date('2025-01-28'), status: 'Vigente' }).onConflictDoNothing({ target: laws.numero });
  await db.insert(laws).values({ numero: 'Resolução nº 002/2025', tipo: 'Resolução', ementa: 'Normas de funcionamento da Câmara Municipal em 2025.', dataPublicacao: new Date('2025-01-06'), dataVigor: new Date('2025-01-06'), status: 'Vigente' }).onConflictDoNothing({ target: laws.numero });
  console.log('3 leis criadas');

  await db.execute(sql`INSERT INTO "CamParecer" (id, tipo, conteudo, resultado, status, "proposicaoId", "updatedAt") VALUES (${createId()}, 'Comissão', 'A CCJ declara constitucional o PL-001/2025.', 'Favorável', 'Emitido', ${prop1.id}, ${new Date().toISOString()})`).catch(() => {});
  await db.execute(sql`INSERT INTO "CamParecer" (id, tipo, conteudo, resultado, status, "proposicaoId", "updatedAt") VALUES (${createId()}, 'Comissão', 'A CFOC confirma dotação orçamentária para o PL-001/2025.', 'Favorável', 'Emitido', ${prop1.id}, ${new Date().toISOString()})`).catch(() => {});
  console.log('Pareceres emitidos');

  for (const audiencia of [
    { tema: 'Prestação de Contas do 1º Quadrimestre 2025', descricao: 'Audiência pública da LRF.', data: new Date('2025-05-22T14:00:00'), local: 'Câmara Municipal - Plenário', tipo: 'Pública', status: 'Realizada', ata: '47 munícipes participaram.' },
    { tema: 'Plano Diretor Municipal - Revisão 2025', descricao: 'Debate sobre revisão do Plano Diretor.', data: new Date('2025-04-10T09:00:00'), local: 'Auditório da Secretaria de Obras', tipo: 'Pública', status: 'Realizada', ata: '120 presentes discutiram zoneamento urbano.' },
    { tema: 'Lei Orçamentária Anual 2026 - Consulta Popular', descricao: 'Consulta sobre prioridades do orçamento 2026.', data: new Date('2025-09-15T14:00:00'), local: 'Câmara Municipal - Plenário', tipo: 'Pública', status: 'Agendada' },
  ]) {
    const [existing] = await db.select().from(hearings).where(and(eq(hearings.tema, audiencia.tema), eq(hearings.data, audiencia.data))).limit(1);
    if (existing) {
      await db.update(hearings).set({ legislaturaId: legislatura.id }).where(eq(hearings.id, existing.id));
    } else {
      await db.insert(hearings).values({ ...audiencia, legislaturaId: legislatura.id });
    }
  }
  console.log('3 audiencias criadas');

  console.log('Seed do Módulo 19 concluído!');
}

main().catch((e) => { console.error(e); process.exit(1); });
