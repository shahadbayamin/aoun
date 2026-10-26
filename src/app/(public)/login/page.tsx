import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./form";

export const metadata = { title: "Patient login" };

export default async function Page() {
  if (await getSession("PATIENT")) redirect("/patient");
  const { t } = await getT();
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="card card-pad w-full max-w-md">
        <h1 className="text-2xl font-bold">{t("دخول المريض", "Patient login")}</h1>
        <p className="mt-1 text-sm text-navy-400">{t("رقم الهوية أو الإقامة، ورقم الجوال، ثم رمز التحقق.", "National ID or Iqama, mobile number, then the verification code.")}</p>
        <LoginForm />
      </div>
    </div>
  );
}
