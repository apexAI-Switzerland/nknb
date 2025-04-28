import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "../components/ui/toaster";
import { Navigation } from "@/components/navigation";
import { AuthProvider } from "@/components/AuthProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Naturkostbar Nährwertverwaltung",
  description: "Nährwertverwaltung für Naturkostbar",
  icons: {
    icon: "/public/favicon_nk.png"
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <Navigation />
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
