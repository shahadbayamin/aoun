import { NextResponse } from "next/server";
import { z } from "zod";
import { route, parseJson } from "@/lib/api";

export const POST = route(async (req) => {
  const { lang } = await parseJson(req, z.object({ lang: z.enum(["ar", "en"]) }));
  const res = NextResponse.json({ ok: true });
  res.cookies.set("lang", lang, { path: "/", maxAge: 365 * 24 * 3600, sameSite: "lax" });
  return res;
});
