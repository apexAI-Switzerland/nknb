import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "../components/ui/toaster";
import { Navigation } from "@/components/navigation";
import { AuthProvider } from "@/components/AuthProvider";
import { getEnvVars } from "@/lib/env";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Naturkostbar Nährwerteverwaltung",
  description: "Verwaltung von Nährwerten für die Naturkostbar",
  icons: {
    icon: "/public/favicon_nk.png"
  }
};

function Footer() {
  return (
    <footer className="py-6 border-t mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <p className="text-sm text-gray-500">© {new Date().getFullYear()} apexAI</p>
          </div>
          <div className="flex space-x-4">
            <a href="https://apex-ai.ch" target="_blank" rel="noopener noreferrer" className="text-sm text-gray-500 hover:text-naturkostbar-brown">
              Website
            </a>
            <a href="#" className="text-sm text-gray-500 hover:text-naturkostbar-brown">
              Datenschutz
            </a>
            <a href="#" className="text-sm text-gray-500 hover:text-naturkostbar-brown">
              Impressum
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get environment variables
  const env = getEnvVars();
  
  return (
    <html lang="de">
      <head>
        <script
          id="env-script"
          dangerouslySetInnerHTML={{
            __html: `window.ENV = ${JSON.stringify(env)}`,
          }}
        />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body className={`${inter.className} min-h-screen flex flex-col`}>
        <AuthProvider>
          <Navigation />
          <div className="flex-grow">
            {children}
          </div>
          <Footer />
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
