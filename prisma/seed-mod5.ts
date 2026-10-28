import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { createDatabaseConnection } from '../src/db/connection';
import { people } from '../src/db/schema/people';
import { supportChannels, tickets as ticketTable, ombudsmans } from '../src/db/schema/attendance-portals';

const connection = createDatabaseConnection(process.env.DATABASE_URL!);
const db = connection.db;

async function upsertChannel(name: string, description: string) {
  const [existing] = await db.select().from(supportChannels).where(eq(supportChannels.name, name)).limit(1);
  if (existing) return existing;
  return (await db.insert(supportChannels).values({ name, description }).returning())[0];
}

async function upsertPerson(cpf: string, fullName: string) {
  const [existing] = await db.select().from(people).where(eq(people.cpf, cpf)).limit(1);
  if (existing) return existing;
  return (await db.insert(people).values({ cpf, fullName, status: 'Ativo' }).returning())[0];
}

async function upsertTicket(ticketNumber: string, data: Omit<typeof ticketTable.$inferInsert, "ticketNumber">) {
  const [existing] = await db.select().from(ticketTable).where(eq(ticketTable.ticketNumber, ticketNumber)).limit(1);
  if (existing) return existing;
  return (await db.insert(ticketTable).values({ ticketNumber, ...data }).returning())[0];
}

async function upsertOmbudsman(protocolNumber: string, data: Omit<typeof ombudsmans.$inferInsert, "protocolNumber">) {
  const [existing] = await db.select().from(ombudsmans).where(eq(ombudsmans.protocolNumber, protocolNumber)).limit(1);
  if (existing) return existing;
  return (await db.insert(ombudsmans).values({ protocolNumber, ...data }).returning())[0];
}

async function main() {
  console.log('\n🚀 Iniciando seed do Módulo 5 (Atendimento)...\n');

  // ─── CANAIS DE ATENDIMENTO ─────────────────────────────────────
  const portalChannel = await upsertChannel('Portal do Cidadão', 'Atendimento via plataforma online');
  const telChannel = await upsertChannel('Telefone 156', 'Central de atendimento telefônico');
  const balcaoChannel = await upsertChannel('Balcão Presencial', 'Atendimento na prefeitura');
  console.log('✅ Canais criados.');

  // ─── CIDADÃOS MOCK ─────────────────────────────────────────────
  const person1 = await upsertPerson('11122233344', 'Carlos Mendes da Silva');
  const person2 = await upsertPerson('55566677788', 'Ana Lúcia Ferreira');
  console.log('✅ Cidadãos criados.');

  // ─── TICKETS (CHAMADOS) ────────────────────────────────────────
  const tickets = [
    {
      ticketNumber: 'TKT-2026-8492',
      subject: 'Lâmpada Queimada na Praça da Matriz',
      description: 'A lâmpada do poste em frente ao coreto está queimada há 3 dias. Local bem escuro.',
      priority: 'Normal',
      status: 'Aberto',
      channelId: portalChannel.id,
      personId: person1.id
    },
    {
      ticketNumber: 'TKT-2026-1934',
      subject: 'Vazamento de água na calçada',
      description: 'Cano estourado vazando água limpa na rua principal.',
      priority: 'Alta',
      status: 'Em Atendimento',
      channelId: telChannel.id,
      personId: person2.id
    },
    {
      ticketNumber: 'TKT-2026-5531',
      subject: 'Poda de árvore com risco de queda',
      description: 'Árvore antiga caindo galhos secos próximo à fiação elétrica.',
      priority: 'Urgente',
      status: 'Aberto',
      channelId: balcaoChannel.id,
      personId: person1.id
    }
  ];

  for (const t of tickets) {
    await upsertTicket(t.ticketNumber, t);
  }
  console.log(`✅ ${tickets.length} chamados criados.`);

  // ─── OUVIDORIA (DENÚNCIAS/MANIFESTAÇÕES) ────────────────────────
  const ombudsmanCases = [
    {
      protocolNumber: 'OUV-2026-901',
      type: 'Denúncia',
      subject: 'Terreno baldio com foco de dengue',
      description: 'O terreno na esquina da Rua X está com mato alto, muito lixo acumulado e água parada. Solicito fiscalização imediata.',
      isAnonymous: true,
      isConfidential: true,
      status: 'Recebida',
      channelId: portalChannel.id,
      personId: null
    },
    {
      protocolNumber: 'OUV-2026-902',
      type: 'Reclamação',
      subject: 'Atraso na coleta de lixo',
      description: 'O caminhão de lixo não passou esta semana no Bairro das Flores. Os lixos estão acumulando nas calçadas.',
      isAnonymous: false,
      isConfidential: false,
      status: 'Em Análise',
      channelId: telChannel.id,
      personId: person2.id
    },
    {
      protocolNumber: 'OUV-2026-903',
      type: 'Elogio',
      subject: 'Atendimento Posto de Saúde',
      description: 'Gostaria de elogiar a equipe do postinho central, em especial as enfermeiras, pelo ótimo acolhimento.',
      isAnonymous: false,
      isConfidential: false,
      status: 'Concluída',
      channelId: portalChannel.id,
      personId: person1.id
    }
  ];

  for (const o of ombudsmanCases) {
    await upsertOmbudsman(o.protocolNumber, o);
  }
  console.log(`✅ ${ombudsmanCases.length} manifestações de ouvidoria criadas.`);

  console.log('\n🎉 Seed do Módulo 5 concluído!\n');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await connection.pool.end();
  });
