import type { FileFormat } from "@prisma/client";

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // DICOM / JPEG / PNG
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_REPORT_BYTES = 20 * 1024 * 1024;

export const MIME: Record<FileFormat, string> = {
  DICOM: "application/dicom",
  JPEG: "image/jpeg",
  PNG: "image/png",
  PDF: "application/pdf",
  VIDEO: "video/mp4",
};

/** Detect the real file format from magic bytes (never trust the extension or client MIME). */
export function sniffFormat(buf: Buffer): { format: FileFormat; mime: string } | null {
  if (buf.length >= 132 && buf.subarray(128, 132).toString("latin1") === "DICM") return { format: "DICOM", mime: MIME.DICOM };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { format: "PNG", mime: MIME.PNG };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { format: "JPEG", mime: MIME.JPEG };
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return { format: "PDF", mime: MIME.PDF };
  if (buf.length >= 12 && buf.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("latin1");
    return { format: "VIDEO", mime: brand.startsWith("qt") ? "video/quicktime" : "video/mp4" };
  }
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x1a45dfa3) return { format: "VIDEO", mime: "video/webm" };
  return null;
}

export function maxBytesFor(format: FileFormat) {
  if (format === "VIDEO") return MAX_VIDEO_BYTES;
  if (format === "PDF") return MAX_REPORT_BYTES;
  return MAX_IMAGE_BYTES;
}

export function safeFileName(name: string) {
  const cleaned = name.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(-120);
  return cleaned || "file";
}

export function humanSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
