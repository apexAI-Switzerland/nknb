"use client";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-start min-h-screen w-full px-4 pb-16">
      <div className="w-full max-w-5xl">
        <h1 className="text-4xl sm:text-5xl font-bold mb-8 naturkostbar-accent text-center mt-10 sm:mt-16">
          Naturkostbar
        </h1>

        <p className="text-center text-gray-600 mb-8">Bitte wählen Sie einen Bereich:</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-16">
          <Link href="/ingredients" className="block">
            <div className="h-32 flex items-center justify-center text-xl font-medium naturkostbar-accent-bg rounded-lg shadow-md transition hover:shadow-lg transform hover:scale-[1.02] text-white">
              Nährwerteverwaltung
            </div>
          </Link>
          <Link href="/production" className="block">
            <div className="h-32 flex items-center justify-center text-xl font-medium naturkostbar-accent-bg rounded-lg shadow-md transition hover:shadow-lg transform hover:scale-[1.02] text-white">
              Produktionsplanung
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
