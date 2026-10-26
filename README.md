# عون · Aoun

**Medical imaging that follows the patient, wherever they are treated.**

Aoun is a web platform that lets hospitals share medical imaging securely. When a patient arrives at a different hospital, the doctor scans the patient's card and immediately sees the imaging, reports and key medical information from other hospitals. There is no need to repeat a scan or wait for files.

> All patients, hospitals, doctors and images in this project are fictional and for demonstration only.

---

## The problem

A patient's imaging (X-ray, CT, MRI) stays inside the hospital that produced it. When the patient is treated elsewhere, especially in an emergency, the doctor often has no access to previous scans. This leads to repeated imaging, extra radiation exposure, higher costs and slower decisions.

## The solution

| Step | Who | What happens |
|---|---|---|
| 1 | Any hospital | Uploads one or more images with a report and presses **«حفظ وتأكيد»** (Save & Confirm) |
| 2 | Aoun | Verifies the file, encrypts it and links it to the correct patient automatically |
| 3 | Patient | Opens their digital medical card with a QR code, on the website or in Apple / Google Wallet |
| 4 | Any other hospital | The doctor scans the QR code, signs in, and opens the same imaging and report instantly |

## Features

**For patients**
- Digital medical card: blood type, chronic conditions, allergies, medications and emergency contact
- QR code that changes every 5 minutes, plus a 6-character code for manual entry
- Card that can be saved to **Apple Wallet** and **Google Wallet**
- Medications entered by name, by category, or by photo of the box, with optional dosing times
- Full imaging history and a "Latest" view
- AI assistant that summarizes recent activity and searches the patient's own files

**For hospitals**
- Both hospitals can upload and view imaging
- Several images in a single upload, with a thumbnail strip viewer
- Supports DICOM, images, video (MRI cine) and PDF reports
- After scanning a card, the doctor works in one place with three tabs: card, add imaging, view imaging
- Every access is recorded and visible to the patient

## Live demo

**🌐 https://aoun-eight.vercel.app** — open it on any phone or computer.

| Role | Sign-in |
|---|---|
| Patient | National ID `1098765432` · Mobile `0500000001` · Code `123456` |
| Doctor, Al Amal Hospital | `huda@alamal.med` · Password `Aoun@2026` |
| Doctor, Al Shifa Hospital | `fahad@alshifa.med` · Password `Aoun@2026` |

**Suggested walkthrough**
1. Sign in as the patient on a phone and open the medical card (QR).
2. On another device, sign in as a doctor and choose «فتح ملف المريض عن طريق مسح البطاقة».
3. Scan the QR code: the patient's file opens with the imaging and report.
4. From the **Add imaging** tab, upload a new image. It appears instantly in the patient's history.

## Security and privacy

- **Encryption at rest:** all medical files and hospital secrets use AES-256-GCM. Files are only streamed after an authorization check.
- **No raw national IDs:** identifiers are stored as keyed hashes (HMAC) and shown masked.
- **Safe QR codes:** they hold only a random token, no medical data or ID. On-screen codes expire after 5 minutes and work once.
- **Access control:** verified doctor + active hospital affiliation + time-limited grant, checked on every request.
- **Trusted hospital integration:** HMAC-signed requests with replay protection and duplicate detection.
- **Audit log:** every access is recorded in a tamper-evident (hash-chained) log.
- **Sessions and input:** secure HttpOnly sessions, rate limiting, input validation and strict security headers.

## Technology

| Layer | Stack |
|---|---|
| Web app | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS (Arabic RTL + English) |
| Data | PostgreSQL with Prisma ORM |
| Imaging | Built-in viewer for DICOM, images, video and PDF |
| Hosting | Vercel + Neon (serverless Postgres) |
| Quality | 29 end-to-end acceptance tests (Vitest) against the real HTTP API |

## Architecture

```
 Hospital (upload)                     Aoun platform                              Hospital (view)
 ─────────────────                     ─────────────                              ───────────────
 «حفظ وتأكيد»  ──► sync job ──► signed integration API ──► verify + encrypt + link to patient
                                                                   │
                                          Patient card (QR / Wallet) ◄─┘
                                                                   │
                         Doctor scans QR ──► signs in ──► time-limited access ──► imaging + report
```

| Area | Location |
|---|---|
| Data model | `prisma/schema.prisma`, `prisma/migrations/` |
| Hospital integration and sync | `src/lib/sync/`, `src/lib/integration/`, `src/lib/hospital-system/` |
| QR codes and Wallet card | `src/lib/qr.ts`, `src/lib/wallet.ts` |
| Access control and audit | `src/lib/access.ts`, `src/lib/access-flow.ts`, `src/lib/audit.ts` |
| Encrypted storage | `src/lib/storage.ts` |
| Patient / hospital portals | `src/app/patient`, `src/app/radiology`, `src/app/er` |
| Acceptance tests | `tests/acceptance.test.ts` |

## Run it

**Online (Vercel)**
1. Import this repository in Vercel. Next.js is detected automatically.
2. In the project, open **Storage** and add a **Neon** Postgres database.
3. Deploy. The build applies the database migrations, generates the encryption keys and loads the demo data automatically. No manual configuration is needed.

**Locally (developers)**
```bash
npm install
npm run setup:env            # creates .env with random encryption keys
npx prisma migrate deploy    # creates the database tables
npm run db:seed              # loads the demo data
npm run build && npm start   # http://localhost:3000
npm test                     # end-to-end acceptance tests (server must be running)
```
On macOS, double-clicking **Aoun.app** starts everything with a private built-in database.

## Roadmap

- National identity sign-in (Nafath) and SMS verification
- Direct integration with hospital PACS/RIS through DICOMweb and HL7 FHIR
- Diagnostic-grade viewer (OHIF) for full DICOM support
- Cloud object storage with managed encryption keys (KMS)
- Compliance review against the PDPL, NCA healthcare controls and MOH requirements

---

Aoun is a hackathon MVP and is not a certified medical device.
