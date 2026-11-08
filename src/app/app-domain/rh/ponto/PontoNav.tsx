"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clock,
  CalendarCheck,
  FileCode2,
  FileText,
  Upload,
  UserCheck,
  FileBarChart2,
} from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/rh/ponto",
    label: "Marcações Gerais",
    badge: "20.6 / 20.7",
    icon: Clock,
    exact: true,
  },
  {
    href: "/rh/ponto/escalas",
    label: "Escalas Automáticas",
    badge: "20.9",
    icon: CalendarCheck,
  },
  {
    href: "/rh/ponto/layouts",
    label: "Layouts de Importação",
    badge: "20.10",
    icon: FileCode2,
  },
  {
    href: "/rh/ponto/ocorrencias",
    label: "Ocorrências & Justificativas",
    badge: "20.14 / 20.19",
    icon: FileText,
  },
  {
    href: "/rh/ponto/importacao",
    label: "Importação AFD / Relógio",
    badge: "20.15",
    icon: Upload,
  },
  {
    href: "/rh/ponto/frequencia",
    label: "Controle de Frequência",
    badge: "20.17 / 20.23",
    icon: UserCheck,
  },
  {
    href: "/rh/ponto/relatorios",
    label: "Central de Relatórios CF20",
    badge: "13 Itens",
    icon: FileBarChart2,
  },
];

export function PontoNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Submódulos do Ponto Eletrônico (CF20)"
      className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900/60"
    >
      <span className="font-semibold text-slate-700 dark:text-slate-300 mr-1 flex items-center gap-1">
        <Clock className="w-3.5 h-3.5 text-violet-600" />
        Ponto CF20:
      </span>
      {NAV_ITEMS.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
              isActive
                ? "bg-violet-600 text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700"
            }`}
          >
            <Icon className="w-3 h-3" />
            <span>{item.label}</span>
            <span
              className={`rounded px-1 py-0.2 text-[9px] font-semibold ${
                isActive
                  ? "bg-violet-800/80 text-white"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"
              }`}
            >
              {item.badge}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
