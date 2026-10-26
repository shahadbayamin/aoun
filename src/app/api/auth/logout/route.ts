import { z } from "zod";
import { route, parseJson } from "@/lib/api";
import { destroySession, loginPath } from "@/lib/auth";

const Body = z.object({ portal: z.enum(["PATIENT", "RADIOLOGY", "ER", "ADMIN"]) });

export const POST = route(async (req) => {
  const { portal } = await parseJson(req, Body);
  await destroySession(portal);
  return { redirect: loginPath(portal) };
});
