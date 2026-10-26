"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, Download, FileText, ScanLine } from "lucide-react";
import { useT } from "./lang";
import { Spinner } from "./client";

export type ViewerFile = { id: string; kind: "IMAGE" | "REPORT"; format: "DICOM" | "JPEG" | "PNG" | "PDF" | "VIDEO"; fileName: string; mimeType: string; sizeBytes: number };

const sizeStr = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/**
 * Medical file viewer. DICOM is rendered from the original pixel data with window/level for DEMONSTRATION;
 * it is not a diagnostic viewer (production: OHIF / clinically approved viewer over DICOMweb).
 */
export function FileViewer({ files, urlFor }: { files: ViewerFile[]; urlFor: string }) {
  const { t, lang } = useT();
  // Images first (in upload order), report PDFs last.
  const ordered = useMemo(() => [...files].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "IMAGE" ? -1 : 1)), [files]);
  const [idx, setIdx] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const n = ordered.length;
  const go = (i: number) => setIdx(((i % n) + n) % n);
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>(`[data-i="${idx}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [idx]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea,select")) return;
      const fwd = lang === "ar" ? "ArrowLeft" : "ArrowRight", back = lang === "ar" ? "ArrowRight" : "ArrowLeft";
      if (e.key === fwd) setIdx((i) => (i + 1) % n);
      if (e.key === back) setIdx((i) => (i - 1 + n) % n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, lang]);
  const f = ordered[idx];
  if (!f) return <div className="text-sm text-navy-400">{t("لا توجد ملفات", "No files")}</div>;
  const url = urlFor.replace("{id}", f.id);
  const Prev = lang === "ar" ? ChevronRight : ChevronLeft;
  const Next = lang === "ar" ? ChevronLeft : ChevronRight;
  return (
    <div data-testid="viewer" data-count={n} data-index={idx}>
      {/* Top: all images in a strip; click or use the arrows to move between them */}
      <div className="mb-3 flex items-center gap-2">
        {n > 1 && <button type="button" onClick={() => go(idx - 1)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white hover:bg-slate-50" aria-label={t("السابق", "Previous")} data-testid="prev"><Prev className="h-5 w-5" /></button>}
        <div ref={strip} className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1" role="tablist" data-testid="thumbs">
          {ordered.map((x, i) => (
            <button key={x.id} type="button" data-i={i} role="tab" aria-selected={i === idx} onClick={() => setIdx(i)} title={x.fileName}
              className={clsx("relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 bg-black transition", i === idx ? "border-teal ring-2 ring-teal/30" : "border-transparent opacity-70 hover:opacity-100")}>
              <ThumbView file={x} url={urlFor.replace("{id}", x.id)} />
              <span className="absolute bottom-0.5 start-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">{i + 1}</span>
            </button>
          ))}
        </div>
        {n > 1 && <button type="button" onClick={() => go(idx + 1)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white hover:bg-slate-50" aria-label={t("التالي", "Next")} data-testid="next"><Next className="h-5 w-5" /></button>}
      </div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-navy-500">
        <span className="inline-flex min-w-0 items-center gap-2 font-semibold">
          <span className="rounded-md bg-navy px-2 py-0.5 text-white">{idx + 1} / {n}</span>
          <span className="truncate" dir="ltr">{f.fileName}</span>
        </span>
        <span className="inline-flex items-center gap-3">
          <span className="ltr-nums">{f.format} · {sizeStr(f.sizeBytes)}</span>
          <a className="inline-flex items-center gap-1 font-semibold text-medblue underline" href={url + (url.includes("?") ? "&" : "?") + "download=1"}>
            <Download className="h-3.5 w-3.5" />
            {t("تنزيل", "Download")}
          </a>
        </span>
      </div>
      {/* Bottom: the selected image, large */}
      <div className="relative overflow-hidden rounded-xl bg-black">
        {f.format === "DICOM" ? (
          <DicomCanvas key={f.id} url={url} />
        ) : f.format === "VIDEO" ? (
          <video key={f.id} src={url} controls playsInline className="mx-auto max-h-[70vh] w-full" />
        ) : f.format === "PDF" ? (
          <iframe key={f.id} src={url} title={f.fileName} className="h-[70vh] w-full bg-white" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={f.id} src={url} alt={f.fileName} className="mx-auto max-h-[70vh] object-contain" />
        )}
      </div>
    </div>
  );
}

function ThumbView({ file, url }: { file: ViewerFile; url: string }) {
  if (file.format === "JPEG" || file.format === "PNG")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />;
  if (file.format === "DICOM") return <DicomThumb url={url} />;
  if (file.format === "VIDEO") return <video src={url + "#t=0.5"} muted preload="metadata" playsInline className="pointer-events-none h-full w-full object-cover" />;
  return <span className="grid h-full w-full place-items-center bg-white text-navy-400"><FileText className="h-7 w-7" /></span>;
}

type Parsed = { rows: number; cols: number; frames: number; pixels: Int32Array | Uint16Array | Int16Array | Uint8Array; slope: number; intercept: number; wc: number; ww: number; mono1: boolean; meta: Record<string, string> };

const dicomCache = new Map<string, Promise<Parsed>>();
function loadDicom(url: string): Promise<Parsed> {
  let p = dicomCache.get(url);
  if (!p) {
    p = (async () => {
      const dicomParser = (await import("dicom-parser")).default;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const ds = dicomParser.parseDicom(bytes);
      const ts = ds.string("x00020010") ?? "";
      if (!["1.2.840.10008.1.2", "1.2.840.10008.1.2.1"].includes(ts.trim())) throw new Error(`Compressed transfer syntax ${ts} needs a full viewer (OHIF)`);
      const rows = ds.uint16("x00280010")!;
      const cols = ds.uint16("x00280011")!;
      const bits = ds.uint16("x00280100") ?? 16;
      const signed = ds.uint16("x00280103") === 1;
      const frames = Number(ds.string("x00280008") ?? 1) || 1;
      const pe = ds.elements.x7fe00010;
      const buf = bytes.buffer.slice(bytes.byteOffset + pe.dataOffset, bytes.byteOffset + pe.dataOffset + pe.length);
      const pixels = bits === 8 ? new Uint8Array(buf) : signed ? new Int16Array(buf) : new Uint16Array(buf);
      const slope = ds.floatString("x00281053") ?? 1;
      const intercept = ds.floatString("x00281052") ?? 0;
      let wc = ds.floatString("x00281050");
      let ww = ds.floatString("x00281051");
      if (wc === undefined || ww === undefined) {
        let mn = Infinity, mx = -Infinity;
        for (let i = 0; i < rows * cols; i++) { const v = pixels[i] * slope + intercept; if (v < mn) mn = v; if (v > mx) mx = v; }
        wc = (mx + mn) / 2; ww = Math.max(1, mx - mn);
      }
      const meta: Record<string, string> = {
        Modality: ds.string("x00080060") ?? "—",
        Description: ds.string("x00081030") ?? "—",
        Size: `${cols} × ${rows}${frames > 1 ? ` × ${frames}` : ""}`,
        Bits: `${bits}${signed ? " signed" : ""}`,
        Spacing: ds.string("x00280030") ?? "—",
      };
      return { rows, cols, frames, pixels, slope, intercept, wc, ww, mono1: (ds.string("x00280004") ?? "").includes("MONOCHROME1"), meta };
    })();
    dicomCache.set(url, p);
    p.catch(() => dicomCache.delete(url));
  }
  return p;
}

function drawDicom(c: HTMLCanvasElement, d: Parsed, wl: { wc: number; ww: number }, frame: number) {
  c.width = d.cols;
  c.height = d.rows;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(d.cols, d.rows);
  const n = d.rows * d.cols;
  const off = frame * n;
  const lo = wl.wc - wl.ww / 2;
  for (let i = 0; i < n; i++) {
    let v = ((d.pixels[off + i] * d.slope + d.intercept - lo) / wl.ww) * 255;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    if (d.mono1) v = 255 - v;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function DicomThumb({ url }: { url: string }) {
  const c = useRef<HTMLCanvasElement>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    let alive = true;
    loadDicom(url).then((d) => { if (alive && c.current) drawDicom(c.current, d, { wc: d.wc, ww: d.ww }, 0); }, () => alive && setBad(true));
    return () => { alive = false; };
  }, [url]);
  return bad ? <span className="grid h-full w-full place-items-center text-white/70"><ScanLine className="h-7 w-7" /></span> : <canvas ref={c} className="h-full w-full object-cover" />;
}

function DicomCanvas({ url }: { url: string }) {
  const { t } = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [d, setD] = useState<Parsed | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [wl, setWl] = useState<{ wc: number; ww: number } | null>(null);
  const drag = useRef<{ x: number; y: number; wc: number; ww: number } | null>(null);

  useEffect(() => {
    let alive = true;
    loadDicom(url).then(
      (p) => { if (alive) { setD(p); setWl({ wc: p.wc, ww: p.ww }); } },
      (e) => { if (alive) setErr((e as Error).message); },
    );
    return () => { alive = false; };
  }, [url]);

  useEffect(() => {
    if (!d || !wl || !canvas.current) return;
    drawDicom(canvas.current, d, wl, frame);
  }, [d, wl, frame]);

  if (err) return <div className="p-6 text-sm text-red-200">{t("تعذّر عرض ملف DICOM:", "Could not render DICOM:")} {err}</div>;
  if (!d || !wl) return <div className="grid h-72 place-items-center text-slate-300"><Spinner className="h-6 w-6" /></div>;
  return (
    <div className="relative">
      <canvas
        ref={canvas}
        className="mx-auto block max-h-[70vh] w-auto max-w-full cursor-crosshair touch-none [image-rendering:auto]"
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ...wl }; }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
          setWl({ ww: Math.max(1, drag.current.ww + dx * (d.ww / 200)), wc: drag.current.wc + dy * (d.ww / 400) });
        }}
        onPointerUp={() => (drag.current = null)}
        aria-label="DICOM image"
      />
      <div className="pointer-events-none absolute start-3 top-3 space-y-0.5 font-mono text-[11px] text-emerald-300/90" dir="ltr">
        {Object.entries(d.meta).map(([k, v]) => <div key={k}>{k}: {v}</div>)}
        <div>W/L: {Math.round(wl.ww)} / {Math.round(wl.wc)}</div>
      </div>
      <div className="flex flex-wrap items-center gap-3 bg-slate-900 px-3 py-2 text-xs text-slate-300">
        <span>{t("اسحب لضبط النافذة/المستوى", "Drag to adjust window/level")}</span>
        <button className="rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => setWl({ wc: d.wc, ww: d.ww })}>{t("إعادة الضبط", "Reset")}</button>
        {d.frames > 1 && (
          <label className="flex items-center gap-2">
            {t("الإطار", "Frame")} {frame + 1}/{d.frames}
            <input type="range" min={0} max={d.frames - 1} value={frame} onChange={(e) => setFrame(Number(e.target.value))} />
          </label>
        )}
      </div>
    </div>
  );
}
