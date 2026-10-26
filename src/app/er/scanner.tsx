"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { Camera, CameraOff, ClipboardPaste, MonitorSmartphone, ScanLine } from "lucide-react";
import { api, Spinner } from "@/components/client";
import { useT } from "@/components/lang";

export function Scanner({ disabled, demo }: { disabled?: boolean; demo: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const handled = useRef(false);
  const [cam, setCam] = useState<"off" | "starting" | "on">("off");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [paste, setPaste] = useState("");

  const stop = () => { stream.current?.getTracks().forEach((x) => x.stop()); stream.current = null; setCam("off"); };
  useEffect(() => stop, []);

  const go = async (url: string, body: unknown, k: string) => {
    setBusy(k); setErr(null);
    const r = await api<{ redirect: string }>(url, { body });
    if (!r.ok) {
      setBusy(null); handled.current = false;
      return setErr(r.error === "INVALID_QR" ? t("الرمز غير صالح أو منتهي أو مستخدم. اطلب من المريض رمزاً جديداً.", "The code is invalid, expired or already used. Ask the patient for a new code.") : r.message);
    }
    stop();
    router.push(r.data.redirect);
  };
  const submit = (payload: string) => { if (handled.current) return; handled.current = true; go("/api/er/scan", { payload }, "scan"); };

  const start = async () => {
    setErr(null); setCam("starting"); handled.current = false;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      stream.current = s;
      const v = video.current!;
      v.srcObject = s;
      await v.play();
      setCam("on");
      const tick = () => {
        if (!stream.current || handled.current) return;
        if (v.readyState === v.HAVE_ENOUGH_DATA) {
          const c = canvas.current!;
          c.width = v.videoWidth; c.height = v.videoHeight;
          const ctx = c.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: "dontInvert" });
          if (code?.data) return submit(code.data);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) {
      setCam("off");
      setErr(t("تعذّر تشغيل الكاميرا. اسمح للمتصفح باستخدام الكاميرا أو استخدم «محاكاة مسح QR».", "Could not start the camera. Allow camera access or use “Simulate QR scan”.") + ` (${(e as Error).name})`);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <section className="card card-pad lg:col-span-3">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-navy">
          <video ref={video} className={`h-full w-full object-cover ${cam === "on" ? "" : "hidden"}`} playsInline muted />
          {cam === "on" && <div className="pointer-events-none absolute inset-[18%] rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(15,42,67,0.45)]" />}
          {cam !== "on" && <div className="absolute inset-0 grid place-items-center text-slate-300"><div className="text-center"><ScanLine className="mx-auto h-12 w-12" /><div className="mt-2 text-sm">{t("وجّه الكاميرا إلى رمز المريض", "Point the camera at the patient's code")}</div></div></div>}
          {busy && <div className="absolute inset-0 grid place-items-center bg-navy/70 text-white"><div className="text-center"><Spinner className="mx-auto h-8 w-8" /><div className="mt-2 text-sm">{t("جارٍ التعرف على المريض وجلب الأشعة…", "Identifying the patient and retrieving imaging…")}</div></div></div>}
        </div>
        <canvas ref={canvas} className="hidden" />
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {cam !== "on" ? (
            <button className="btn-danger btn-lg" onClick={start} disabled={disabled || cam === "starting" || !!busy}>{cam === "starting" ? <Spinner /> : <Camera className="h-5 w-5" />}{t("مسح رمز المريض", "Scan patient QR")}</button>
          ) : (
            <button className="btn-secondary btn-lg" onClick={stop}><CameraOff className="h-5 w-5" />{t("إيقاف الكاميرا", "Stop camera")}</button>
          )}
          {demo && (
            <button className="btn-secondary btn-lg" onClick={() => go("/api/er/simulate-scan", {}, "sim")} disabled={disabled || !!busy} data-testid="simulate">
              {busy === "sim" ? <Spinner /> : <MonitorSmartphone className="h-5 w-5" />}{t("محاكاة مسح QR", "Simulate QR scan")}
            </button>
          )}
        </div>
        {err && <div className="mt-3 rounded-xl bg-emergency-50 px-3 py-2 text-sm text-emergency-700" role="alert">{err}</div>}
      </section>
      <section className="card card-pad lg:col-span-2">
        <h2 className="section-title">{t("إدخال رمز البطاقة", "Enter the card code")}</h2>
        <p className="mt-1 text-sm text-navy-400">{t("إذا لم تتوفر كاميرا: اطلب من المريض الرمز المكوّن من 6 أحرف الظاهر تحت رمز QR في بطاقته.", "No camera? Ask the patient for the 6-character code shown under the QR on their card.")}</p>
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); handled.current = false; submit(paste.trim()); }}>
          <input
            className="input text-center font-mono text-2xl font-bold uppercase tracking-[0.35em]"
            dir="ltr"
            maxLength={7}
            value={paste}
            onChange={(e) => setPaste(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            placeholder="______"
            disabled={disabled}
            autoComplete="off"
            data-testid="qr-paste"
          />
          <button className="btn-primary w-full" disabled={disabled || paste.length !== 6 || !!busy}><ClipboardPaste className="h-4 w-4" />{t("فتح سجل المريض", "Open patient record")}</button>
        </form>
      </section>
    </div>
  );
}
