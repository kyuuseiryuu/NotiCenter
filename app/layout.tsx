import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: "NotiCenter — 让重要消息准时抵达",
  description: "面向 Bark、NTFY 与 Webhook 的主题订阅和统一消息分发中心。",
  openGraph: {
    title: "NotiCenter — 让重要消息准时抵达",
    description: "面向 Bark、NTFY 与 Webhook 的主题订阅和统一消息分发中心。",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "NotiCenter — 让重要消息准时抵达",
    description: "面向 Bark、NTFY 与 Webhook 的主题订阅和统一消息分发中心。",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
