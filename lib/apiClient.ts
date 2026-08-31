// ============================================================
// Client fetch verso il backend FastAPI condiviso con stars-system —
// stesso backend, stesso database (SQLite oggi, Postgres in futuro), stessa
// API. Porting TypeScript di stars-system/src/lib/api/client.js: stesso
// contratto di ritorno { data, error } (ricalca supabase-js per
// minimizzare le modifiche a chi lo chiama, vedi lib/api.ts), stessi router
// CRUD generici (GET lista con filtri ?colonna=valore per uguaglianza
// esatta, GET/{id}, POST, PATCH/{id}, DELETE/{id}).
//
// Il generico non supporta order/limit/range di date/OR/IN/ricerca
// testuale: quando una funzione di lib/api.ts ne ha bisogno, filtra/ordina
// lato client dopo il fetch — stesso approccio già usato in
// stars-system/src/lib/api/*.js.
// ============================================================

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// true solo se qualcuno ha esplicitamente impostato EXPO_PUBLIC_API_URL:
// serve a lib/api.ts per restare in modalità mock quando l'app parte senza
// backend configurato (es. preview web senza env, stesso ruolo che aveva
// isSupabaseConfigured) — il fallback sopra resta comunque utile per lo
// sviluppo locale quando l'env var non è impostata ma il backend gira.
export const isApiConfigured = Boolean(process.env.EXPO_PUBLIC_API_URL);

export type ApiResult<T> = { data: T | null; error: Error | null };

/** URL assoluto verso il backend per un path relativo (es. quello restituito
 *  da apiUpload) — usato per mostrare le immagini caricate. */
export function apiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

async function request<T = any>(
  method: string,
  path: string,
  { params, body }: { params?: Record<string, unknown>; body?: unknown } = {}
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${BASE_URL}${path}${buildQueryString(params)}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const errBody = await res.json();
        if (errBody?.detail) {
          detail = typeof errBody.detail === 'string' ? errBody.detail : JSON.stringify(errBody.detail);
        }
      } catch {
        // corpo errore non JSON: teniamo res.statusText
      }
      return { data: null, error: new Error(`${method} ${path} → ${res.status}: ${detail}`) };
    }

    if (res.status === 204) return { data: null, error: null };
    return { data: (await res.json()) as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export const apiGet = <T = any>(path: string, params?: Record<string, unknown>) =>
  request<T>('GET', path, { params });

export const apiPost = <T = any>(path: string, body?: unknown) =>
  request<T>('POST', path, { body: body ?? {} });

export const apiPatch = <T = any>(path: string, body?: unknown) =>
  request<T>('PATCH', path, { body: body ?? {} });

export const apiDelete = <T = any>(path: string) => request<T>('DELETE', path);

/** GET {path}?params ma restituisce solo il primo elemento (o null), come .maybeSingle() di supabase-js. */
export async function apiGetFirst<T = any>(path: string, params?: Record<string, unknown>): Promise<ApiResult<T>> {
  const { data, error } = await apiGet<T[]>(path, params);
  if (error) return { data: null, error };
  return { data: pickOne(data), error: null };
}

export function pickOne<T>(list: T[] | null): T | null {
  return Array.isArray(list) && list.length > 0 ? list[0] : null;
}

/** Carica un file immagine dal filesystem locale (uri di expo-image-picker,
 *  file:// su nativo, blob:/data: sul web): lo legge come Blob e lo manda
 *  come body binario grezzo — stesso contratto di apiUpload in
 *  stars-system/src/lib/api/client.js (vedi backend/app/routers/upload.py
 *  per il perché non è multipart/form-data). Ritorna { data: { url }, error }. */
export async function apiUpload<T = any>(path: string, uri: string, mimeType: string): Promise<ApiResult<T>> {
  try {
    const blob = await (await fetch(uri)).blob();
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': mimeType },
      body: blob,
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const errBody = await res.json();
        if (errBody?.detail) detail = typeof errBody.detail === 'string' ? errBody.detail : JSON.stringify(errBody.detail);
      } catch {
        // corpo errore non JSON: teniamo res.statusText
      }
      return { data: null, error: new Error(`POST ${path} → ${res.status}: ${detail}`) };
    }
    return { data: (await res.json()) as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/** Ordina una lista senza mutarla (il generico non supporta order lato server). */
export function sortBy<T>(list: T[] | null | undefined, keyFn: (item: T) => any, { desc = false }: { desc?: boolean } = {}): T[] {
  return [...(list ?? [])].sort((a, b) => {
    const av = keyFn(a);
    const bv = keyFn(b);
    if (av < bv) return desc ? 1 : -1;
    if (av > bv) return desc ? -1 : 1;
    return 0;
  });
}
