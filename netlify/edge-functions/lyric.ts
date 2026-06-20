import { apiGet, json } from "../lib/shared.ts";

export default async (request: Request): Promise<Response> => {
  const q = new URL(request.url).searchParams;
  const data = await apiGet({
    types: "lyric",
    source: q.get("source") || "netease",
    id: q.get("id") || "",
  });
  const d = (data && typeof data === "object") ? data as any : {};
  return json({ lyric: d.lyric || "", tlyric: d.tlyric || "" });
};

export const config = { path: "/api/lyric" };
