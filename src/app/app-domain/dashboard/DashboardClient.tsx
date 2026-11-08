"use client";

import { useState, useEffect, useMemo, type ElementType } from "react";
import Link from "next/link";
import {
  Search,
  X,
  Lock,
  ArrowUpRight,
  Sparkles,
  Check,
  Layers,
} from "lucide-react";
import styles from "./dashboard.module.css";
import { categories, type ModuleCategory } from "./dashboard-modules";

export type DashboardCardData = {
  code: string;
  name: string;
  description: string;
  href: string;
  icon: ElementType;
  color: string;
  bg: string;
  solid: string;
  category: ModuleCategory;
  isBlocked: boolean;
  features: string[];
  keywords: string[];
};

type HoverState = {
  item: DashboardCardData;
  rect: DOMRect;
} | null;

function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function DashboardClient({
  modules,
  userName,
}: {
  modules: DashboardCardData[];
  userName?: string | null;
}) {
  const [greeting, setGreeting] = useState("Olá");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ModuleCategory>("ALL");
  const [hovered, setHovered] = useState<HoverState>(null);

  useEffect(() => {
    setGreeting(getGreeting());
    const interval = setInterval(() => {
      setGreeting(getGreeting());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const normalizedQuery = useMemo(() => {
    return search
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }, [search]);

  const filteredModules = useMemo(() => {
    return modules.filter((mod) => {
      if (selectedCategory !== "ALL" && mod.category !== selectedCategory) {
        return false;
      }
      if (!normalizedQuery) return true;

      const nameNorm = mod.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      const descNorm = mod.description
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      const hrefNorm = mod.href.toLowerCase();
      const codeNorm = mod.code.toLowerCase();
      const kwNorm = mod.keywords
        .join(" ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      const featNorm = mod.features
        .join(" ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

      return (
        nameNorm.includes(normalizedQuery) ||
        descNorm.includes(normalizedQuery) ||
        hrefNorm.includes(normalizedQuery) ||
        codeNorm.includes(normalizedQuery) ||
        kwNorm.includes(normalizedQuery) ||
        featNorm.includes(normalizedQuery)
      );
    });
  }, [modules, selectedCategory, normalizedQuery]);

  const userFirstName = userName ? userName.trim().split(" ")[0] : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2.5 overflow-hidden">
      {/* ─── HERO SECTION ─── */}
      <section className="relative shrink-0 rounded-xl border border-slate-200/90 bg-linear-to-r from-emerald-50/70 via-slate-50 to-teal-50/60 p-3.5 shadow-xs transition-colors sm:p-4.5 dark:border-slate-800 dark:from-slate-900/90 dark:via-slate-900/80 dark:to-teal-950/40">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Greeting & Headline */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Central Operacional Integrada
              </span>
            </div>
            <h1 className="mt-0.5 text-lg font-extrabold tracking-tight text-slate-800 sm:text-xl lg:text-2xl dark:text-slate-100">
              {greeting}
              {userFirstName ? `, ${userFirstName}` : ""}, o que vamos fazer hoje?
            </h1>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              Explore todos os macro módulos do município ou busque por rotas, serviços e funcionalidades.
            </p>
          </div>

          {/* Search Bar */}
          <div className="w-full lg:max-w-md shrink-0">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 size-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por módulo, rota (ex: /rh), funcionalidade..."
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-20 text-xs font-medium text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-emerald-600 focus:outline-hidden focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <div className="absolute right-2 flex items-center gap-1.5">
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    title="Limpar busca"
                    className="flex size-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {filteredModules.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Category Pills */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-200/80 pt-2.5 dark:border-slate-800/80">
          <span className="mr-1 flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <Layers className="size-3 text-slate-400" /> Categorias:
          </span>
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            const count =
              cat.id === "ALL"
                ? modules.length
                : modules.filter((m) => m.category === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                  isSelected
                    ? "bg-emerald-700 text-white shadow-xs dark:bg-emerald-600"
                    : "bg-white/80 text-slate-600 hover:bg-white hover:text-slate-900 border border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700/60 dark:hover:bg-slate-800"
                }`}
              >
                <span>{cat.label}</span>
                <span
                  className={`rounded-full px-1 text-[9px] font-bold ${
                    isSelected
                      ? "bg-emerald-800 text-white dark:bg-emerald-700"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ─── MODULES GRID ─── */}
      <div className="relative min-h-0 flex-1 overflow-y-auto pr-1 pb-4">
        {filteredModules.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center dark:border-slate-800 dark:bg-slate-900/40">
            <Search className="size-8 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Nenhum módulo encontrado
            </h3>
            <p className="max-w-md text-xs text-slate-500">
              Não encontramos nenhum módulo ou funcionalidade com os filtros atuais.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSelectedCategory("ALL");
              }}
              className="mt-2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
            >
              Limpar filtros e busca
            </button>
          </div>
        ) : (
          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {filteredModules.map((item) => {
              const IconComponent = item.icon;

              if (item.isBlocked) {
                return (
                  <div
                    key={item.code}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHovered({ item, rect });
                    }}
                    onMouseLeave={() => setHovered(null)}
                    className={`${styles.card} relative flex h-full min-h-[126px] cursor-not-allowed flex-col justify-center overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-100/90 px-2 py-3 text-center opacity-60 grayscale select-none dark:border-slate-800 dark:bg-slate-900/60`}
                  >
                    {/* Top Gray Bar */}
                    <div className="absolute top-0 left-0 h-[3px] w-full bg-slate-400/50" />

                    {/* Lock Badge */}
                    <div
                      className={`${styles.lockBadge} absolute right-2 top-2 rounded-full bg-slate-200 p-1 text-slate-500 dark:bg-slate-800`}
                    >
                      <Lock className="size-3.5" />
                    </div>

                    <div className={`${styles.content} flex flex-col items-center gap-2`}>
                      <div
                        className={`${styles.icon} flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-200 ring-1 ring-inset ring-black/5 dark:bg-slate-800`}
                      >
                        <IconComponent className="size-[19px] text-slate-500" strokeWidth={2} />
                      </div>
                      <div className="min-w-0">
                        <h3
                          className={`${styles.title} text-[12px] sm:text-[13px] font-bold leading-tight text-slate-600 dark:text-slate-400`}
                        >
                          {item.name}
                        </h3>
                        <span
                          className={`${styles.status} mt-1 inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400`}
                        >
                          Acesso Bloqueado
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <Link
                  key={item.code}
                  href={item.href}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHovered({ item, rect });
                  }}
                  onMouseLeave={() => setHovered(null)}
                  className="group block min-h-0 min-w-0 rounded-md outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  <div
                    className={`${styles.card} relative flex h-full min-h-[126px] cursor-pointer flex-col justify-center overflow-hidden rounded-md border border-slate-300 bg-white px-2 py-3 text-center shadow-xs transition-colors hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 dark:bg-slate-950 dark:border-slate-800 dark:hover:bg-slate-900`}
                  >
                    {/* Colored Top Bar */}
                    <div className={`absolute top-0 left-0 h-[3px] w-full ${item.solid} opacity-85`} />

                    <div className={`${styles.content} flex flex-col items-center gap-2`}>
                      <div
                        className={`${styles.icon} flex size-10 shrink-0 items-center justify-center rounded-md ${item.bg} ring-1 ring-inset ring-black/5 transition-transform duration-200 group-hover:scale-105`}
                      >
                        <IconComponent className={`size-[19px] ${item.color}`} strokeWidth={2.5} />
                      </div>
                      <div className="min-w-0">
                        <h3
                          className={`${styles.title} text-[12px] font-bold leading-tight text-slate-800 transition-colors group-hover:text-primary sm:text-[13px] dark:text-slate-100`}
                        >
                          {item.name}
                        </h3>
                        <p
                          className={`${styles.description} mt-1 line-clamp-2 px-1 text-[10px] font-medium leading-tight text-slate-500 dark:text-slate-400`}
                        >
                          {item.description}
                        </p>
                      </div>
                      <span
                        className={`${styles.access} flex items-center justify-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 group-hover:text-emerald-700 dark:text-slate-400 dark:group-hover:text-emerald-400`}
                      >
                        Acessar <ArrowUpRight className="size-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── FORMATTED HOVER TOOLTIP ─── */}
      {hovered && (
        <div
          className="pointer-events-none fixed z-50 animate-in fade-in zoom-in-95 duration-150"
          style={{
            top:
              hovered.rect.top > 270
                ? `${hovered.rect.top - 8}px`
                : `${hovered.rect.bottom + 8}px`,
            left: `${Math.max(
              12,
              Math.min(
                typeof window !== "undefined" ? window.innerWidth - 308 : 300,
                hovered.rect.left + hovered.rect.width / 2 - 145
              )
            )}px`,
            transform: hovered.rect.top > 270 ? "translateY(-100%)" : "none",
            width: "290px",
          }}
        >
          <div className="overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/95 p-3.5 text-white shadow-2xl backdrop-blur-md">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div
                  className={`flex size-7 shrink-0 items-center justify-center rounded-md ${hovered.item.bg}`}
                >
                  <hovered.item.icon
                    className={`size-4 ${hovered.item.color}`}
                    strokeWidth={2.5}
                  />
                </div>
                <div>
                  <h4 className="text-xs font-bold leading-tight text-slate-100">
                    {hovered.item.name}
                  </h4>
                  <p className="text-[10px] text-slate-400">{hovered.item.description}</p>
                </div>
              </div>
              <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-emerald-400 border border-slate-700">
                {hovered.item.href}
              </span>
            </div>

            {/* Divider */}
            <div className="my-2 border-t border-slate-800" />

            {/* Features List */}
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
              <Sparkles className="size-3 text-emerald-400 shrink-0" />
              Principais Funcionalidades
            </div>
            <ul className="mt-1.5 space-y-1">
              {hovered.item.features.map((feat, idx) => (
                <li key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-200 leading-snug">
                  <Check className="size-3 text-emerald-400 mt-0.5 shrink-0" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>

            {/* Footer / Status */}
            <div className="mt-2.5 flex items-center justify-between border-t border-slate-800 pt-2 text-[10px]">
              {hovered.item.isBlocked ? (
                <span className="flex items-center gap-1 font-semibold text-amber-400">
                  <Lock className="size-3" /> Acesso bloqueado para seu perfil
                </span>
              ) : (
                <span className="flex items-center gap-1 font-semibold text-emerald-400">
                  Clique para acessar o módulo <ArrowUpRight className="size-3" />
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
