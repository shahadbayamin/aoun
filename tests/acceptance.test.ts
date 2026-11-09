/**
 * End-to-end test of the ONE Aoun workflow (spec §6), against a running server:
 *   Hospital A "حفظ وتأكيد" → Aoun saves & links to the patient → patient QR → Hospital B scan → same file.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { seedDemo } from "@/lib/demo/seed";
import { verifyAuditChain } from "@/lib/audit";
import { buildPayload, INTEGRATION_PATH } from "@/lib/sync/engine";
import { signedHeaders } from "@/lib/integration/hmac";
import { decryptSecret } from "@/lib/crypto";
import { walletToken } from "@/lib/wallet";
import { asset, BASE, Client, patientLogin, prisma, proLogin, saveAndConfirm, sha, waitForSync } from "./helpers";

const SARA = { id: "1098765432", phone: "0500000001" };
const KHALID = { id: "1087654321", phone: "0500000002" };
const FAISAL = "1076543210";
const REPORT = `MRI brain: no haemorrhage, mass or acute infarct. Test ${Date.now()}`;

let rad: Client, sara: Client, khalid: Client, fahad: Client, reem: Client, majed: Client;
let studyId: string, ref: string, tareeStudyId: string, fileId: string, grantId: string;

beforeAll(async () => {
  await seedDemo(prisma);
  rad = await proLogin("huda@alamal.med");
  fahad = await proLogin("fahad@alshifa.med");
  reem = await proLogin("reem@alshifa.med");
  majed = await proLogin("majed@alshifa.med");
  sara = await patientLogin(SARA.id, SARA.phone);
  khalid = await patientLogin(KHALID.id, KHALID.phone);
});
afterAll(() => prisma.$disconnect());

describe("The Aoun workflow", () => {
  it("starts with no hardcoded imaging records", async () => {
    expect(await prisma.imagingStudy.count()).toBe(0);
  });

  it("1-2. Hospital A uploads a new file and clicks حفظ وتأكيد (one request)", async () => {
    const r = await saveAndConfirm(rad, SARA.id, "MRI", "demo-mri-cine.mp4", REPORT);
    expect(r.status).toBe(200);
    studyId = r.data.studyId;
    const job = await waitForSync(rad, studyId);
    expect(job.status).toBe("SYNCED");
    ref = job.tareeReference;
  });

  it("3. the file is actually saved in persistent (encrypted) storage", async () => {
    const st = await prisma.imagingStudy.findUniqueOrThrow({ where: { referenceNumber: ref }, include: { files: true, report: true } });
    tareeStudyId = st.id;
    fileId = st.files[0].id;
    expect(st.files).toHaveLength(1);
    expect(st.files[0].sha256).toBe(sha(asset("demo-mri-cine.mp4")));
    let stored: Buffer;
    if (process.env.VERCEL || process.env.STORAGE_DRIVER === "db") {
      const rows = await prisma.$queryRaw<{ data: Uint8Array }[]>`SELECT "data" FROM "StoredObject" WHERE "key" = ${st.files[0].storageKey}`;
      expect(rows).toHaveLength(1);
      stored = Buffer.from(rows[0].data);
    } else {
      const onDisk = path.resolve(process.env.STORAGE_DIR || "./storage", st.files[0].storageKey + ".enc");
      expect(fs.existsSync(onDisk)).toBe(true);
      stored = fs.readFileSync(onDisk);
    }
    expect(stored.includes(asset("demo-mri-cine.mp4").subarray(0, 64))).toBe(false); // encrypted at rest
    expect(st.report?.text).toBe(REPORT);
  });

  it("4. the record is linked to the correct fictional patient", async () => {
    const st = await prisma.imagingStudy.findUniqueOrThrow({ where: { id: tareeStudyId }, include: { patient: true, sourceHospital: true } });
    expect(st.patient?.fullNameEn).toMatch(/^Sara/);
    expect(st.sourceHospital.code).toBe("HOSP-A");
  });

  it("5. the patient opens the medical card (with the study in her history) and gets a QR", async () => {
    const page = await sara.page("/patient?tab=imaging");
    expect(page.status).toBe(200);
    expect(page.html).toMatch(/سارة/);
    expect(page.html).toContain(`/patient/study/${tareeStudyId}`);
    expect((await sara.page("/patient")).html).toContain("A+");
    expect((await sara.page("/patient")).html).toContain('data-testid="patient-tabs"');
    const qr = await sara.json("POST", "/api/patient/qr", {});
    expect(qr.status).toBe(200);
    expect(qr.data.payload).toMatch(/^http:\/\/[^/]+\/c\/[A-Za-z0-9_-]{20,}$/);
    expect(qr.data.shortCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(qr.data.payload).not.toContain(SARA.id);
    (globalThis as any).__qr = qr.data.payload;
  });

  it("the patient picks chronic diseases and allergies from the lists (+ other) and the doctor sees them", async () => {
    const r = await sara.json("PUT", "/api/patient/health", { conditions: ["داء السكري", "ارتفاع ضغط الدم"], allergies: ["البيض", "البنسلين"] });
    expect(r.status).toBe(200);
    const page = await sara.page("/patient");
    expect(page.html).toContain("ارتفاع ضغط الدم");
    expect(page.html).toContain("البيض");
    expect(page.html).not.toContain("أمراض القلب والشرايين</span>");
  });

  it("a phone camera opening the QR link sees the card, latest activity, assistant and imaging history (without using up the code)", async () => {
    const link = new URL((globalThis as any).__qr);
    const token = link.pathname.split("/").pop()!;
    const phone = new Client("phone");
    const pg = await phone.page(link.pathname);
    expect(pg.status).toBe(200);
    expect(pg.html).toMatch(/سارة/);
    expect(pg.html).toContain("A+");
    expect(pg.html).toContain('data-testid="latest"');
    expect(pg.html).toContain('data-testid="assistant"');
    expect(pg.html).toContain(`/c/${token}/study/${tareeStudyId}`);
    const study = await phone.page(`/c/${token}/study/${tareeStudyId}`);
    expect(study.status).toBe(200);
    expect(study.html).toContain(REPORT);
    expect((await phone.req("GET", `/api/files/${fileId}?qr=${token}`)).status).toBe(200);
    const ai = await phone.json("POST", "/api/card/assistant", { token, mode: "ask", q: "رنين" });
    expect(ai.status).toBe(200);
    expect(ai.data.matches.length).toBeGreaterThan(0);
    // an invalid / expired code shows nothing
    expect((await phone.req("GET", `/api/files/${fileId}?qr=notarealtoken_notarealtoken`)).status).toBe(401);
    expect((await phone.json("POST", "/api/card/assistant", { token: "notarealtoken_notarealtoken", mode: "summary" })).status).toBe(401);
    expect((await new Client("phone").page("/c/notarealtoken_notarealtoken")).html).toMatch(/انتهت صلاحية الرمز/);
  });

  it("the doctor can type the 6-character card code instead of scanning", async () => {
    const qr = await khalid.json("POST", "/api/patient/qr", {});
    const r = await fahad.json("POST", "/api/er/scan", { payload: qr.data.shortCode.toLowerCase() });
    expect(r.status).toBe(200);
    expect((await fahad.page(r.data.redirect)).html).toMatch(/خالد/);
    expect((await fahad.json("POST", "/api/er/scan", { payload: qr.data.shortCode })).status).toBe(400); // single use
    expect((await fahad.json("POST", "/api/er/scan", { payload: "ZZZZZZ" })).status).toBe(400);
  });

  it("the patient sees and edits the emergency contact on the web card", async () => {
    expect((await sara.page("/patient")).html).toContain("أحمد القحطاني");
    const bad = await sara.json("PUT", "/api/patient/contact", { name: "نورة", phone: "123" });
    expect(bad.status).toBe(400);
    const ok = await sara.json("PUT", "/api/patient/contact", { name: "نورة القحطاني", phone: "0555555555", relation: "الأخت" });
    expect(ok.status).toBe(200);
    const html = (await sara.page("/patient")).html;
    expect(html).toContain("نورة القحطاني");
    expect(html).toContain("0555555555");
  });

  it("6-7. Hospital B (authenticated, verified doctor) scans the QR and goes straight to the record", async () => {
    const r = await fahad.json("POST", "/api/er/scan", { payload: (globalThis as any).__qr });
    expect(r.status).toBe(200);
    grantId = r.data.grantId;
    expect(r.data.redirect).toBe(`/er/record/${grantId}`);
    // single use
    const again = await fahad.json("POST", "/api/er/scan", { payload: (globalThis as any).__qr });
    expect(again.status).toBe(400);
  });

  it("8. the newly uploaded study appears with patient summary, hospital and report", async () => {
    const rec = await fahad.page(`/er/record/${grantId}`);
    expect(rec.status).toBe(200);
    expect(rec.html).toMatch(/سارة/);
    expect(rec.html).toContain("البنسلين");
    expect(rec.html).toContain("ارتفاع ضغط الدم");
    expect(rec.html).toMatch(/مستشفى الأمل التخصصي/);
    expect(rec.html).toContain(`/er/record/${grantId}/study/${tareeStudyId}`);
    const view = await fahad.page(`/er/record/${grantId}/study/${tareeStudyId}`);
    expect(view.status).toBe(200);
    expect(view.html).toContain(REPORT.slice(0, 30));
  });

  it("9. the doctor opens the ORIGINAL file — byte-identical to what Hospital A uploaded", async () => {
    const r = await fahad.req("GET", `/api/files/${fileId}?grant=${grantId}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("video/mp4");
    expect(sha(new Uint8Array(await r.arrayBuffer()))).toBe(sha(asset("demo-mri-cine.mp4")));
  });

  it("the radiologist can correct the uploaded report; patient and doctor see the new text — nobody else can edit it", async () => {
    const fixed = `MRI brain (corrected): small old lacunar infarct, no acute findings. ${Date.now()}`;
    const r = await rad.json("PUT", `/api/radiology/studies/${studyId}/report`, { reportText: fixed });
    expect(r.status).toBe(200);
    expect(r.data.amendedAt).toBeTruthy();
    const st = await prisma.imagingStudy.findUniqueOrThrow({ where: { id: tareeStudyId }, include: { report: true } });
    expect(st.report?.text).toBe(fixed);
    expect((await prisma.sourceStudy.findUniqueOrThrow({ where: { id: studyId } })).reportText).toBe(fixed);
    const view = await fahad.page(`/er/record/${grantId}/study/${tareeStudyId}`);
    expect(view.html).toContain(fixed.slice(0, 30));
    expect(view.html).toContain("report-amended");
    expect((await sara.page(`/patient/study/${tareeStudyId}`)).html).toContain(fixed.slice(0, 30));
    // another hospital's radiologist, a too-short report, and anonymous users are refused
    expect((await fahad.json("PUT", `/api/radiology/studies/${studyId}/report`, { reportText: "Overwritten by someone else" })).status).toBe(404);
    expect((await rad.json("PUT", `/api/radiology/studies/${studyId}/report`, { reportText: "short" })).status).toBe(400);
    expect((await new Client("anon").json("PUT", `/api/radiology/studies/${studyId}/report`, { reportText: "Anonymous edit attempt" })).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: "RIS_REPORT_AMENDED", resourceId: studyId } })).toBe(1);
  });

  it("10. after a refresh the record still exists", async () => {
    expect((await fahad.page(`/er/record/${grantId}`)).html).toContain(tareeStudyId);
    expect((await sara.page("/patient?tab=imaging")).html).toContain(tareeStudyId);
  });

  it("new uploads are added, never overwriting earlier studies", async () => {
    const r = await saveAndConfirm(rad, SARA.id, "XRAY", "demo-mri-brain.dcm", "Second study for the same patient — chest.");
    expect((await waitForSync(rad, r.data.studyId)).status).toBe("SYNCED");
    const n = await prisma.imagingStudy.count({ where: { patient: { fullNameEn: { startsWith: "Sara" } } } });
    expect(n).toBe(2);
    expect(await prisma.imagingFile.count({ where: { id: fileId } })).toBe(1);
  });

  it("11. a different patient's QR does not reveal this patient's scans", async () => {
    const kqr = await khalid.json("POST", "/api/patient/qr", {});
    const scan = await fahad.json("POST", "/api/er/scan", { payload: kqr.data.payload });
    expect(scan.status).toBe(200);
    const rec = await fahad.page(`/er/record/${scan.data.grantId}`);
    expect(rec.html).toMatch(/خالد/);
    expect(rec.html).not.toContain(tareeStudyId);
    expect((await fahad.req("GET", `/api/files/${fileId}?grant=${scan.data.grantId}`)).status).toBe(403);
    expect((await khalid.req("GET", `/api/files/${fileId}`)).status).toBe(404);
  });

  it("12. unauthorized users cannot retrieve the medical files", async () => {
    expect((await new Client("anon").req("GET", `/api/files/${fileId}?grant=${grantId}`)).status).toBe(401);
    expect((await new Client("anon").req("GET", `/api/files/${fileId}`)).status).toBe(401);
    expect((await reem.req("GET", `/api/files/${fileId}?grant=${grantId}`)).status).toBe(403); // another doctor's grant
    expect((await majed.req("GET", `/api/files/${fileId}?grant=${grantId}`)).status).toBe(403); // unverified doctor
    expect((await rad.req("GET", `/api/files/${fileId}?grant=${grantId}`)).status).toBe(403); // another professional's grant
    const sqr = await sara.json("POST", "/api/patient/qr", {});
    expect((await majed.json("POST", "/api/er/scan", { payload: sqr.data.payload })).status).toBe(403);
    expect((await new Client("anon").page(`/er/record/${grantId}`)).status).toBe(307);
  });

  it("unknown or ambiguous identities are refused (never linked to the wrong patient)", async () => {
    const unknown = await saveAndConfirm(rad, "1999999999", "CT", "demo-mri-brain.png", "Unknown patient test report.");
    expect(unknown.status).toBe(404);
    const amb = await saveAndConfirm(rad, FAISAL, "CT", "demo-mri-brain.png", "Faisal: DOB at Hospital A is wrong.");
    const job = await waitForSync(rad, amb.data.studyId);
    expect(job.status).toBe("QUARANTINED");
    expect((await prisma.imagingStudy.findUniqueOrThrow({ where: { referenceNumber: job.tareeReference } })).patientId).toBeNull();
  });

  it("'Simulate QR scan' uses the card the patient has open right now", async () => {
    await sara.json("POST", "/api/patient/qr", {});
    const r = await fahad.json("POST", "/api/er/simulate-scan", {});
    expect(r.status).toBe(200);
    expect((await fahad.page(r.data.redirect)).html).toContain(tareeStudyId);
    const none = await fahad.json("POST", "/api/er/simulate-scan", {});
    expect(none.status).toBe(404); // no open card left
  });

  it("every access is in the tamper-evident audit log", async () => {
    const a = await prisma.auditLog.findMany({ select: { action: true, outcome: true } });
    for (const x of ["RIS_STUDY_APPROVED", "SYNC_COMPLETED", "INTEGRATION_STUDY_LINKED", "QR_RESOLVE", "QR_ACCESS_GRANTED", "RECORD_VIEW", "IMAGING_FILE_VIEW"]) {
      expect(a.some((r) => r.action === x && r.outcome === "SUCCESS"), x).toBe(true);
    }
    expect(a.some((r) => r.action === "IMAGING_FILE_VIEW" && r.outcome === "DENIED")).toBe(true);
    expect((await verifyAuditChain()).ok).toBe(true);
  });
});

describe("Both hospitals upload and view · several images · medications · assistant", () => {
  let multiRef: string;
  it("Hospital B can upload too — several images in ONE «حفظ وتأكيد» (patient auto-registered at B)", async () => {
    const files = ["demo-chest-xray.dcm", "demo-chest-xray.jpg", "demo-mri-brain.png"];
    const r = await saveAndConfirm(fahad, SARA.id, "XRAY", files, "Chest X-ray, 3 images: no acute findings.");
    expect(r.status).toBe(200);
    const job = await waitForSync(fahad, r.data.studyId);
    expect(job.status).toBe("SYNCED");
    multiRef = job.tareeReference;
    const st = await prisma.imagingStudy.findUniqueOrThrow({ where: { referenceNumber: multiRef }, include: { files: true, sourceHospital: true, patient: true } });
    expect(st.sourceHospital.code).toBe("HOSP-B");
    expect(st.patient?.fullNameEn).toMatch(/^Sara/);
    expect(st.files).toHaveLength(3);
    expect(new Set(st.files.map((f) => f.sha256))).toEqual(new Set(files.map((f) => sha(asset(f)))));
  });

  it("Hospital A (radiologist) can scan the card and see Hospital B's images — strip viewer with all images", async () => {
    const qr = await sara.json("POST", "/api/patient/qr", {});
    const scan = await rad.json("POST", "/api/er/scan", { payload: qr.data.payload });
    expect(scan.status).toBe(200);
    const st = await prisma.imagingStudy.findUniqueOrThrow({ where: { referenceNumber: multiRef }, include: { files: true } });
    const page = await rad.page(`/er/record/${scan.data.grantId}/study/${st.id}`);
    expect(page.status).toBe(200);
    expect(page.html).toContain('data-count="3"');
    for (const f of st.files) expect((await rad.req("GET", `/api/files/${f.id}?grant=${scan.data.grantId}`)).status).toBe(200);
    const mine = await sara.page(`/patient/study/${st.id}`);
    expect(mine.status).toBe(200);
    expect(mine.html).toContain('data-count="3"');
  });

  it("the patient answers «هل تأخذ أدوية؟» with a name or only a category, and the doctor sees it", async () => {
    const bad = await sara.json("PUT", "/api/patient/medications", { takes: true, items: [{ name: "", category: "" }] });
    expect(bad.status).toBe(400);
    const r = await sara.json("PUT", "/api/patient/medications", { takes: true, items: [{ name: "أملوديبين", category: "أدوية الضغط", frequency: "مرتين في اليوم · صباحاً، مساءً" }, { category: "أدوية السكري" }] });
    expect(r.status).toBe(200);
    expect((await sara.page("/patient")).html).toContain("أملوديبين");
    const qr = await sara.json("POST", "/api/patient/qr", {});
    const scan = await fahad.json("POST", "/api/er/scan", { payload: qr.data.payload });
    const rec = await fahad.page(`/er/record/${scan.data.grantId}`);
    expect(rec.html).toContain("أملوديبين");
    expect(rec.html).toContain("أدوية السكري");
    expect(rec.html).toContain("مرتين في اليوم · صباحاً، مساءً"); // optional dosing info
    expect((await khalid.json("PUT", "/api/patient/medications", { takes: false, items: [] })).status).toBe(200);
    expect((await khalid.page("/patient")).html).toContain("لا يأخذ أدوية");
  });

  it("the card shows the latest activity, and the assistant summarizes and searches the patient's own files", async () => {
    const page = await sara.page("/patient?tab=latest");
    expect(page.html).toContain('data-testid="latest"');
    const sum = await sara.json("POST", "/api/patient/assistant", { mode: "summary" });
    expect(sum.status).toBe(200);
    expect(sum.data.answer).toMatch(/A\+/);
    const q = await sara.json("POST", "/api/patient/assistant", { mode: "ask", q: "آخر أشعة رنين" });
    expect(q.status).toBe(200);
    expect(q.data.matches[0].title).toMatch(/رنين/);
    const k = await khalid.json("POST", "/api/patient/assistant", { mode: "ask", q: "رنين" });
    expect(k.data.matches).toHaveLength(0); // never another patient's data
  });
});

describe("Medication photo", () => {
  it("the patient can add a medicine by photo (camera / gallery); patient and doctor see it, nobody else", async () => {
    const fd = new FormData();
    fd.append("data", JSON.stringify({ takes: true, items: [{ name: "أملوديبين", category: "أدوية الضغط" }, { photo: "new" }] }));
    fd.append("photo_1", new Blob([new Uint8Array(asset("demo-chest-xray.jpg"))], { type: "image/jpeg" }), "box.jpg");
    const r = await sara.req("PUT", "/api/patient/medications", undefined, fd);
    expect(r.status).toBe(200);
    const meds = await prisma.medication.findMany({ where: { patient: { fullNameEn: { startsWith: "Sara" } } } });
    const withPhoto = meds.find((m) => m.photoKey)!;
    expect(withPhoto).toBeTruthy();
    expect((await sara.page("/patient")).html).toContain(`/api/medications/${withPhoto.id}/photo`);
    const mine = await sara.req("GET", `/api/medications/${withPhoto.id}/photo`);
    expect(mine.status).toBe(200);
    expect(sha(Buffer.from(await mine.arrayBuffer()))).toBe(sha(asset("demo-chest-xray.jpg")));
    expect((await new Client("anon").req("GET", `/api/medications/${withPhoto.id}/photo`)).status).toBe(401);
    expect((await khalid.req("GET", `/api/medications/${withPhoto.id}/photo`)).status).toBe(404);
    const qr = await sara.json("POST", "/api/patient/qr", {});
    const scan = await fahad.json("POST", "/api/er/scan", { payload: qr.data.payload });
    expect((await fahad.page(`/er/record/${scan.data.grantId}`)).html).toContain(`/api/medications/${withPhoto.id}/photo?grant=`);
    expect((await fahad.req("GET", `/api/medications/${withPhoto.id}/photo?grant=${scan.data.grantId}`)).status).toBe(200);
    // re-saving keeps the existing photo
    const fd2 = new FormData();
    fd2.append("data", JSON.stringify({ takes: true, items: [{ photo: `keep:${withPhoto.id}` }] }));
    expect((await sara.req("PUT", "/api/patient/medications", undefined, fd2)).status).toBe(200);
    const after = await prisma.medication.findMany({ where: { patientId: withPhoto.patientId } });
    expect(after).toHaveLength(1);
    expect(after[0].photoKey).toBe(withPhoto.photoKey);
    // a non-image is refused
    const bad = new FormData();
    bad.append("data", JSON.stringify({ takes: true, items: [{ photo: "new" }] }));
    bad.append("photo_0", new Blob([new Uint8Array(asset("demo-mri-report.pdf"))]), "x.pdf");
    expect((await sara.req("PUT", "/api/patient/medications", undefined, bad)).status).toBe(400);
  });
});

describe("Doctor view extras", () => {
  it("the doctor's record shows the latest activity and an assistant limited to the granted patient", async () => {
    const qr = await sara.json("POST", "/api/patient/qr", {});
    const scan = await fahad.json("POST", "/api/er/scan", { payload: qr.data.payload });
    const rec = await fahad.page(`/er/record/${scan.data.grantId}`);
    expect(rec.html).toContain('data-testid="latest"');
    expect(rec.html).toContain('data-testid="assistant"');
    const r = await fahad.json("POST", "/api/er/assistant", { grantId: scan.data.grantId, mode: "summary" });
    expect(r.status).toBe(200);
    expect(r.data.answer).toMatch(/A\+/);
    expect((await reem.json("POST", "/api/er/assistant", { grantId: scan.data.grantId, mode: "summary" })).status).toBe(403);
  });

  it("after scanning, the record has 3 tabs and imaging can be added from the card without typing the ID", async () => {
    const qr = await khalid.json("POST", "/api/patient/qr", {});
    const scan = await fahad.json("POST", "/api/er/scan", { payload: qr.data.payload });
    const rec = await fahad.page(`/er/record/${scan.data.grantId}`);
    expect(rec.html).toContain('data-testid="record-tabs"');
    const up = await fahad.page(`/er/record/${scan.data.grantId}?tab=upload`);
    expect(up.html).toContain('data-testid="card-patient"');
    expect(up.html).not.toContain('data-testid="nid"');
    const fd = new FormData();
    fd.append("grantId", scan.data.grantId);
    fd.append("modality", "CT");
    fd.append("report", "CT chest added from the scanned card.");
    fd.append("file", new Blob([new Uint8Array(asset("demo-mri-brain.png"))]), "demo-mri-brain.png");
    fd.append("file", new Blob([new Uint8Array(asset("demo-chest-xray.jpg"))]), "demo-chest-xray.jpg");
    const res = await fahad.req("POST", "/api/radiology/submit", undefined, fd);
    const data = (await res.json()) as any;
    expect(res.status).toBe(200);
    const job = await waitForSync(fahad, data.studyId);
    expect(job.status).toBe("SYNCED");
    const st = await prisma.imagingStudy.findUniqueOrThrow({ where: { referenceNumber: job.tareeReference }, include: { patient: true, files: true } });
    expect(st.patient?.fullNameEn).toMatch(/^Khalid/);
    expect(st.files).toHaveLength(2);
    expect((await fahad.page(`/er/record/${scan.data.grantId}?tab=imaging`)).html).toContain(st.id);
    // another doctor's grant cannot be used to add imaging
    const fd2 = new FormData();
    fd2.append("grantId", scan.data.grantId); fd2.append("modality", "CT"); fd2.append("report", "Should be refused here.");
    fd2.append("file", new Blob([new Uint8Array(asset("demo-mri-brain.png"))]), "x.png");
    expect((await reem.req("POST", "/api/radiology/submit", undefined, fd2)).status).toBe(403);
  });
});

describe("Wallet card (Apple / Google)", () => {
  it("the permanent wallet QR asks a doctor to sign in, then opens the patient file", async () => {
    const st = await sara.json("GET", "/api/patient/wallet");
    expect(st.status).toBe(200);
    const patient = await prisma.patient.findFirstOrThrow({ where: { fullNameEn: { contains: "Sara" } } });
    const token = walletToken(patient.id);
    if (st.data.apple) {
      const res = await sara.req("GET", "/api/patient/wallet/apple");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/vnd.apple.pkpass");
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.subarray(0, 2).toString()).toBe("PK");
      for (const f of ["pass.json", "manifest.json", "signature", "icon.png"]) expect(buf.includes(Buffer.from(f))).toBe(true);
      expect(buf.includes(Buffer.from(`/w/${token}`))).toBe(true);
    } else {
      expect((await sara.req("GET", "/api/patient/wallet/apple")).status).toBe(503);
    }
    if (st.data.google) {
      const g = await sara.json("POST", "/api/patient/wallet/google", {});
      expect(g.status).toBe(200);
      const jwt = String(g.data.url).split("/save/")[1];
      const body = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
      expect(body.payload.genericObjects[0].barcode.value).toContain(`/w/${token}`);
    } else {
      expect((await sara.json("POST", "/api/patient/wallet/google", {})).status).toBe(503);
      await prisma.patient.update({ where: { id: patient.id }, data: { walletTokenHash: sha(Buffer.from(token)) } });
    }
    // anyone without a doctor sign-in sees only the sign-in prompt — no patient data
    const anon = new Client("anon");
    const landing = await anon.page(`/w/${token}`);
    expect(landing.html).toContain(`/hospital/login?next=/w/${token}`);
    expect(landing.html).not.toContain(patient.fullNameAr);
    expect((await anon.page(`/w/${"x".repeat(32)}`)).html).not.toContain("hospital/login?next");
    // the patient can't use it; a signed-in doctor gets the record (scan any number of times)
    expect((await sara.json("POST", "/api/er/scan", { payload: `${BASE}/w/${token}` })).status).not.toBe(200);
    for (let i = 0; i < 2; i++) {
      const r = await fahad.json("POST", "/api/er/scan", { payload: `${BASE}/w/${token}` });
      expect(r.status).toBe(200);
      expect(r.data.redirect).toMatch(/^\/er\/record\//);
      expect((await fahad.page(r.data.redirect)).html).toContain(patient.fullNameAr);
    }
    expect((await fahad.json("POST", "/api/er/scan", { payload: `${BASE}/w/${"y".repeat(32)}` })).status).toBe(400);
  });
});

describe("Integration API security", () => {
  it("rejects unsigned and forged hospital requests", async () => {
    const body = "{}";
    expect((await fetch(`${BASE}${INTEGRATION_PATH}`, { method: "POST", body })).status).toBe(401);
    const forged = await fetch(`${BASE}${INTEGRATION_PATH}`, {
      method: "POST",
      body,
      headers: { "x-taree-hospital": "HOSP-A", "x-taree-timestamp": String(Date.now()), "x-taree-event-id": "evt_forged_1234", "x-taree-signature": "0".repeat(64) },
    });
    expect(forged.status).toBe(401);
  });
  it("duplicate deliveries do not create duplicate records", async () => {
    const job = await prisma.syncJob.findFirstOrThrow({ where: { status: "SYNCED" }, include: { hospital: true } });
    const before = await prisma.imagingStudy.count();
    const payload = JSON.stringify(await buildPayload(job));
    const r = await fetch(`${BASE}${INTEGRATION_PATH}`, { method: "POST", body: payload, headers: signedHeaders(job.hospital.code, decryptSecret(job.hospital.apiSecretEnc), "POST", INTEGRATION_PATH, payload, job.eventId) });
    expect(r.status).toBe(200);
    expect(await prisma.imagingStudy.count()).toBe(before);
  });
});
