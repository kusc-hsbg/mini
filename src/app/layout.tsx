import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AFFINITY — 실시간 메타버스",
  description: "아바타로 만나 닿고, 달리고, 겨루는 세련된 실시간 가상 세계. 레이싱·PK·상점·소셜.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
