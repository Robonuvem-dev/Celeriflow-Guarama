"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Bell, LogOut, Menu, UserRound } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ModuleNavigationIcon, type ModuleIconName, type ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";
import { APP_VERSION } from "@/lib/version";
import { OperationalContext, subscribeOperationalViewport, useOperationalDevice, useOperationalWorkspace, useOptionalOperationalWorkspace } from "./OperationalContext";
import styles from "./operational.module.css";

export { useOperationalWorkspace, useOptionalOperationalWorkspace } from "./OperationalContext";

export function OperationalHeaderActions({ children }: { children: ReactNode }) {
  const { actionsHost } = useOperationalWorkspace();
  return actionsHost ? createPortal(children, actionsHost) : null;
}

/** A contextual/public table gets the same geometry without administrative navigation. */
export function OperationalSurface({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  const parent = useOptionalOperationalWorkspace();
  const device = useOperationalDevice();
  const [actionsHost, setActionsHost] = useState<HTMLDivElement | null>(null);
  return <OperationalContext.Provider value={{ userId: parent?.userId ?? "public", device, actionsHost }}>
    <div className={`${styles.workspace} ${styles.surface}`} data-operational-workspace data-operational-surface data-device={device}>
      <header className={styles.header} data-operational-header>
        <h2 className={styles.heading} title={title}>{title}</h2>
        <div ref={setActionsHost} className={styles.headerActions} data-operational-header-actions />
        {actions}
      </header>
      <main className={styles.main} data-operational-main>{children}</main>
    </div>
  </OperationalContext.Provider>;
}

export function OperationalWorkspace({ title, moduleTitle, moduleCaption, moduleIcon = "layoutDashboard", institutionName, userId, userName, userRole, navigation, onLogout, children }: {
  title: string;
  moduleTitle: string;
  moduleCaption?: string;
  moduleIcon?: ModuleIconName;
  institutionName: string;
  userId: string;
  userName: string;
  userRole: string;
  navigation: ModuleNavGroup[];
  onLogout: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [menuCollapsed, setMenuCollapsed] = useState(true);
  const [actionsHost, setActionsHost] = useState<HTMLDivElement | null>(null);
  const menuToggle = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const device = useOperationalDevice();
  const narrow = useSyncExternalStore(subscribeOperationalViewport, () => window.innerWidth < 960, () => false);
  const overlayOpen = narrow && !menuCollapsed;

  useEffect(() => {
    if (menuCollapsed) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuCollapsed(true); menuToggle.current?.focus(); }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuCollapsed]);

  return <OperationalContext.Provider value={{ userId, device, actionsHost }}>
    <div className={styles.workspace} data-operational-workspace data-device={device}>
      <header className={styles.header} data-operational-header>
        <Link href="/dashboard" className={styles.brand} aria-label="CeleriFlow — painel geral" title={institutionName}><Image src="/favicon.png" alt="CeleriFlow" width={84} height={28} priority /></Link>
        <h1 className={styles.heading} title={`${title} — ${institutionName}`}>{title}</h1>
        <div ref={setActionsHost} className={styles.headerActions} data-operational-header-actions />
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" className={styles.iconButton} aria-label="Menu do usuário" />}><UserRound /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 overflow-y-hidden">
            <DropdownMenuLabel>{userName}</DropdownMenuLabel>
            <DropdownMenuLabel>{userRole} · CeleriFlow {APP_VERSION}</DropdownMenuLabel>
            <DropdownMenuItem render={<Link href="/notificacoes" />}><Bell />Notificações internas</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void onLogout()}><LogOut />Sair</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className={styles.content}>
        {overlayOpen && <button type="button" className={styles.sidebarBackdrop} aria-label={`Fechar área expandida do menu de ${moduleTitle}`}
          onPointerDown={(event) => event.preventDefault()} onClick={() => { setMenuCollapsed(true); menuToggle.current?.focus(); }} tabIndex={-1} />}
        <div className={styles.sidebarSlot} data-collapsed={menuCollapsed}>
          <aside className={styles.sidebar} data-operational-sidebar data-collapsed={menuCollapsed} aria-label={`Menu de ${moduleTitle}`}
            onBlurCapture={(event) => { if (overlayOpen && event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setMenuCollapsed(true); }}>
            <div className={styles.sidebarHeading}>
              {!menuCollapsed && <div className={styles.moduleIdentity}>
                <span className={styles.moduleBadge}><ModuleNavigationIcon name={moduleIcon} /></span>
                <h2>{moduleTitle}</h2>
                {moduleCaption && <p>{moduleCaption}</p>}
              </div>}
              <button ref={menuToggle} type="button" className={styles.sidebarToggle} onClick={() => setMenuCollapsed((collapsed) => !collapsed)}
                aria-label={`${menuCollapsed ? "Expandir" : "Recolher"} menu de ${moduleTitle}`} title={`${menuCollapsed ? "Expandir" : "Recolher"} menu de ${moduleTitle}`} aria-expanded={!menuCollapsed} aria-controls={menuId}><Menu aria-hidden="true" /></button>
            </div>
            <nav id={menuId} aria-label={`Navegação de ${moduleTitle}`} className={styles.railNav}>
              {navigation.map((group) => <section key={group.title} className={styles.railGroup} aria-label={group.title}>
                {!menuCollapsed && <h3>{group.title}</h3>}
                {group.items.map((item) => {
                  const path = item.href.split("?")[0];
                  const active = (pathname === path || (!item.exact && pathname.startsWith(`${path}/`)))
                    && (!item.query || item.query.values.includes(searchParams.get(item.query.key) ?? ""));
                  return <Link key={item.href} href={item.href} className={styles.railLink} aria-label={item.title} title={item.title}
                  aria-current={active ? "page" : undefined} onClick={() => setMenuCollapsed(true)}>
                  <ModuleNavigationIcon name={item.icon} />
                  <span className={menuCollapsed ? styles.srOnly : styles.railLabel}>{item.title}</span>
                </Link>;
                })}
              </section>)}
            </nav>
            <div className={styles.railFooter}><Link href="/dashboard" className={styles.railLink} aria-label="Voltar ao painel geral" title="Voltar ao painel geral" onClick={() => setMenuCollapsed(true)}><ArrowLeft aria-hidden="true" /><span className={menuCollapsed ? styles.srOnly : styles.railLabel}>Voltar ao painel geral</span></Link></div>
          </aside>
        </div>
        <main className={styles.main} data-operational-main inert={overlayOpen || undefined}>{children}</main>
      </div>
    </div>
  </OperationalContext.Provider>;
}
