// Shared helpers for FreeTune Netlify Edge Functions (Deno runtime).
// Lives outside edge-functions/ so Netlify does not treat it as a function entry.

export const API = "https://music-api.gdstudio.xyz/api.php";
export const FALLBACK_SOURCES = ["netease", "kuwo", "tencent", "migu", "kugou"];
export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export function cors(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Range",
    "Cache-Control": "no-store",
    ...extra,
  };
}

export function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: cors({ "Content-Type": "application/json; charset=utf-8" }),
  });
}

export async function apiGet(
  params: Record<string, string>,
): Promise<unknown> {
  const url = API + "?" + new URLSearchParams(params).toString();
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    return await r.json();
  } catch (_e) {
    return null;
  }
}

export async function resolveAudio(
  source: string,
  id: string,
  br: string,
): Promise<string> {
  const data = await apiGet({ types: "url", source, id, br });
  if (data && typeof data === "object" && "url" in (data as any)) {
    const u = (data as any).url || "";
    if (typeof u === "string" && u.startsWith("http")) return u;
  }
  return "";
}

export async function resolveWithFallback(
  source: string,
  id: string,
  br: string,
  name: string,
  artist: string,
): Promise<[string, string]> {
  let url = await resolveAudio(source, id, br);
  if (url) return [url, source];

  const query = [name, artist].filter(Boolean).join(" ").trim();
  if (!query) return ["", source];

  for (const alt of FALLBACK_SOURCES) {
    if (alt === source) continue;
    const results = await apiGet({
      types: "search", source: alt, name: query, count: "5", pages: "1",
    });
    if (!Array.isArray(results)) continue;
    for (const item of results as any[]) {
      const altId = item.id || item.url_id;
      if (!altId) continue;
      url = await resolveAudio(alt, String(altId), br);
      if (url) return [url, alt];
    }
  }
  return ["", source];
}
