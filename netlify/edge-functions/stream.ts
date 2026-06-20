import { cors, json, resolveWithFallback, UA } from "../lib/shared.ts";

export default async (request: Request): Promise<Response> => {
  const q = new URL(request.url).searchParams;
  const [audioUrl] = await resolveWithFallback(
    q.get("source") || "netease",
    q.get("id") || "",
    q.get("br") || "320",
    q.get("name") || "",
    q.get("artist") || "",
  );
  if (!audioUrl) return json({ error: "no playable source" }, 404);

  const reqHeaders: Record<string, string> = { "User-Agent": UA };
  const range = request.headers.get("range");
  if (range) reqHeaders["Range"] = range;

  let upstream: Response;
  try {
    upstream = await fetch(audioUrl, { headers: reqHeaders });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }

  const headers = new Headers(cors());
  let ctype = upstream.headers.get("content-type") || "audio/mpeg";
  if (!ctype.includes("audio") && !ctype.includes("octet")) ctype = "audio/mpeg";
  headers.set("Content-Type", ctype);
  for (const h of ["content-length", "content-range", "accept-ranges"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("accept-ranges")) headers.set("Accept-Ranges", "bytes");

  // Stream the body straight through (no buffering, no size cap).
  return new Response(upstream.body, { status: upstream.status, headers });
};

export const config = { path: "/stream" };
