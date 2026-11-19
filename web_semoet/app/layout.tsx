import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Semoet Cafe — Pesan kopi & reservasi",
    template: "%s · Semoet Cafe",
  },
  description:
    "Pesan kopi, makanan, dan paket favoritmu di Semoet Cafe. Kumpulkan poin, pakai voucher, dan reservasi meja atau event langsung dari web.",
  applicationName: "Semoet Cafe",
  appleWebApp: {
    capable: true,
    title: "Semoet Cafe",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#6f4e37",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
