import { json, resolveWithFallback } from "../lib/shared.ts";

export default async (request: Request): Promise<Response> => {
  const q = new URL(request.url).searchParams;
  const [url, used] = await resolveWithFallback(
    q.get("source") || "netease",
    q.get("id") || "",
    q.get("br") || "320",
    q.get("name") || "",
    q.get("artist") || "",
  );
  return json({ url, source: used, ok: !!url });
};

export const config = { path: "/api/url" };
