import { SidebarProvider } from "@/context/SidebarContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "flatpickr/dist/flatpickr.css";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Semoet Admin",
    template: "%s · Semoet Admin",
  },
  description:
    "Panel admin Semoet Cafe — pantau penjualan, produk terlaris, dan operasional cabang.",
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  themeColor: "#6f4e37",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`${outfit.className} antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>
          <SidebarProvider>{children}</SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
