import { apiGet, json } from "../lib/shared.ts";

export default async (request: Request): Promise<Response> => {
  const q = new URL(request.url).searchParams;
  const data = await apiGet({
    types: "pic",
    source: q.get("source") || "netease",
    id: q.get("id") || "",
    size: q.get("size") || "300",
  });
  const url = (data && typeof data === "object") ? (data as any).url || "" : "";
  return json({ url });
};

export const config = { path: "/api/pic" };
