import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { ApiError, badRequest } from "./errors";

type Handler<C> = (req: Request, ctx: C) => Promise<Response | unknown>;

/** Wrap a route handler: JSON responses, uniform error format, no stack traces leaked. */
export function route<C = { params: Promise<Record<string, string>> }>(fn: Handler<C>) {
  return async (req: Request, ctx: C) => {
    try {
      const out = await fn(req, ctx);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof ApiError) {
        return NextResponse.json({ error: e.code, message: e.message, ...e.extra }, { status: e.status });
      }
      if (e instanceof ZodError) {
        return NextResponse.json({ error: "VALIDATION_ERROR", message: "Invalid input", issues: e.issues }, { status: 400 });
      }
      console.error("[api] unhandled error", e);
      return NextResponse.json({ error: "INTERNAL", message: "Unexpected server error" }, { status: 500 });
    }
  };
}

export async function parseJson<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Body must be valid JSON");
  }
  return schema.parse(body);
}
