"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { CheckCircle2, CloudUpload, FileVideo, Image as ImageIcon, Plus, RotateCcw, ScanLine, ShieldAlert, UserCheck, X, XCircle } from "lucide-react";
import { api, Spinner } from "@/components/client";
import { useT } from "@/components/lang";
import { onlyDigits } from "@/lib/digits";

type Job = { status: string; attempts: number; maxAttempts: number; lastError: string | null; tareeReference: string | null; completedAt: string | null };
type Phase = "idle" | "uploading" | "syncing" | "done" | "error";

const TYPES = [
  ["XRAY", "أشعة سينية", "X-ray"],
  ["MRI", "رنين مغناطيسي", "MRI"],
  ["CT", "أشعة مقطعية", "CT scan"],
  ["ULTRASOUND", "موجات فوق صوتية", "Ultrasound"],
  ["OTHER", "أخرى", "Other"],
] as const;

/** grantId: adding imaging from a scanned card — the patient is already known, no ID typing. */
export function UploadForm({ grantId, patientName }: { grantId?: string; patientName?: string } = {}) {
  const { t, lang } = useT();
  const router = useRouter();
  const [nid, setNid] = useState("");
  const [who, setWho] = useState<{ found: boolean; fullNameAr?: string; fullNameEn?: string } | null>(null);
  const [modality, setModality] = useState("MRI");
  const [files, setFiles] = useState<File[]>([]);
  const [report, setReport] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [job, setJob] = useState<Job | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const studyId = useRef<string | null>(null);

  // Confirm the patient's name from the hospital's own index as the ID is typed.
  useEffect(() => {
    setWho(null);
    if (!/^[12]\d{9}$/.test(nid)) return;
    const h = setTimeout(async () => {
      const r = await api<{ found: boolean; fullNameAr?: string; fullNameEn?: string }>("/api/radiology/lookup", { body: { nationalId: nid } });
      if (r.ok) setWho(r.data);
    }, 250);
    return () => clearTimeout(h);
  }, [nid]);

  // Follow the REAL synchronization status until it is final.
  useEffect(() => {
    if (phase !== "syncing") return;
    const id = setInterval(async () => {
      const r = await api<{ job: Job | null }>(`/api/radiology/studies/${studyId.current}/status`);
      if (!r.ok || !r.data.job) return;
      setJob(r.data.job);
      if (r.data.job.status === "SYNCED") { setPhase("done"); router.refresh(); }
      if (r.data.job.status === "FAILED" || r.data.job.status === "QUARANTINED") { setPhase("error"); router.refresh(); }
    }, 600);
    return () => clearInterval(id);
  }, [phase, router]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const add = [...list].filter((f) => f.size > 0);
    setFiles((cur) => [...cur, ...add.filter((f) => !cur.some((c) => c.name === f.name && c.size === f.size))].slice(0, 30));
  };

  const submit = () => {
    setErr(null);
    if (!grantId && !/^[12]\d{9}$/.test(nid)) return setErr(t("أدخل رقم هوية / إقامة صحيح (10 أرقام)", "Enter a valid 10-digit ID / Iqama"));
    if (!files.length) return setErr(t("ارفع ملف الأشعة", "Upload the imaging file"));
    if (report.trim().length < 10) return setErr(t("اكتب تقريراً مختصراً (10 أحرف على الأقل)", "Write a short report (at least 10 characters)"));
    const fd = new FormData();
    if (grantId) fd.append("grantId", grantId);
    else fd.append("nationalId", nid);
    fd.append("modality", modality);
    fd.append("report", report);
    for (const f of files) fd.append("file", f);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/radiology/submit");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let j: Record<string, unknown> = {};
      try { j = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 400) { setPhase("idle"); return setErr(String(j.message ?? `HTTP ${xhr.status}`)); }
      studyId.current = String(j.studyId);
      setJob(null);
      setPhase("syncing");
    };
    xhr.onerror = () => { setPhase("idle"); setErr(t("انقطع الاتصال", "Network error")); };
    setProgress(0);
    setPhase("uploading");
    xhr.send(fd);
  };

  const reset = () => { setNid(""); setFiles([]); setReport(""); setModality("MRI"); setPhase("idle"); setJob(null); setErr(null); studyId.current = null; };
  const busy = phase === "uploading" || phase === "syncing";
  const locked = phase !== "idle";

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <form className="card card-pad space-y-5 lg:col-span-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {grantId ? (
          <div>
            <span className="label">1. {t("المريض", "Patient")}</span>
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800" data-testid="card-patient"><UserCheck className="h-4 w-4" />{patientName}<span className="font-normal text-emerald-700">· {t("من البطاقة الممسوحة", "from the scanned card")}</span></div>
          </div>
        ) : (
        <div>
          <label className="label" htmlFor="nid">1. {t("رقم الهوية / الإقامة للمريض", "Patient National ID / Iqama")}</label>
          <input id="nid" className="input ltr-nums text-lg" inputMode="numeric" maxLength={10} value={nid} disabled={locked} onChange={(e) => setNid(onlyDigits(e.target.value))} placeholder="1098765432" data-testid="nid" />
          {who?.found && <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><UserCheck className="h-4 w-4" />{lang === "ar" ? who.fullNameAr : who.fullNameEn}</div>}
          {who && !who.found && <div className="mt-2 text-sm text-emergency">{t("المريض غير مسجل في هذا المستشفى", "Patient not registered at this hospital")}</div>}
        </div>
        )}
        <div>
          <label className="label" htmlFor="type">2. {t("نوع الأشعة", "Medical imaging type")}</label>
          <select id="type" className="input" value={modality} disabled={locked} onChange={(e) => setModality(e.target.value)} data-testid="modality">
            {TYPES.map(([v, ar, en]) => <option key={v} value={v}>{lang === "ar" ? ar : en}</option>)}
          </select>
        </div>
        <div>
          <span className="label">3. {t("ملفات الأشعة (يمكن اختيار أكثر من صورة)", "Imaging files (you can choose several images)")}</span>
          <label
            className={clsx("flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed px-4 py-5 transition", files.length ? "border-teal-200 bg-teal-50/50" : "border-medblue-100 bg-medblue-50/40 hover:border-medblue", locked && "pointer-events-none opacity-70")}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (!locked) addFiles(e.dataTransfer.files); }}
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-medblue shadow-sm">{files.length ? <Plus className="h-6 w-6" /> : <CloudUpload className="h-6 w-6" />}</span>
            <span className="min-w-0">
              <span className="block font-semibold">{files.length ? t("إضافة صور أخرى", "Add more images") : t("اختر ملفاً أو أكثر", "Choose one or more files")}</span>
              <span className="block text-xs text-navy-400" dir="ltr">DICOM · JPG · PNG · MP4</span>
            </span>
            <input type="file" multiple className="sr-only" accept=".dcm,.dicom,application/dicom,image/jpeg,image/png,video/mp4,.mp4" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} data-testid="file" />
          </label>
          {files.length > 0 && (
            <div className="mt-3" data-testid="file-list">
              <div className="mb-2 text-xs font-semibold text-navy-400">{files.length} {t("ملف", files.length === 1 ? "file" : "files")} · {(files.reduce((n, f) => n + f.size, 0) / 1048576).toFixed(2)} MB</div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {files.map((f, i) => (
                  <div key={i + f.name} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <Thumb file={f} />
                    <div className="truncate px-2 py-1 text-[11px]" dir="ltr">{f.name}</div>
                    {!locked && <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute end-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-navy shadow hover:text-emergency" aria-label={t("إزالة", "Remove")}><X className="h-3.5 w-3.5" /></button>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div>
          <label className="label" htmlFor="rep">4. {t("تقرير الأشعة المختصر", "Short radiology report")}</label>
          <textarea id="rep" className="input min-h-[110px]" dir="auto" value={report} disabled={locked} onChange={(e) => setReport(e.target.value)} placeholder={t("مثال: رنين مغناطيسي للدماغ — لا توجد علامات نزيف أو كتلة.", "e.g. MRI brain — no haemorrhage or mass.")} data-testid="report" />
        </div>
        {err && <div className="rounded-xl bg-emergency-50 px-3 py-2 text-sm text-emergency-700" role="alert">{err}</div>}
        {phase === "idle" ? (
          <button className="btn-primary btn-lg w-full text-lg" data-testid="save-confirm"><CheckCircle2 className="h-5 w-5" />حفظ وتأكيد</button>
        ) : phase === "done" || phase === "error" ? (
          <button type="button" className="btn-secondary btn-lg w-full" onClick={reset}><RotateCcw className="h-5 w-5" />{t("رفع أشعة جديدة", "Upload another scan")}</button>
        ) : (
          <button type="button" className="btn-primary btn-lg w-full" disabled><Spinner className="h-5 w-5" />{t("جارٍ الحفظ والمزامنة…", "Saving & synchronizing…")}</button>
        )}
      </form>

      <aside className="card card-pad lg:col-span-2" data-testid="sync-status" data-phase={phase} data-status={job?.status ?? ""}>
        <h2 className="section-title">{t("حالة المزامنة", "Synchronization status")}</h2>
        <ol className="mt-4 space-y-3">
          <Step state={phase === "idle" ? "todo" : phase === "uploading" ? "active" : "done"} text={phase === "uploading" ? `${t("رفع الملفات وحفظها", "Uploading & saving files")} ${progress}%` : t("رفع الملفات وحفظها", "Files uploaded & saved")} />
          <Step state={phase === "idle" || phase === "uploading" ? "todo" : "done"} text={t("تأكيد الأشعة في نظام المستشفى", "Scan confirmed in hospital system")} />
          <Step
            state={phase === "syncing" ? "active" : phase === "done" ? "done" : phase === "error" ? "bad" : "todo"}
            text={phase === "error" ? (job?.status === "QUARANTINED" ? t("لم يتم الربط — تعذّر التحقق من هوية المريض", "Not linked — patient identity could not be verified") : t("فشلت المزامنة", "Synchronization failed")) : job?.status === "RETRY" ? t("إعادة المحاولة تلقائياً…", "Retrying automatically…") : t("الإرسال إلى عون والربط بسجل المريض", "Sending to Aoun & linking to the patient record")}
          />
        </ol>
        {phase === "done" && job && (
          <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-emerald-800" role="status" data-testid="success">
            <div className="flex items-start gap-2 font-semibold"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><span>تم ربط الأشعة بسجل المريض بنجاح، ويمكن الوصول لها فوراً عبر بطاقة الطوارئ.</span></div>
            <dl className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between gap-3"><dt>{t("رقم المرجع", "Reference")}</dt><dd className="font-mono font-semibold">{job.tareeReference}</dd></div>
              <div className="flex justify-between gap-3"><dt>{t("وقت المزامنة", "Synced at")}</dt><dd>{job.completedAt ? new Date(job.completedAt).toLocaleTimeString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { timeZone: "Asia/Riyadh" }) : ""}</dd></div>
            </dl>
          </div>
        )}
        {phase === "error" && (
          <div className="mt-5 rounded-2xl bg-emergency-50 p-4 text-sm text-emergency-700" role="alert">
            {job?.status === "QUARANTINED"
              ? t("استلمت المنصة الأشعة لكنها لم تربطها بأي سجل لأن بيانات هوية المريض في المستشفى لا تطابق الهوية الموثّقة. تمنع المنصة الربط بمريض خاطئ.", "Aoun received the scan but did not link it to any record because the patient's identity details at this hospital do not match the verified identity. Aoun never links to the wrong patient.")
              : job?.lastError}
          </div>
        )}
        {phase === "idle" && <p className="mt-5 text-sm text-navy-400">{t("لا حاجة لأي رفع إضافي أو نقل يدوي بعد الضغط على «حفظ وتأكيد».", "No extra upload or manual transfer is needed after “Save & Confirm”.")}</p>}
      </aside>
    </div>
  );
}

/** Small preview of a chosen file (photos are shown; DICOM and video get an icon). */
function Thumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const I = file.type.startsWith("video") ? FileVideo : /\.dcm$|\.dicom$/i.test(file.name) || !file.type ? ScanLine : ImageIcon;
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="aspect-square w-full object-cover" />
  ) : (
    <div className="grid aspect-square w-full place-items-center bg-navy text-white/80"><I className="h-8 w-8" /></div>
  );
}

function Step({ state, text }: { state: "todo" | "active" | "done" | "bad"; text: string }) {
  return (
    <li className={clsx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm", state === "done" ? "bg-emerald-50 text-emerald-800" : state === "active" ? "bg-medblue-50 text-medblue-700" : state === "bad" ? "bg-emergency-50 text-emergency-700" : "bg-slate-50 text-navy-400")}>
      {state === "done" ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : state === "active" ? <Spinner className="h-5 w-5 shrink-0" /> : state === "bad" ? (text.includes("هوية") || text.includes("identity") ? <ShieldAlert className="h-5 w-5 shrink-0" /> : <XCircle className="h-5 w-5 shrink-0" />) : <span className="h-5 w-5 shrink-0 rounded-full border-2 border-current" />}
      <span className="font-medium">{text}</span>
    </li>
  );
}
