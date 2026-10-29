export type OperationalDevice = "phone" | "tablet" | "desktop" | "unclassified";

/** Device policy is independent of viewport width, including landscape phones. */
export function classifyOperationalDevice(agent: string, maxTouchPoints = 0): OperationalDevice {
  if (/iPad|Tablet|SM-T\w+|Nexus (?:7|9|10)/i.test(agent) || (/Macintosh/.test(agent) && maxTouchPoints > 1)) return "tablet";
  if (/Android/i.test(agent) && !/Mobile/i.test(agent)) return "tablet";
  if (/iPhone|iPod|Windows Phone|Android.*Mobile/i.test(agent)) return "phone";
  if (/Windows NT|Macintosh|X11|CrOS/.test(agent)) return "desktop";
  return "unclassified";
}
