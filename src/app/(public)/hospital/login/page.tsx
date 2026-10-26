import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { HospitalLogin } from "./form";

export const metadata = { title: "Hospital login" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && /^\/[A-Za-z0-9/_-]*$/.test(sp.next) && !sp.next.startsWith("//") ? sp.next : undefined;
  const { t } = await getT();
  const hs = await prisma.hospital.findMany({ where: { code: { in: ["HOSP-A", "HOSP-B"] } }, select: { code: true, nameAr: true, nameEn: true } });
  const a = hs.find((h) => h.code === "HOSP-A");
  const b = hs.find((h) => h.code === "HOSP-B");
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="card card-pad w-full max-w-md">
        <h1 className="text-2xl font-bold">{t("دخول المستشفى", "Hospital login")}</h1>
        <p className="mt-1 text-sm text-navy-400">{t("للممارسين الصحيين المعتمدين.", "For authorized healthcare professionals.")}</p>
        <HospitalLogin next={next} a={a ?? { nameAr: "المستشفى (أ)", nameEn: "Hospital A" }} b={b ?? { nameAr: "المستشفى (ب)", nameEn: "Hospital B" }} />
      </div>
    </div>
  );
}
