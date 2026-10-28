"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowLeft, Bell, LogOut, Menu, UserRound } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ModuleNavigationIcon, type ModuleIconName, type ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";
import { APP_VERSION } from "@/lib/version";
import styles from "./operational.module.css";

type DevicePolicy = "phone" | "tablet" | "desktop" | "unclassified";
const WorkspaceContext = createContext<{ userId: string; device: DevicePolicy; actionsHost: HTMLDivElement | null } | null>(null);

function getDevicePolicy(): DevicePolicy {
  if (typeof navigator === "undefined") return "unclassified";
  const agent = navigator.userAgent;
  const knownTablet = /iPad|Tablet|SM-T\w+|Nexus (?:7|9|10)/i.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
  if (knownTablet || (/Android/i.test(agent) && !/Mobile/i.test(agent))) return "tablet";
  if (/iPhone|iPod|Windows Phone|Android.*Mobile/i.test(agent)) return "phone";
  if (/Windows NT|Macintosh|X11|CrOS/.test(agent)) return "desktop";
  return "unclassified";
}

function subscribeDevice(listener: () => void) {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
}

export function useOperationalWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("A listagem operacional precisa do seu workspace.");
  return workspace;
}

export function OperationalHeaderActions({ children }: { children: ReactNode }) {
  const { actionsHost } = useOperationalWorkspace();
  return actionsHost ? createPortal(children, actionsHost) : null;
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
  const [menuCollapsed, setMenuCollapsed] = useState(true);
  const [actionsHost, setActionsHost] = useState<HTMLDivElement | null>(null);
  const menuToggle = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const device = useSyncExternalStore(subscribeDevice, getDevicePolicy, () => "unclassified" as const);
  const narrow = useSyncExternalStore(subscribeDevice, () => window.innerWidth < 960, () => false);
  const overlayOpen = narrow && !menuCollapsed;

  useEffect(() => {
    if (menuCollapsed) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuCollapsed(true); menuToggle.current?.focus(); }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuCollapsed]);

  return <WorkspaceContext.Provider value={{ userId, device, actionsHost }}>
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
                {group.items.map((item) => <Link key={item.href} href={item.href} className={styles.railLink} aria-label={item.title} title={item.title}
                  aria-current={pathname === item.href ? "page" : undefined} onClick={() => setMenuCollapsed(true)}>
                  <ModuleNavigationIcon name={item.icon} />
                  <span className={menuCollapsed ? styles.srOnly : styles.railLabel}>{item.title}</span>
                </Link>)}
              </section>)}
            </nav>
            <div className={styles.railFooter}><Link href="/dashboard" className={styles.railLink} aria-label="Voltar ao painel geral" title="Voltar ao painel geral" onClick={() => setMenuCollapsed(true)}><ArrowLeft aria-hidden="true" /><span className={menuCollapsed ? styles.srOnly : styles.railLabel}>Voltar ao painel geral</span></Link></div>
          </aside>
        </div>
        <main className={styles.main} data-operational-main inert={overlayOpen || undefined}>{children}</main>
      </div>
    </div>
  </WorkspaceContext.Provider>;
}
