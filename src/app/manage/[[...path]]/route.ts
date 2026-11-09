import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession, destroySession, getSession, verifyPassword } from "@/lib/auth";
import { pickDatabaseUrl } from "@/lib/db-url";
import { rateLimit } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request-meta";
import { audit } from "@/lib/audit";
import { latinDigits } from "@/lib/digits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * «مستخدمو عون» online: the same users page as the "Aoun Database" app on the Mac (add / edit patients
 * and doctors, change passwords), served by the website at /manage for platform admins only.
 */
type Listener = (req: unknown, res: unknown) => Promise<void>;
let viewer: Promise<{ listener: Listener }> | null = null;
function getViewer() {
  viewer ??= import("../../../../scripts/db-viewer.mjs").then((m) =>
    m.createDbViewerListener({ connectionString: pickDatabaseUrl(), checkOrigin: false, poolMax: 1, log: (...a: unknown[]) => console.log("[manage]", ...a) }),
  );
  return viewer;
}

const html = (body: string, status = 200) => new NextResponse(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

function loginPage(error = "") {
  return html(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aoun Users · Sign in</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F5F7FA;color:#0F2A43;font-family:-apple-system,"Segoe UI",Tahoma,sans-serif}
form{background:#fff;border:1px solid #E5E9F0;border-radius:20px;padding:28px;width:min(360px,calc(100vw - 32px));box-shadow:0 8px 30px rgba(15,42,67,.08)}
h1{margin:0 0 4px;font-size:22px}p{margin:0 0 18px;color:#64748B;font-size:14px}
label{display:block;font-size:13px;font-weight:600;margin:12px 0 6px}
input{width:100%;box-sizing:border-box;border:1px solid #CBD5E1;border-radius:12px;padding:11px 12px;font-size:15px;direction:ltr}
button{margin-top:18px;width:100%;border:0;border-radius:12px;padding:12px;background:#087F8C;color:#fff;font-size:15px;font-weight:700;cursor:pointer}
.err{background:#FEF2F2;color:#B91C1C;border-radius:10px;padding:8px 10px;font-size:13px;margin-top:12px}
</style></head><body>
<form method="post" action="/manage/login">
<h1>مستخدمو عون</h1><p>دخول مشرف المنصة · Platform admin sign-in</p>
<label for="e">البريد · Email</label><input id="e" name="email" type="email" autocomplete="username" required>
<label for="p">كلمة المرور · Password</label><input id="p" name="password" type="password" autocomplete="current-password" required>
${error ? `<div class="err">${error}</div>` : ""}
<button>دخول · Sign in</button>
</form></body></html>`, error ? 401 : 200);
}

async function handle(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  const sub = "/" + path.join("/");
  const url = new URL(req.url);

  // Only same-site browser requests may change anything.
  if (req.method !== "GET") {
    // (the site sends no referrer, so browsers may send "Origin: null"; Sec-Fetch-Site tells cross-site apart)
    const origin = req.headers.get("origin");
    const crossSite = req.headers.get("sec-fetch-site") === "cross-site" || (!!origin && origin !== "null" && new URL(origin).host !== url.host);
    if (crossSite) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (sub === "/login" && req.method === "POST") {
    const meta = await requestMeta();
    rateLimit(`manage-login:${meta.ip}`, 10, 60_000);
    const form = await req.formData();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
    const ok = !!user && user.role === "ADMIN" && user.isActive && ((await verifyPassword(password, user.passwordHash)) || (latinDigits(password) !== password && (await verifyPassword(latinDigits(password), user.passwordHash))));
    await audit({ actor: { userId: user?.id, role: user?.role, label: user?.displayName ?? "anonymous" }, action: "ADMIN_LOGIN", outcome: ok ? "SUCCESS" : "DENIED", details: { email, area: "manage" } });
    if (!ok) return loginPage("البريد أو كلمة المرور غير صحيحة · Incorrect email or password");
    await createSession(user!.id, "ADMIN", null);
    return NextResponse.redirect(new URL("/manage", url), 303);
  }
  if (sub === "/logout") {
    await destroySession("ADMIN");
    return NextResponse.redirect(new URL("/manage", url), 303);
  }

  const session = await getSession("ADMIN");
  if (!session) return sub === "/" ? loginPage() : NextResponse.json({ error: "Sign in again · سجّل الدخول من جديد" }, { status: 401 });

  const { listener } = await getViewer();
  const bodyText = req.method === "POST" ? await req.text() : "";
  const fakeReq = {
    method: req.method,
    url: sub + url.search,
    headers: {},
    async *[Symbol.asyncIterator]() {
      if (bodyText) yield bodyText;
    },
  };
  return await new Promise<Response>((resolve) => {
    let status = 200;
    let headers: Record<string, string> = {};
    const fakeRes = {
      writeHead(code: number, h: Record<string, string>) {
        status = code;
        headers = h;
      },
      end(b: string) {
        resolve(new Response(b, { status, headers }));
      },
    };
    listener(fakeReq, fakeRes).catch((e) => resolve(NextResponse.json({ error: String((e as Error).message) }, { status: 500 })));
  });
}

export const GET = handle;
export const POST = handle;
