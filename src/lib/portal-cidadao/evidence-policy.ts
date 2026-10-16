export function validPortalUploadPath(pathname: string, prefix: string) {
  return pathname.startsWith(prefix) && /^[0-9a-f-]{36}-[A-Za-z0-9._-]{1,100}$/.test(pathname.slice(prefix.length));
}

export function validPortalBlobUrl(value: string, prefix: string) {
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname).replace(/^\//, "");
    return url.protocol === "https:" && !url.username && !url.password && url.hostname.endsWith(".blob.vercel-storage.com") && pathname.startsWith(prefix) && !pathname.includes("\\") && !pathname.split("/").some((part) => part === "." || part === "..");
  } catch { return false; }
}
