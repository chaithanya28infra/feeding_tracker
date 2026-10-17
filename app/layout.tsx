import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Nest Little Baby · A little care, beautifully kept",
  description:
    "A calm place for feeding, diaper changes, and all the little moments.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/favicon.ico?v=4", sizes: "16x16 32x32 48x48" },
      { url: "/brand/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nest Little Baby",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f5ef",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {/* Extensions such as Grammarly add body attributes before hydration.
          Keep this escape hatch on body only; app-level mismatches still warn. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
