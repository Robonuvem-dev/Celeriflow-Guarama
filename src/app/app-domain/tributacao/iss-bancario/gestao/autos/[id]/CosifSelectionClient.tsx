"use client";

import { useState, useMemo } from "react";

export type CosifAccountProposal = {
  id: string;
  institutionName: string;
  calendarYear: string;
  cosifAccount: string;
  subaccount: string;
  description: string;
  systemRecommended: boolean;
  recommendationReason: string;
  acceptedIndication: boolean;
  desifTaxCode: string;
  serviceItem: string;
  debitAmount: string;
  acceptedDebitValue: boolean;
};

type Props = {
  institutions: { id: string; name: string }[];
  defaultInstitutionName: string;
  defaultCalendarYear: string;
  initialAccounts: CosifAccountProposal[];
};

export default function CosifSelectionClient({
  institutions,
  defaultInstitutionName,
  defaultCalendarYear,
  initialAccounts,
}: Props) {
  const [selectedInstitution, setSelectedInstitution] = useState<string>(defaultInstitutionName);
  const [selectedYear, setSelectedYear] = useState<string>(defaultCalendarYear);
  const [accounts, setAccounts] = useState<CosifAccountProposal[]>(initialAccounts);

  const [newCosifAccount, setNewCosifAccount] = useState("7.1.7.99.00-4");
  const [newSubaccount, setNewSubaccount] = useState("7.1.7.99.10-7");
  const [newDescription, setNewDescription] = useState("");
  const [newDesifTaxCode, setNewDesifTaxCode] = useState("15.01");
  const [newServiceItem, setNewServiceItem] = useState("15.01");
  const [newDebitAmount, setNewDebitAmount] = useState("0.00");
  const [newReason, setNewReason] = useState(
    "Inclusão manual pela fiscalização tributária (subconta COSIF com receita de serviços bancários)",
  );

  const visibleAccounts = useMemo(() => {
    const matched = accounts.filter(
      (acc) =>
        (!selectedInstitution ||
          acc.institutionName === selectedInstitution ||
          acc.institutionName === "TODAS") &&
        (!selectedYear || acc.calendarYear === selectedYear || acc.calendarYear === "TODOS"),
    );
    return matched.length > 0 ? matched : accounts;
  }, [accounts, selectedInstitution, selectedYear]);

  const updateAccount = (id: string, patch: Partial<CosifAccountProposal>) => {
    setAccounts((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeAccount = (id: string) => {
    setAccounts((prev) => prev.filter((item) => item.id !== id));
  };

  const addAccount = () => {
    if (!newCosifAccount.trim() || !newDescription.trim()) return;
    const created: CosifAccountProposal = {
      id: `manual-${Date.now()}`,
      institutionName: selectedInstitution || defaultInstitutionName,
      calendarYear: selectedYear || defaultCalendarYear,
      cosifAccount: newCosifAccount.trim(),
      subaccount: newSubaccount.trim() || newCosifAccount.trim(),
      description: newDescription.trim(),
      systemRecommended: true,
      recommendationReason:
        newReason.trim() || "Inclusão manual pela fiscalização tributária",
      acceptedIndication: true,
      desifTaxCode: newDesifTaxCode.trim() || "15.01",
      serviceItem: newServiceItem.trim() || "15.01",
      debitAmount: newDebitAmount.trim() || "0.00",
      acceptedDebitValue: true,
    };
    setAccounts((prev) => [...prev, created]);
    setNewDescription("");
    setNewDebitAmount("0.00");
  };

  const acceptAllIndications = () => {
    setAccounts((prev) =>
      prev.map((item) => ({
        ...item,
        acceptedIndication: item.systemRecommended ? true : item.acceptedIndication,
        acceptedDebitValue: item.systemRecommended ? true : item.acceptedDebitValue,
      })),
    );
  };

  const totalAcceptedDebit = useMemo(() => {
    return visibleAccounts
      .filter((a) => a.acceptedIndication && a.acceptedDebitValue)
      .reduce((acc, item) => {
        const parsed = Number(String(item.debitAmount).replace(",", "."));
        return acc + (Number.isFinite(parsed) ? parsed : 0);
      }, 0);
  }, [visibleAccounts]);

  return (
    <div className="md:col-span-3 space-y-4">
      <input type="hidden" name="cosifSelectionJson" value={JSON.stringify(accounts)} />

      <div className="grid gap-3.5 md:grid-cols-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
        <label className="text-xs font-semibold text-slate-700">
          Instituição Financeira (selecionável — Req. 28.1 / 28.2)
          <select
            name="institutionName"
            value={selectedInstitution}
            onChange={(e) => setSelectedInstitution(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900"
          >
            {institutions.map((inst) => (
              <option key={inst.id} value={inst.name}>
                {inst.name}
              </option>
            ))}
            {!institutions.some((i) => i.name === selectedInstitution) && selectedInstitution && (
              <option value={selectedInstitution}>{selectedInstitution}</option>
            )}
          </select>
        </label>

        <label className="text-xs font-semibold text-slate-700">
          Ano-Calendário da Fiscalização (Req. 28.1 / 28.2)
          <input
            name="calendarYear"
            type="number"
            min={1900}
            max={9999}
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900"
          />
        </label>
      </div>

      <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
              Requisito 28.2 — Enquadramento e Seleção de Contas / Subcontas COSIF
            </p>
            <h2 className="text-sm font-bold text-slate-900">
              Contas e Subcontas COSIF a Tributar ({selectedInstitution} · Ano-Calendário {selectedYear})
            </h2>
            <p className="text-xs text-slate-600">
              O sistema indica automaticamente as contas/subcontas com indício de tributação e o respectivo motivo. Aceite ou rejeite a indicação, inclua ou retire contas, edite o Código de Tributação DES-IF e confirme o aceite do valor lançado a débito.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={acceptAllIndications}
              className="cf-portal-btn-secondary text-xs"
            >
              Aceitar indicações do sistema
            </button>
            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900">
              Débito Aceito no Auto: R$ {totalAcceptedDebit.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="cf-portal-table w-full text-xs">
            <thead>
              <tr>
                <th>Conta / Subconta COSIF</th>
                <th>Descrição da Conta</th>
                <th>Indicação do Sistema &amp; Motivo</th>
                <th>Aceitar Indicação?</th>
                <th>Código Tributação DES-IF</th>
                <th>Item LC 116</th>
                <th>Valor Lançado a Débito (R$)</th>
                <th>Aceitar Valor a Débito?</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.map((acc) => (
                <tr key={acc.id} className={acc.acceptedIndication ? "bg-blue-50/20" : "opacity-70"}>
                  <td className="font-mono font-semibold text-slate-900">
                    <div>{acc.cosifAccount}</div>
                    <div className="text-[11px] text-slate-500">Sub: {acc.subaccount}</div>
                  </td>
                  <td className="font-medium text-slate-800">{acc.description}</td>
                  <td>
                    <span
                      className={
                        acc.systemRecommended
                          ? "inline-block rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900"
                          : "inline-block rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700"
                      }
                    >
                      {acc.systemRecommended ? "Indicado para Tributação" : "Revisão Complementar"}
                    </span>
                    <p className="mt-1 text-[11px] leading-snug text-slate-600">
                      {acc.recommendationReason}
                    </p>
                  </td>
                  <td>
                    <select
                      aria-label={`Aceitar indicação da conta ${acc.cosifAccount}`}
                      value={acc.acceptedIndication ? "SIM" : "NAO"}
                      onChange={(e) =>
                        updateAccount(acc.id, { acceptedIndication: e.target.value === "SIM" })
                      }
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900"
                    >
                      <option value="SIM">Sim — Tributar</option>
                      <option value="NAO">Não — Desconsiderar</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      aria-label={`Código de tributação DES-IF para ${acc.cosifAccount}`}
                      value={acc.desifTaxCode}
                      onChange={(e) => updateAccount(acc.id, { desifTaxCode: e.target.value })}
                      className="w-24 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      aria-label={`Item LC 116 para ${acc.cosifAccount}`}
                      value={acc.serviceItem}
                      onChange={(e) => updateAccount(acc.id, { serviceItem: e.target.value })}
                      className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      aria-label={`Valor lançado a débito para ${acc.cosifAccount}`}
                      value={acc.debitAmount}
                      onChange={(e) => updateAccount(acc.id, { debitAmount: e.target.value })}
                      className="w-28 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 tabular-nums"
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Aceitar valor a débito da conta ${acc.cosifAccount}`}
                      value={acc.acceptedDebitValue ? "SIM" : "NAO"}
                      onChange={(e) =>
                        updateAccount(acc.id, { acceptedDebitValue: e.target.value === "SIM" })
                      }
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900"
                    >
                      <option value="SIM">Aceitar Débito</option>
                      <option value="NAO">Não Aceitar</option>
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => removeAccount(acc.id)}
                      className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      Retirar
                    </button>
                  </td>
                </tr>
              ))}
              {visibleAccounts.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-xs text-slate-500">
                    Nenhuma conta/subconta COSIF selecionada para este filtro. Utilize o formulário abaixo para incluir novas contas/subcontas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-bold text-slate-800">
            Incluir nova Conta / Subconta COSIF no Auto de Infração
          </p>
          <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <label className="text-[11px] font-semibold text-slate-700">
              Conta COSIF
              <input
                type="text"
                value={newCosifAccount}
                onChange={(e) => setNewCosifAccount(e.target.value)}
                placeholder="7.1.7.10.00-3"
                className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
              />
            </label>
            <label className="text-[11px] font-semibold text-slate-700">
              Subconta / Subtítulo
              <input
                type="text"
                value={newSubaccount}
                onChange={(e) => setNewSubaccount(e.target.value)}
                placeholder="7.1.7.10.10-6"
                className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
              />
            </label>
            <label className="text-[11px] font-semibold text-slate-700 sm:col-span-2">
              Descrição da Conta / Subconta
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Ex.: Receitas de Tarifas de Cadastro e Renovação"
                className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
              />
            </label>
            <label className="text-[11px] font-semibold text-slate-700">
              Código DES-IF
              <input
                type="text"
                value={newDesifTaxCode}
                onChange={(e) => setNewDesifTaxCode(e.target.value)}
                placeholder="15.08"
                className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
              />
            </label>
            <label className="text-[11px] font-semibold text-slate-700">
              Valor a Débito (R$)
              <input
                type="text"
                value={newDebitAmount}
                onChange={(e) => setNewDebitAmount(e.target.value)}
                placeholder="1250.00"
                className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
              />
            </label>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <input
              type="text"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="Motivo da indicação / tributação"
              className="flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={addAccount}
              className="cf-portal-btn text-xs"
            >
              + Incluir Conta/Subconta COSIF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
