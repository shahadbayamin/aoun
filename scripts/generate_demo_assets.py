#!/usr/bin/env python3
"""
Generate SYNTHETIC demonstration imaging assets for Aoun.

Everything produced here is computer-generated (mathematical phantoms). No real patient
data is used. Output goes to ./demo-assets and is committed with the repository, so this
script only needs to be re-run if you want to regenerate the assets.

Requires: numpy, Pillow, reportlab, ffmpeg (for the MP4).
"""
import os
import struct
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

OUT = os.path.join(os.path.dirname(__file__), "..", "demo-assets")
os.makedirs(OUT, exist_ok=True)


# ───────────────────────── synthetic phantoms ─────────────────────────

def shepp_logan(n=256, slice_shift=0.0):
    """Modified Shepp-Logan head phantom; slice_shift moves/scales ellipses to fake a slice series."""
    E = [
        (1.0, 0.69, 0.92, 0, 0, 0),
        (-0.8, 0.6624, 0.874, 0, -0.0184, 0),
        (-0.2, 0.11, 0.31, 0.22, 0, -18),
        (-0.2, 0.16, 0.41, -0.22, 0, 18),
        (0.1, 0.21, 0.25, 0, 0.35, 0),
        (0.1, 0.046, 0.046, 0, 0.1, 0),
        (0.1, 0.046, 0.046, 0, -0.1, 0),
        (0.1, 0.046, 0.023, -0.08, -0.605, 0),
        (0.1, 0.023, 0.023, 0, -0.606, 0),
        (0.1, 0.023, 0.046, 0.06, -0.605, 0),
        # a small bright "lesion" for the demo report to describe
        (0.25, 0.05 + 0.02 * slice_shift, 0.04 + 0.02 * slice_shift, 0.32, 0.18, 30),
    ]
    y, x = np.mgrid[-1:1:n * 1j, -1:1:n * 1j]
    img = np.zeros((n, n))
    s = 1.0 - 0.12 * abs(slice_shift)
    for A, a, b, x0, y0, phi in E:
        a, b = a * s, b * s
        t = np.radians(phi)
        xr = (x - x0) * np.cos(t) + (y - y0) * np.sin(t)
        yr = -(x - x0) * np.sin(t) + (y - y0) * np.cos(t)
        img[(xr / a) ** 2 + (yr / b) ** 2 <= 1] += A
    img = np.clip(img, 0, None)
    img = img / img.max()
    rng = np.random.default_rng(42)
    img = img + rng.normal(0, 0.015, img.shape)
    pil = Image.fromarray(np.uint8(np.clip(img, 0, 1) * 255)).filter(ImageFilter.GaussianBlur(0.8))
    return np.asarray(pil).astype(np.float64) / 255.0


def chest_xray(n=512):
    y, x = np.mgrid[-1:1:n * 1j, -1:1:n * 1j]
    img = np.full((n, n), 0.75)
    for cx in (-0.42, 0.42):  # lungs
        img[((x - cx) / 0.33) ** 2 + ((y + 0.05) / 0.62) ** 2 <= 1] = 0.18
    img[((x + 0.08) / 0.22) ** 2 + ((y - 0.25) / 0.3) ** 2 <= 1] = 0.7  # heart
    img[np.abs(x) < 0.06] = np.maximum(img[np.abs(x) < 0.06], 0.85)  # spine
    for k in range(-5, 7):  # ribs
        yy = k * 0.13
        band = np.abs(y - yy - 0.15 * x ** 2) < 0.018
        img[band & (np.abs(x) > 0.08) & (np.abs(x) < 0.8)] += 0.25
    rng = np.random.default_rng(7)
    img = np.clip(img + rng.normal(0, 0.02, img.shape), 0, 1)
    return np.asarray(Image.fromarray(np.uint8(img * 255)).filter(ImageFilter.GaussianBlur(2))).astype(np.float64) / 255.0


def label(img8: Image.Image, text: str):
    d = ImageDraw.Draw(img8)
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", max(10, img8.width // 32))
    except OSError:
        f = ImageFont.load_default()
    d.text((8, 6), text, fill=255, font=f)
    return img8


# ───────────────────────── minimal DICOM writer ─────────────────────────

def _el(group, elem, vr, value: bytes):
    if len(value) % 2:
        value += b"\x00" if vr in ("UI", "OB", "OW") else b" "
    if vr in ("OB", "OW", "SQ", "UN", "UT"):
        return struct.pack("<HH2sHI", group, elem, vr.encode(), 0, len(value)) + value
    return struct.pack("<HH2sH", group, elem, vr.encode(), len(value)) + value


def write_dicom(path, pixels16: np.ndarray, modality="MR", sop_class="1.2.840.10008.5.1.4.1.1.4", desc="DEMO MRI BRAIN"):
    import uuid
    uid = lambda: ("2.25." + str(uuid.uuid4().int)).encode()
    sop_uid = uid()
    rows, cols = pixels16.shape
    meta = b"".join([
        _el(0x0002, 0x0001, "OB", b"\x00\x01"),
        _el(0x0002, 0x0002, "UI", sop_class.encode()),
        _el(0x0002, 0x0003, "UI", sop_uid),
        _el(0x0002, 0x0010, "UI", b"1.2.840.10008.1.2.1"),
        _el(0x0002, 0x0012, "UI", b"2.25.1234567890"),
        _el(0x0002, 0x0013, "SH", b"TAREE_DEMO"),
    ])
    meta = _el(0x0002, 0x0000, "UL", struct.pack("<I", len(meta))) + meta
    ds = b"".join([
        _el(0x0008, 0x0016, "UI", sop_class.encode()),
        _el(0x0008, 0x0018, "UI", sop_uid),
        _el(0x0008, 0x0060, "CS", modality.encode()),
        _el(0x0008, 0x0070, "LO", b"SYNTHETIC PHANTOM"),
        _el(0x0008, 0x1030, "LO", desc.encode()),
        _el(0x0010, 0x0010, "PN", b"DEMO^FICTIONAL"),
        _el(0x0010, 0x0020, "LO", b"DEMO-0000"),
        _el(0x0020, 0x000D, "UI", uid()),
        _el(0x0020, 0x000E, "UI", uid()),
        _el(0x0028, 0x0002, "US", struct.pack("<H", 1)),
        _el(0x0028, 0x0004, "CS", b"MONOCHROME2"),
        _el(0x0028, 0x0010, "US", struct.pack("<H", rows)),
        _el(0x0028, 0x0011, "US", struct.pack("<H", cols)),
        _el(0x0028, 0x0030, "DS", b"0.9\\0.9"),
        _el(0x0028, 0x0100, "US", struct.pack("<H", 16)),
        _el(0x0028, 0x0101, "US", struct.pack("<H", 12)),
        _el(0x0028, 0x0102, "US", struct.pack("<H", 11)),
        _el(0x0028, 0x0103, "US", struct.pack("<H", 0)),
        _el(0x0028, 0x1050, "DS", b"2048"),
        _el(0x0028, 0x1051, "DS", b"4096"),
        _el(0x7FE0, 0x0010, "OW", pixels16.astype("<u2").tobytes()),
    ])
    with open(path, "wb") as f:
        f.write(b"\x00" * 128 + b"DICM" + meta + ds)


def report_pdf(path, title, lines):
    c = canvas.Canvas(path, pagesize=A4)
    w, h = A4
    c.setFillColorRGB(0.03, 0.5, 0.55)
    c.rect(0, h - 70, w, 70, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(40, h - 45, "Aoun Demo Hospital - Radiology Report")
    c.setFillColorRGB(0.85, 0.18, 0.13)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, h - 92, "FICTIONAL DEMONSTRATION DOCUMENT - NOT A REAL PATIENT - NOT FOR CLINICAL USE")
    c.setFillColorRGB(0.06, 0.16, 0.26)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, h - 125, title)
    c.setFont("Helvetica", 11)
    y = h - 155
    for ln in lines:
        c.drawString(40, y, ln)
        y -= 18
    c.showPage()
    c.save()


def main():
    # MRI brain (DICOM + PNG + cine MP4)
    mri = shepp_logan(256)
    write_dicom(os.path.join(OUT, "demo-mri-brain.dcm"), np.uint16(mri * 4095))
    label(Image.fromarray(np.uint8(mri * 255)), "DEMO MRI - SYNTHETIC").save(os.path.join(OUT, "demo-mri-brain.png"))

    with tempfile.TemporaryDirectory() as td:
        for i, s in enumerate(np.linspace(-1, 1, 36)):
            fr = shepp_logan(256, slice_shift=float(s))
            label(Image.fromarray(np.uint8(fr * 255)), f"DEMO MRI CINE {i + 1:02d}/36").resize((512, 512)).save(os.path.join(td, f"f{i:03d}.png"))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "12", "-i", os.path.join(td, "f%03d.png"),
                        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                        os.path.join(OUT, "demo-mri-cine.mp4")], check=True)

    # Chest X-ray (JPEG + DICOM)
    cx = chest_xray(512)
    label(Image.fromarray(np.uint8(cx * 255)), "DEMO CHEST X-RAY - SYNTHETIC").convert("RGB").save(os.path.join(OUT, "demo-chest-xray.jpg"), quality=90)
    write_dicom(os.path.join(OUT, "demo-chest-xray.dcm"), np.uint16(cx * 4095), modality="DX",
                sop_class="1.2.840.10008.5.1.4.1.1.1.1", desc="DEMO CHEST XRAY")

    report_pdf(os.path.join(OUT, "demo-mri-report.pdf"), "MRI Brain without contrast (synthetic phantom)", [
        "Technique: Multiplanar multisequence MRI of the brain (demonstration data).",
        "Findings: Small well-defined hyperintense focus in the right parietal region",
        "measuring approximately 9 x 7 mm. No mass effect or midline shift.",
        "Ventricles and sulci are within normal limits for age.",
        "Impression: Small right parietal focus - recommend clinical correlation and",
        "follow-up MRI in 6 months.",
        "",
        "Reporting radiologist: Dr. Demo Radiologist (fictional)",
    ])
    report_pdf(os.path.join(OUT, "demo-chest-report.pdf"), "Chest X-ray PA view (synthetic phantom)", [
        "Findings: Lungs are clear. No focal consolidation, effusion or pneumothorax.",
        "Cardiomediastinal silhouette within normal limits.",
        "Impression: No acute cardiopulmonary abnormality.",
    ])
    print("Demo assets written to", os.path.abspath(OUT))
    for f in sorted(os.listdir(OUT)):
        print(f"  {f:28s} {os.path.getsize(os.path.join(OUT, f)):>10,d} bytes")


if __name__ == "__main__":
    main()
