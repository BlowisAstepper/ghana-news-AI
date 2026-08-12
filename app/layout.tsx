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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Ghana News Hub",
  description: "Stay updated with the latest news from Ghana's leading source MyJoyOnline",
  openGraph: {
    title: "Ghana News Hub",
    description: "Stay updated with the latest news from Ghana's leading source MyJoyOnline",
    url: siteUrl,
    siteName: "Ghana News Hub",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ghana News Hub",
    description: "Stay updated with the latest news from Ghana's leading source MyJoyOnline",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
