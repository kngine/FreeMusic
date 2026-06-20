import { apiGet, json } from "./_shared.ts";

export default async (request: Request): Promise<Response> => {
  const q = new URL(request.url).searchParams;
  const name = (q.get("name") || "").trim();
  if (!name) return json([]);
  const source = q.get("source") || "netease";
  const data = await apiGet({
    types: "search", source, name,
    count: q.get("count") || "30", pages: q.get("page") || "1",
  });
  const list = Array.isArray(data) ? data : [];
  const out = (list as any[]).map((it) => ({
    id: it.id || it.url_id,
    name: it.name,
    artist: Array.isArray(it.artist) ? it.artist.join("/") : (it.artist || ""),
    album: it.album || "",
    pic_id: it.pic_id || "",
    lyric_id: it.lyric_id || it.id,
    source: it.source || source,
  }));
  return json(out);
};

export const config = { path: "/api/search" };
