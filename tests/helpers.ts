import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export const BASE = (process.env.TAREE_TEST_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
export const asset = (name: string) => fs.readFileSync(path.join(process.cwd(), "demo-assets", name));
export const sha = (b: Buffer | Uint8Array) => crypto.createHash("sha256").update(b).digest("hex");
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Minimal browser-like client with its own cookie jar (one per portal user). */
export class Client {
  jar = new Map<string, string>();
  constructor(public name: string) {}
  private cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async req(method: string, url: string, body?: unknown, form?: FormData) {
    const res = await fetch(BASE + url, {
      method,
      redirect: "manual",
      headers: { cookie: this.cookieHeader(), "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 200) + 1}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (!v || /max-age=0/i.test(c) || /expires=Thu, 01 Jan 1970/i.test(c)) this.jar.delete(k);
      else this.jar.set(k, v);
    }
    return res;
  }
  async json<T = any>(method: string, url: string, body?: unknown) {
    const res = await this.req(method, url, body);
    const data = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, data };
  }
  async page(url: string) {
    const res = await this.req("GET", url);
    return { status: res.status, html: await res.text(), location: res.headers.get("location") };
  }
  async upload(url: string, file: Buffer, name: string, kind: "IMAGE" | "REPORT") {
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(file)]), name);
    fd.append("kind", kind);
    const res = await this.req("POST", url, undefined, fd);
    return { status: res.status, data: (await res.json()) as any };
  }
}

export async function proLogin(email: string) {
  const c = new Client(email);
  const r = await c.json("POST", "/api/auth/hospital/login", { email, password: "Aoun@2026" });
  if (r.status !== 200) throw new Error(`login ${email} failed: ${JSON.stringify(r.data)}`);
  return c;
}

/** Patient login exactly like the page: national ID + mobile → code → verify. */
export async function patientLogin(nationalId: string, phone: string) {
  const c = new Client(nationalId);
  const s = await c.json("POST", "/api/auth/patient/start", { nationalId, phone });
  if (s.status !== 200) throw new Error(`otp start failed: ${JSON.stringify(s.data)}`);
  const v = await c.json("POST", "/api/auth/patient/verify", { challengeId: s.data.challengeId, code: s.data.devCode ?? process.env.OTP_FIXED_CODE });
  if (v.status !== 200) throw new Error(`otp verify failed: ${JSON.stringify(v.data)}`);
  return c;
}

/** Hospital A: ONE request = the "حفظ وتأكيد" button. Then follow the real sync status. */
export async function saveAndConfirm(rad: Client, nationalId: string, modality: string, fileName: string | string[], report: string) {
  const fd = new FormData();
  fd.append("nationalId", nationalId);
  fd.append("modality", modality);
  fd.append("report", report);
  for (const f of Array.isArray(fileName) ? fileName : [fileName]) fd.append("file", new Blob([new Uint8Array(asset(f))]), f);
  const res = await rad.req("POST", "/api/radiology/submit", undefined, fd);
  const data = (await res.json()) as any;
  return { status: res.status, data };
}

export async function waitForSync(rad: Client, studyId: string, timeoutMs = 45_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await rad.json("GET", `/api/radiology/studies/${studyId}/status`);
    const job = s.data.job;
    if (job && ["SYNCED", "FAILED", "QUARANTINED"].includes(job.status)) return job;
    await sleep(250);
  }
  throw new Error("sync did not finish in time");
}
