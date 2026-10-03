export const supportMarker = "eztv-support-tab";
export const supportContextKey = "eztv-support-context";
const uuid = /^[0-9a-f-]{36}$/i;
// A distinct storage key also isolates Supabase's cross-tab auth broadcasts.
export function supportStorageKey(
  storage: Storage,
  path: string,
  search: string,
) {
  const requested =
    path === "/support/reseller"
      ? new URLSearchParams(search).get("tab")
      : null;
  if (requested && uuid.test(requested)) {
    storage.setItem(supportMarker, requested);
    storage.removeItem(supportContextKey);
  }
  const id = storage.getItem(supportMarker);
  return id && uuid.test(id) ? `eztv-support-${id}` : null;
}
export interface SupportContext {
  id: string;
  reseller_id: string;
  name: string;
  expires_at: number;
}
export function readSupportContext(): SupportContext | null {
  try {
    return JSON.parse(sessionStorage.getItem(supportContextKey) || "null");
  } catch {
    return null;
  }
}
export function clearSupportStorage(key: string) {
  sessionStorage.removeItem(key);
  sessionStorage.removeItem(`${key}-code-verifier`);
  sessionStorage.removeItem(supportMarker);
  sessionStorage.removeItem(supportContextKey);
}
