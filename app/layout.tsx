import type { Metadata } from "next";
import PlausibleProvider from "next-plausible";
import "./globals.css";

let title = "InnoDEV Coder by InnovatehubPH";
let description = "InnoDEV Coder by InnovatehubPH";
let url = "https://innodevcoder.com/";
let ogimage = "https://innodevcoder.com/og-image.png";
let sitename = "innodevcoder.com";

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title,
  description,
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    images: [ogimage],
    title,
    description,
    url: url,
    siteName: sitename,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    images: [ogimage],
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <PlausibleProvider domain="innodevcoder.com" />
      </head>

      {children}
    </html>
  );
}
