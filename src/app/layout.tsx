import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getLang } from "@/lib/i18n";
import { LangProvider } from "@/components/lang";

export const metadata: Metadata = {
  title: { default: "عون | Aoun", template: "%s | عون Aoun" },
  description: "منصة عون — أشعتك الطبية معك أينما كنت · Aoun unified medical imaging platform",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#087F8C", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
        />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      </head>
      <body className="min-h-screen font-sans">
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
