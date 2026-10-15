import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ToastProvider } from "@/components/ui/toast";
import { ClientErrorListener } from "@/components/providers/client-error-listener";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { RealtimeProvider } from "@/components/providers/realtime-provider";

// Phones, tablets and laptops: scale to device width; respect notches / home indicators
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F6F2" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0F14" },
  ],
};

export const metadata: Metadata = {
  title: "Synapta — AI-Native Adaptive Learning Platform",
  description:
    "Adaptive 1-on-1 tutoring powered by Cognitive Digital Twins, Bayesian Knowledge Tracing, in-situ labs, and grounded AI.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <QueryProvider>
          <AuthProvider>
            <RealtimeProvider>
              <ThemeProvider>
                <ToastProvider>
                  <ClientErrorListener />
                  {children}
                </ToastProvider>
              </ThemeProvider>
            </RealtimeProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
