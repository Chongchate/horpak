import type { Metadata, Viewport } from "next";
import { Bai_Jamjuree, IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";

const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-plex-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
});

const jamjuree = Bai_Jamjuree({
  variable: "--font-jamjuree",
  subsets: ["thai", "latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Horpak",
  description: "ระบบจัดการหอพัก",
};

export const viewport: Viewport = {
  themeColor: "#17233a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Font variables live on <html> so the :root theme tokens that reference them resolve.
    <html lang="th" className={`${plexThai.variable} ${jamjuree.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
