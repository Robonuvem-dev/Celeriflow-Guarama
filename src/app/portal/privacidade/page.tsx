import type { Metadata } from "next";
import Link from "next/link";
import { PortalBreadcrumb } from "@/components/portal-institucional/PortalShell";
import { CookiePreferencesButton } from "@/components/lgpd/CookieConsent";

export const metadata: Metadata = {
  title: "Privacidade e Proteção de Dados | Portal Oficial",
  description: "Versão operacional inicial da política de privacidade e proteção de dados do portal.",
};

export default function PrivacidadePage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-9 sm:px-6">
      <PortalBreadcrumb current="Privacidade e Proteção de Dados" />

      <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-[#0e4c7e]">
        Versão operacional inicial 1.0
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
        Política de Privacidade e Proteção de Dados
      </h1>
      <p className="mt-3 text-sm leading-7 text-slate-700">
        Esta página apresenta as regras iniciais de privacidade aplicáveis ao portal e deverá ser complementada após a validação dos dados oficiais do controlador e do encarregado pelo tratamento de dados pessoais.
      </p>

      <aside className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950" aria-labelledby="aviso-versao-inicial">
        <h2 id="aviso-versao-inicial" className="font-bold">Documento sujeito à validação institucional</h2>
        <p className="mt-1">
          A identificação jurídica completa do controlador, os dados do encarregado e os respectivos contatos ainda dependem de publicação oficial. Nenhum nome, e-mail ou telefone provisório é apresentado como definitivo nesta versão.
        </p>
      </aside>

      <div className="mt-6 space-y-6 rounded-xl border border-slate-200 bg-white p-5 text-sm leading-7 text-slate-700 sm:p-7">
        <section aria-labelledby="escopo">
          <h2 id="escopo" className="text-lg font-bold text-slate-900">1. Escopo</h2>
          <p className="mt-2">
            Esta política descreve o tratamento de dados pessoais durante o acesso ao portal, o uso de áreas autenticadas e o envio de solicitações ou formulários digitais. Sistemas vinculados podem apresentar avisos específicos quando realizarem tratamentos adicionais.
          </p>
        </section>

        <section aria-labelledby="dados-finalidades">
          <h2 id="dados-finalidades" className="text-lg font-bold text-slate-900">2. Dados e finalidades</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Dados fornecidos pela pessoa usuária, para identificar, protocolar, analisar e responder solicitações.</li>
            <li>Dados de conta e sessão, quando houver autenticação, para controle de acesso e segurança.</li>
            <li>Registros técnicos, como data, horário, endereço IP e informações do navegador, quando necessários à segurança, auditoria e disponibilidade.</li>
            <li>Preferências do navegador, para acessibilidade e registro da escolha sobre cookies.</li>
          </ul>
          <p className="mt-2">
            A base legal deverá corresponder a cada serviço e poderá incluir cumprimento de obrigação legal ou regulatória, execução de políticas públicas, exercício regular de direitos, proteção da vida, legítimo interesse nos limites legais ou consentimento quando essa for a hipótese adequada.
          </p>
        </section>

        <section aria-labelledby="cookies">
          <h2 id="cookies" className="text-lg font-bold text-slate-900">3. Cookies e armazenamento local</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-300 text-slate-900">
                  <th scope="col" className="px-3 py-2 font-bold">Categoria</th>
                  <th scope="col" className="px-3 py-2 font-bold">Uso nesta etapa</th>
                  <th scope="col" className="px-3 py-2 font-bold">Controle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 align-top">
                <tr>
                  <th scope="row" className="px-3 py-3 font-bold text-slate-900">Necessários</th>
                  <td className="px-3 py-3">Sessão e segurança quando aplicáveis, além do cookie <code>celeriflow_lgpd_consent_v1</code>, mantido por até 180 dias para registrar esta escolha.</td>
                  <td className="px-3 py-3">Sempre ativos, pois sustentam funções essenciais.</td>
                </tr>
                <tr>
                  <th scope="row" className="px-3 py-3 font-bold text-slate-900">Opcionais</th>
                  <td className="px-3 py-3">Nenhum script ou integração opcional está ativo atualmente.</td>
                  <td className="px-3 py-3">A pessoa pode aceitar a categoria ou manter somente os necessários.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            Preferências de acessibilidade podem ser mantidas no armazenamento local do navegador. O aviso de cookies aparece na primeira entrada e é ocultado após sua escolha. Você pode revisar as preferências pelo botão abaixo. Se finalidades ou categorias mudarem, a versão do consentimento deverá ser atualizada e uma nova escolha será solicitada.
          </p>
          <CookiePreferencesButton />
        </section>

        <section aria-labelledby="compartilhamento-retencao">
          <h2 id="compartilhamento-retencao" className="text-lg font-bold text-slate-900">4. Compartilhamento e retenção</h2>
          <p className="mt-2">
            Dados poderão ser compartilhados somente quando necessários à prestação do serviço público, ao cumprimento de dever legal, à segurança dos sistemas ou ao exercício de direitos, com operadores e órgãos legitimados. A retenção deve observar a finalidade, os prazos legais, as regras de arquivo público e as necessidades de auditoria, seguida de eliminação ou anonimização quando aplicável.
          </p>
        </section>

        <section aria-labelledby="direitos">
          <h2 id="direitos" className="text-lg font-bold text-slate-900">5. Direitos da pessoa titular</h2>
          <p className="mt-2">
            Nos limites da LGPD e das normas aplicáveis ao poder público, a pessoa titular pode solicitar confirmação e acesso, correção, informação sobre compartilhamentos, anonimização, bloqueio ou eliminação quando cabíveis, além de revogar consentimento e pedir revisão de decisões automatizadas quando aplicável. A identidade poderá ser verificada para proteger os próprios dados solicitados.
          </p>
        </section>

        <section aria-labelledby="seguranca">
          <h2 id="seguranca" className="text-lg font-bold text-slate-900">6. Segurança e responsabilidades</h2>
          <p className="mt-2">
            Devem ser adotadas medidas técnicas e administrativas proporcionais aos riscos para prevenir acessos indevidos, perda, alteração ou divulgação não autorizada. A pessoa usuária também deve proteger suas credenciais e evitar o envio de dados excessivos ou não solicitados.
          </p>
        </section>

        <section aria-labelledby="contato-atualizacoes">
          <h2 id="contato-atualizacoes" className="text-lg font-bold text-slate-900">7. Contato e atualizações</h2>
          <p className="mt-2">
            Até a publicação dos dados formais do encarregado, dúvidas e solicitações podem ser encaminhadas pelos <Link href="/portal/contato" className="font-bold text-[#0e4c7e] underline underline-offset-4 hover:text-[#0a3a5f]">canais institucionais já divulgados no portal</Link>. Esse encaminhamento transitório não constitui designação formal de encarregado.
          </p>
          <p className="mt-2">
            Esta política poderá ser atualizada para refletir validações oficiais, mudanças legais ou alterações nos serviços. A versão e a data da revisão deverão ser registradas nesta página.
          </p>
        </section>
      </div>

      <p className="mt-5 text-xs text-slate-500">Publicação desta versão operacional inicial: 10 de outubro de 2026.</p>
    </main>
  );
}
