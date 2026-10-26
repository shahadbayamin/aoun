/** Stream a decrypted file to an authorized viewer. Supports HTTP Range (needed for video seeking / Safari). */
export function sendFile(req: Request, buf: Buffer, mime: string, fileName: string, download = false) {
  const base: Record<string, string> = {
    "content-type": mime,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    "accept-ranges": "bytes",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'; object-src 'self'; plugin-types application/pdf",
  };
  const range = req.headers.get("range");
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : buf.length - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : buf.length - 1;
    start = Math.max(0, start);
    end = Math.min(buf.length - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${buf.length}` } });
    const chunk = buf.subarray(start, end + 1);
    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: { ...base, "content-range": `bytes ${start}-${end}/${buf.length}`, "content-length": String(chunk.length) },
    });
  }
  return new Response(new Uint8Array(buf), { status: 200, headers: { ...base, "content-length": String(buf.length) } });
}
