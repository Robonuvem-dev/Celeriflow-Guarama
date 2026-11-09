import type { DashboardModuleItem } from './dashboard-modules';

/** Only serializable data crosses the Server/Client Component boundary. */
export type DashboardCardData = Omit<DashboardModuleItem, 'icon'> & { isBlocked: boolean };

export function dashboardCardData(item: DashboardModuleItem, isBlocked: boolean): DashboardCardData {
  const { icon: _icon, ...data } = item;
  return { ...data, isBlocked };
}
