# عون · Aoun — Unified Medical Imaging & Emergency Information Platform

Arabic-first, responsive **web application** (no native app) that shows the core Aoun workflow working end to end on a real database:

> **Hospital A** radiologist clicks **«اعتماد وحفظ الأشعة» (Approve & Finalize)** → the study is pushed **automatically** to Aoun over a signed integration API → Aoun authenticates the hospital, matches the patient via a verified identity mapping, pulls the file from the hospital PACS, verifies it (SHA-256) and stores it encrypted → it appears in the **patient's unified record** → **Hospital B**'s ER doctor scans the patient's **emergency QR card**, gets authorization (patient consent, or audited break-glass) and opens the **exact same study and report**.

> ⚠️ **Development MVP — fictional data only.** Every patient, hospital, doctor, ID number and image in this repository is invented. It is not a medical device and must not be used for clinical care.

---

## ☁️ Online (Vercel) — open it from any device

The same code runs online with **zero manual secrets**:

1. Import this GitHub repo in **Vercel** (Framework: Next.js — detected automatically).
2. In the Vercel project → **Storage** → add a **Neon (Postgres)** database (free). This sets `DATABASE_URL`.
3. **Deploy** (or Redeploy). The build (`npm run vercel-build` → `scripts/cloud-build.mjs`) applies the migrations, generates the encryption keys once and keeps them in the database, loads the fictional demo data, then builds the site.

Online, files are stored encrypted in the database (`StoredObject`), the sync runs right after «حفظ وتأكيد» (no background worker), and the QR / wallet links use the site's https address so phone cameras work.
Demo logins: doctors `fahad@alshifa.med` / `huda@alamal.med`, password `Aoun@2026`; patient ID `1098765432`, phone `0500000001`, code `123456`.
Limit: one upload request ≤ 4.5 MB on Vercel's free plan.

## 0. Easiest: double-click (no Terminal)

1. Put the whole `aoun` folder somewhere permanent (e.g. Desktop or Documents) — not inside Downloads.
2. Double-click **Aoun** (the teal app inside the folder). The first launch downloads what it needs (Node.js if missing, components, a private built-in database) — a few minutes, needs internet once. Later launches take seconds.
3. Your browser opens **http://localhost:3000/demo** automatically. Double-click **Aoun** again any time to reopen it.
4. Double-click **Stop Aoun** (red) to shut it down. Your demo data is kept between runs.

If macOS says the app “cannot be opened because the developer cannot be verified”: right-click the app → **Open** → **Open** (or System Settings → Privacy & Security → **Open Anyway**). Logs are in `aoun/logs/aoun.log`.

The double-click apps use their own private PostgreSQL (port 54329, data in `.aoun-data/`), so you do not need to install PostgreSQL or Homebrew.

## 1. Manual setup on macOS (developers)

**Prerequisites:** [Homebrew](https://brew.sh), Node.js 20 or 22, PostgreSQL 16.

```bash
# 1) Tools
brew install node@22 postgresql@16
brew services start postgresql@16
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
#   (Intel Macs: /usr/local/opt/postgresql@16/bin)

# 2) Database + role used by .env.example
psql postgres -c "CREATE USER aoun WITH PASSWORD 'aoun' CREATEDB;"
psql postgres -c "CREATE DATABASE aoun OWNER aoun;"

# 3) App
cd aoun
npm install
npm run setup:env          # creates .env with fresh random encryption keys
npx prisma migrate deploy  # creates all tables
npm run db:seed            # loads the fictional demo dataset + sample files

# 4) Start
npm run build && npm start # production mode  →  http://localhost:3000
#   or: npm run dev        # development mode with hot reload
```

Open **http://localhost:3000/demo** for the guided demonstration and one-click demo accounts.

### Run the automated acceptance tests

The tests drive the real HTTP APIs of a running server, exactly as the browser portals do. **They reset the demo database.**

```bash
npm run build && npm start      # terminal 1
npm test                        # terminal 2  → 21 tests
```

### Use your phone as the patient

Phone and Mac must be on the same Wi-Fi. Start the server, find your Mac's IP (`ipconfig getifaddr en0`), set `APP_URL="http://<that-ip>:3000"` in `.env`, restart, and open `http://<that-ip>:3000/login` on the phone. The ER portal's camera scanner needs HTTPS or `localhost`: run it on the Mac itself (`localhost`), or use **Scan from image** / **paste code**.

---

## 2. Pages (exactly the requested workflow)

| Page | URL |
|---|---|
| Home | `/` |
| Patient login (ID/Iqama + mobile + verification code) | `/login` |
| Patient medical card + large QR + imaging history | `/patient` |
| Hospital login (Hospital A / Hospital B) | `/hospital/login` |
| Hospital A — upload page with **حفظ وتأكيد** | `/radiology` |
| Hospital B — QR scanner (camera / simulate / paste) | `/er` |
| Doctor's medical record viewer → open the original file | `/er/record/…` |

## 3. Demo (fictional data)

| Who | Sign-in |
|---|---|
| Patient Sara | ID `1098765432`, mobile `0500000001` (code shown on screen) |
| Patient Khalid | ID `1087654321`, mobile `0500000002` |
| Patient Mohammed (first login creates the account) | ID `2123456789`, mobile `0500000004` |
| Hospital A radiologist | `huda@alamal.med` / `Aoun@2026` |
| Hospital B doctor (authorized) | `fahad@alshifa.med` / `Aoun@2026` |
| Hospital B doctor — unverified (denied) | `majed@alshifa.med` / `Aoun@2026` |

1. **Hospital A** → ID `1098765432` → MRI → upload `demo-mri-cine.mp4` (link on the page) → short report → **حفظ وتأكيد** → wait for: *«تم ربط الأشعة بسجل المريض بنجاح، ويمكن الوصول لها فوراً عبر بطاقة الطوارئ.»* (shown only after the file and record are really saved).
2. **Patient** (phone) → login → medical card with QR.
3. **Hospital B** → scan the QR with the camera (or **محاكاة مسح QR** on one computer) → the record opens automatically.
4. Click the MRI → the exact uploaded video/image opens, with hospital and report.

Faisal (`1076543210`) has a wrong birth date at Hospital A: his upload is held and **never linked to the wrong patient**.

## 4. Architecture

```
 Hospital A (simulated RIS/PACS)                      Aoun central platform                     Hospital B (ER)
 ─────────────────────────────────                    ──────────────────────                     ───────────────
 SourceStudy (DRAFT)  ── Approve & Finalize ──►  SyncJob (outbox, idempotent eventId)
                                                   │ worker: PENDING→SENDING→SYNCED / RETRY / FAILED
                                                   ▼
                       POST /api/integrations/imaging-studies   (HMAC-SHA256 signed, 5-min replay window)
                                                   │ 1 authenticate hospital   2 validate (zod)
                                                   │ 3 idempotency (eventId + Study Instance UID)
                                                   │ 4 verified identity match (ID + DOB + MRN) ─ uncertain → QUARANTINE
  PACS file endpoint ◄── signed, short-lived token ┤ 5 pull files, SHA-256 + magic-byte check, AES-256-GCM at rest
                                                   │ 6 link ImagingStudy → Patient, report, encounter, notify, audit
                                                   ▼
                                     Unified record ──► Patient portal (QR card: opaque 5-min single-use token)
                                                   │
                                     QR resolve → scan context (15 min) → AccessRequest → patient consent → AccessGrant (12 h)
                                                                       └→ break-glass EmergencyAccessEvent → AccessGrant (4 h, limited scope, reviewed)
                                                   ▼
                                     Every read: verified licence + active affiliation + own grant + scope → audit (hash-chained)
```

| Area | Where |
|---|---|
| Data model (Prisma, PostgreSQL) | `prisma/schema.prisma`, migration in `prisma/migrations/` |
| Simulated hospital RIS / PACS | `src/lib/hospital-system/` |
| Outbound sync engine (outbox, retries, backoff, crash recovery) | `src/lib/sync/engine.ts`, worker started in `src/instrumentation.ts` |
| Integration API + ingestion | `src/app/api/integrations/imaging-studies`, `src/lib/integration/` |
| QR tokens | `src/lib/qr.ts` |
| Access control, consent, break-glass | `src/lib/access.ts`, `src/lib/access-flow.ts` |
| Tamper-evident audit log | `src/lib/audit.ts` |
| Encrypted storage adapter | `src/lib/storage.ts` |
| Portals | `src/app/(public)`, `src/app/patient`, `src/app/radiology` (Hospital A), `src/app/er` (Hospital B), `src/app/admin` |
| DICOM / image / video / PDF viewer | `src/components/FileViewer.tsx` |
| Acceptance tests | `tests/acceptance.test.ts` |

### Security controls implemented
Opaque DB-backed sessions in HttpOnly SameSite=Strict cookies (per portal, absolute + 60-min idle expiry) · bcrypt passwords · server-side RBAC on every route and page · professional licence + hospital affiliation checks on every record read · scoped, expiring, revocable grants · patient consent workflow · break-glass with purpose, ≥20-char justification, attestation, minimum scope, rate limit, patient notification and admin review · QR tokens are random, hashed at rest, 5-min, single-use, and contain no identifier or medical data · national IDs never stored raw by Aoun (keyed HMAC + masked form) · AES-256-GCM encryption of all files and hospital secrets · no public file URLs (decrypt-and-stream after authorization, `Cache-Control: no-store`) · content-sniffed uploads with size limits · HMAC-signed hospital requests with replay window and idempotency · SSRF guard on PACS pulls · input validation (zod) · rate limiting · security headers · hash-chained audit log with integrity verification.

## 5. Limitations of this development build (be explicit when presenting)

- **Identity proofing** uses a clearly labelled *development identity provider* and on-screen OTP. Production needs an approved national identity integration (e.g. Nafath) and SMS gateway.
- **Hospital systems are simulated** inside the same app and database (separate tables, talking only through the signed API). Real deployments integrate with each hospital's PACS/RIS via DICOMweb (STOW/WADO-RS) or HL7 FHIR `ImagingStudy`, through an integration gateway with mTLS and OAuth2 client credentials.
- **Viewer:** the built-in DICOM renderer supports uncompressed single/multi-frame images for demonstration and is **not diagnostic**. Production should embed **OHIF** (or another cleared viewer) against DICOMweb.
- **Rate limiting and the sync worker are in-process.** Production: Redis/edge rate limiting, a durable queue (e.g. SQS/BullMQ), and multiple workers. Only trust `X-Forwarded-For` behind your own proxy.
- **Storage** is an encrypted local-disk adapter; swap for S3-compatible object storage with SSE-KMS behind the same `StorageAdapter` interface. Keys live in `.env`; production needs an HSM/KMS.
- Identity matching uses ID + date of birth + MRN conflict checks; production needs the national MPI and a formal matching policy. **Saudi PDPL, NCA healthcare cybersecurity controls and MOH requirements need formal legal and security review before any real use.**

## 6. Useful commands

```bash
npm run db:reset        # wipe + re-seed demo data (also: Admin → Reset demo)
npm run demo:assets     # regenerate synthetic DICOM/MP4/PDF samples (needs python3 with numpy, Pillow, reportlab, plus ffmpeg)
npm run typecheck
```

If `npx prisma migrate deploy` fails for any reason, you can apply the schema directly:
`psql "postgresql://aoun:aoun@localhost:5432/aoun" -f prisma/migrations/20261012000000_init/migration.sql` and then run `npm run db:seed`.

If Prisma cannot download its engines (locked-down networks), prefix Prisma commands with `PRISMA_WASM=1` to use the WebAssembly engine through the pg driver adapter.
