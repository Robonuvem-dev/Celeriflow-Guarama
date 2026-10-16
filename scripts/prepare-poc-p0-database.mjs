import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

// No dotenv or URL input: this command can only create/open its own local P0 database.
const parent = resolve(process.env.LOCALAPPDATA ?? '.', 'Temp', 'opencode', 'ibema-poc-p0');
mkdirSync(parent, { recursive:true });
const marker = join(parent,'isolation.json');
const dataDir = join(parent,'postgres-data');
if (existsSync(dataDir) && !existsSync(marker)) throw new Error('Diretório existente sem identificação P0.');
const identity = existsSync(marker) ? JSON.parse(readFileSync(marker,'utf8')) : {id:randomUUID(),phase:'P0',engine:'PGlite',createdAt:new Date().toISOString()};
if (identity.phase !== 'P0' || identity.engine !== 'PGlite') throw new Error('Identidade do banco inválida.');
writeFileSync(marker,JSON.stringify(identity,null,2)+'\n');
const baseline = JSON.parse(readFileSync('docs/poc-p0/BASELINE.json','utf8'));
const pg = new PGlite(dataDir);
let db;
let server;
const report = {generatedAt:new Date().toISOString(),commit:baseline.commit,database:{...identity,dataDir,network:'loopback only',operationalDatabaseTouched:false},migrations:[],dataset:null,blockers:[],status:'EM_PREPARAÇÃO'};
try {
  await pg.waitReady;
  report.database.version = (await pg.query('SELECT version() AS version')).rows[0].version;
  // Receipts are separate from Prisma's journal: never pretend that migrate deploy was run.
  await pg.exec('CREATE TABLE IF NOT EXISTS "P0MigrationReceipt" (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const migration of baseline.migrations) {
    const sql = readFileSync(`prisma/migrations-ibema/${migration.name}/migration.sql`,'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (checksum !== migration.hash) throw new Error(`Migration mudou desde baseline: ${migration.name}`);
    const old = (await pg.query('SELECT checksum FROM "P0MigrationReceipt" WHERE name=$1',[migration.name])).rows[0];
    if (old && old.checksum !== checksum) throw new Error(`Conflito de checksum: ${migration.name}`);
    if (!old) {
      await pg.transaction(async (tx) => {
        await tx.exec(sql);
        await tx.query('INSERT INTO "P0MigrationReceipt"(name,checksum) VALUES ($1,$2)',[migration.name,checksum]);
      });
    }
    report.migrations.push({...migration,status:old ? 'SQL_JÁ_APLICADO_CHECKSUM_CONFERIDO' : 'SQL_APLICADO_EM_TRANSAÇÃO',method:'SQL direto PGlite + P0MigrationReceipt; não prisma migrate deploy'});
  }
  server = new PGLiteSocketServer({db:pg,port:0,host:'127.0.0.1'});
  await server.start();
  db = new PrismaClient({adapter:new PrismaPg({connectionString:`postgresql://postgres:postgres@${server.getServerConn()}/postgres`,max:1}),transactionOptions:{timeout:120000,maxWait:120000}});
  await db.$transaction(async (tx) => {
    for (const [suffix,type,jurisdiction] of [['exe','PREFEITURA','EXECUTIVE'],['leg','CAMARA','LEGISLATIVE']]) {
      const governmentEntityId = `p0-${suffix}`;
      const secretariatId = `p0-secretariat-${suffix}`;
      await tx.governmentEntity.upsert({where:{id:governmentEntityId},update:{},create:{id:governmentEntityId,code:`P0-${suffix.toUpperCase()}`,name:`POC P0 — ${type} (sintético)`,type}});
      await tx.planningEntityScope.upsert({where:{governmentEntityId},update:{},create:{governmentEntityId,jurisdiction}});
      await tx.secretariat.upsert({where:{id:secretariatId},update:{},create:{id:secretariatId,name:`POC P0 — Administração ${suffix}`}});
      for (let i=1;i<=21;i++) {
        const id = `p0-${suffix}-ug-${i}`;
        await tx.budgetUnit.upsert({where:{id},update:{},create:{id,code:`P0.${suffix}.${String(i).padStart(3,'0')}`,name:`POC Unidade ${i} — ${suffix}`,secretariatId}});
        await tx.planningEntityUnit.upsert({where:{budgetUnitId:id},update:{},create:{budgetUnitId:id,governmentEntityId}});
        await tx.costCenter.upsert({where:{id:`p0-${suffix}-cc-${i}`},update:{},create:{id:`p0-${suffix}-cc-${i}`,code:`P0.${suffix}.CC.${i}`,name:`POC Centro ${i} — ${suffix}`,governmentEntityId,secretariatId}});
      }
      const roles = {
        proponente:{create:true,update:true},
        aprovador:{legalApproval:true,update:true},
        sancionador:{legalApproval:true,update:true},
        consulta:{create:false,update:false,issueReports:true},
        financeiro:{create:true,update:true,issueReports:true},
        controlador:{create:true,update:true,issueReports:true},
        notificado:{create:false,update:false},
      };
      for (const [role,permissions] of Object.entries(roles)) {
        const id = `p0-${suffix}-${role}`;
        const modules = Object.fromEntries(['PLANEJAMENTO','FINANCEIRO','TRIBUTACAO','AUDITORIA','CAMARA','DOCUMENTOS','TRANSPARENCIA'].map((code) => [code,{blocked:false,...permissions}]));
        await tx.configuracaoPerfil.upsert({where:{id},update:{},create:{id,codigo:`P0_${suffix}_${role}`.toUpperCase(),nome:`POC ${role} ${suffix}`,permissoes:JSON.stringify({modules})}});
        await tx.usuario.upsert({where:{id},update:{},create:{id,nome:`POC ${role} ${suffix}`,email:`${id}@example.test`,perfilId:id}});
        await tx.usuarioUnidadeGestora.upsert({where:{usuarioId_budgetUnitId:{usuarioId:id,budgetUnitId:`p0-${suffix}-ug-1`}},update:{},create:{usuarioId:id,budgetUnitId:`p0-${suffix}-ug-1`}});
      }
    }
    for (const suffix of ['exe','leg']) for (const year of [2024,2025,2026,2027]) await tx.financialYear.upsert({where:{governmentEntityId_year:{governmentEntityId:`p0-${suffix}`,year}},update:{},create:{id:`p0-${suffix}-year-${year}`,governmentEntityId:`p0-${suffix}`,year,status:'Aberto',startDate:new Date(`${year}-01-01T00:00:00Z`),endDate:new Date(`${year}-12-31T23:59:59Z`)}});
    for (let i=1;i<=21;i++) {
      await tx.resourceSource.upsert({where:{id:`p0-source-${i}`},update:{},create:{id:`p0-source-${i}`,code:`P0.SOURCE.${i}`,name:`POC Fonte ${i} — não oficial`,referenceYear:2026}});
      await tx.revenueNature.upsert({where:{id:`p0-revenue-${i}`},update:{},create:{id:`p0-revenue-${i}`,code:`P0.REVENUE.${i}`,name:`POC Receita ${i} — não oficial`}});
      await tx.expenseNature.upsert({where:{id:`p0-expense-${i}`},update:{},create:{id:`p0-expense-${i}`,code:`P0.EXPENSE.${i}`,name:`POC Despesa ${i} — não oficial`}});
      await tx.accountingPlan.upsert({where:{id:`p0-account-${i}`},update:{},create:{id:`p0-account-${i}`,code:`P0.ACCOUNT.${i}`,name:`POC Conta ${i} — não PCASP homologado`,type:i%2 ? 'Ativo' : 'Passivo'}});
    }
  });
  const delegates = ['governmentEntity','planningEntityScope','planningEntityUnit','budgetUnit','costCenter','financialYear','resourceSource','revenueNature','expenseNature','accountingPlan','usuario','configuracaoPerfil'];
  report.dataset = {id:'P0-SINTETICO-v1',type:'SINTÉTICO; NÃO DADO MUNICIPAL; NÃO CLASSIFICAÇÃO OFICIAL',counts:Object.fromEntries(await Promise.all(delegates.map(async (name) => [name,await db[name].count()]))),years:[2024,2025,2026,2027],minimumPerCatalog:21,authentication:'Usuários locais sem Firebase UID/sessão: não login autenticado',scenarios:'Cadastro/escopo/volume prontos; movimentos financeiros e parâmetros legais dependem de P1–P7'};
  report.blockers = [
    'Firebase: vincular contas de ensaio/autenticação normal; não há Firebase UID ou sessão criada.',
    'Aplicação usa PrismaNeon/WebSocket; banco local foi preparado com PrismaPg/socket. Fornecer instância Neon isolada ou transporte local compatível antes do ensaio de UI.',
    'PGlite possui um backend serializado: concorrência entre sessões deve usar PostgreSQL com conexões reais na fase de ensaio.',
    'Catálogos P0 são sintéticos para volume; homologar classificações, matriz contábil e parâmetros municipais em P1.',
  ];
  report.status = 'BANCO_E_DATASET_PREPARADOS; INSTÂNCIA_AUTENTICADA_PENDENTE';
  if (report.migrations.length !== baseline.migrations.length || report.dataset.counts.budgetUnit !== 42) throw new Error('Inventário incompleto.');
} catch (error) {
  report.status = 'BLOQUEADO';
  report.blockers.push(String(error.message));
  process.exitCode=1;
} finally {
  await db?.$disconnect();
  await server?.stop();
  await pg.close();
  mkdirSync('docs/poc-p0',{recursive:true});
  writeFileSync('docs/poc-p0/AMBIENTE_ISOLADO.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,migrations:report.migrations.length,dataset:report.dataset,blockers:report.blockers},null,2));
}
