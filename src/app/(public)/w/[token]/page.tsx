import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { patientByWalletToken } from "@/lib/wallet";
import { publicBaseUrl } from "@/lib/public-url";
import { LogoMark } from "@/components/Logo";
import { DoctorOpen } from "../../c/[token]/doctor-open";
import { LogIn, ShieldX, Stethoscope } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aoun card" };

/**
 * Opened by scanning the QR on the patient's Apple / Google Wallet card.
 * Nothing about the patient is shown here: the doctor signs in, then the patient's file opens.
 */
export default async function WalletScan({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { t } = await getT();
  const p = await patientByWalletToken(token);
  if (!p) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="card card-pad w-full max-w-md text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emergency-50 text-emergency"><ShieldX className="h-7 w-7" /></div>
          <h1 className="mt-4 text-xl font-bold">{t("البطاقة غير صالحة", "This card is not valid")}</h1>
          <p className="mt-2 text-sm text-navy-400">{t("اطلب من المريض إضافة بطاقته إلى المحفظة من جديد.", "Ask the patient to add their card to the wallet again.")}</p>
        </div>
      </div>
    );
  }
  const er = await getSession("ER");
  if (er) return <DoctorOpen token={token} payload={`${publicBaseUrl()}/w/${token}`} />;
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="card card-pad w-full max-w-md text-center" data-testid="wallet-landing">
        <div className="mx-auto w-fit"><LogoMark size={56} /></div>
        <h1 className="mt-4 text-xl font-bold">{t("بطاقة عون الطبية", "Aoun medical card")}</h1>
        <p className="mt-2 text-sm text-navy-400">{t("هذا الرمز للطبيب. سجّل دخولك ليفتح ملف المريض مباشرة.", "This code is for the doctor. Sign in and the patient's file opens directly.")}</p>
        <Link href={`/hospital/login?next=/w/${token}`} className="btn-primary btn-lg mt-6 w-full" data-testid="wallet-doctor-login">
          <LogIn className="h-5 w-5" />{t("دخول الطبيب", "Doctor sign in")}
        </Link>
        <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-navy-400"><Stethoscope className="h-3.5 w-3.5" />{t("لا تظهر أي معلومات عن المريض قبل دخول الطبيب.", "No patient information is shown before a doctor signs in.")}</div>
      </div>
    </div>
  );
}
