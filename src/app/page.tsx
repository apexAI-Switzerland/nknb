"use client";
import React, { useState, useEffect } from "react";
import { supabase, parseNutritionalValue, ProduktMaster } from "@/lib/supabase";
import Link from "next/link";
import { ChevronRight, Search, Info, ChevronDown, ChevronUp } from "lucide-react";

function ProductList() {
  const [products, setProducts] = useState<ProduktMaster[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [showCount, setShowCount] = useState(10);
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchProducts() {
      setIsLoading(true);
      const { data } = await supabase()
        .from('ProduktMaster')
        .select('*')
        .order('Produktname', { ascending: true });
      setProducts(data || []);
      setIsLoading(false);
    }
    fetchProducts();
  }, []);

  const filteredProducts = products.filter(product =>
    !productSearch || (product.Produktname && product.Produktname.toLowerCase().includes(productSearch.toLowerCase()))
  );
  const visibleProducts = filteredProducts.slice(0, showCount);

  const toggleExpand = (productId: number) => {
    setExpandedProduct(expandedProduct === productId ? null : productId);
  };

  return (
    <div className="mt-8 w-full max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold naturkostbar-accent">Produktliste</h2>
        <div className="relative w-full max-w-xs">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Produkte suchen..."
            className="pl-10 border rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-naturkostbar-brown/30 focus:border-naturkostbar-brown"
            value={productSearch}
            onChange={e => {
              setProductSearch(e.target.value);
              setShowCount(10);
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-naturkostbar-brown"></div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg shadow">
          <table className="min-w-full border rounded-lg bg-white">
            <thead>
              <tr className="bg-gray-50 border-b text-gray-700">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">kcal</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Fett (g)</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Kohlenhydrate (g)</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">Eiweiß (g)</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {visibleProducts.map(product => (
                <React.Fragment key={product.ID}>
                  <tr className={`hover:bg-gray-50 transition-colors ${expandedProduct === product.ID ? 'bg-gray-50' : ''}`}>
                    <td className="px-6 py-4 font-medium">{product.Produktname}</td>
                    <td className="px-6 py-4">{parseNutritionalValue(product.kcal).toFixed(1)}</td>
                    <td className="px-6 py-4">{parseNutritionalValue(product.Fett).toFixed(1)}</td>
                    <td className="px-6 py-4">{parseNutritionalValue(product.Kohlenhydrate).toFixed(1)}</td>
                    <td className="px-6 py-4">{parseNutritionalValue(product.Eiweiss).toFixed(1)}</td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => toggleExpand(product.ID)}
                        className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                        aria-label={expandedProduct === product.ID ? "Weniger anzeigen" : "Mehr anzeigen"}
                      >
                        {expandedProduct === product.ID ? (
                          <ChevronUp className="h-5 w-5 text-gray-500" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-gray-500" />
                        )}
                      </button>
                    </td>
                  </tr>
                  {expandedProduct === product.ID && (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 bg-gray-50">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                          <div>
                            <span className="font-medium text-gray-700">kJ:</span>{' '}
                            {parseNutritionalValue(product.kJ).toFixed(1)}
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Davon Zucker:</span>{' '}
                            {parseNutritionalValue(product["davon Zucker"]).toFixed(1)} g
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Ballaststoffe:</span>{' '}
                            {parseNutritionalValue(product.Ballaststoffe).toFixed(1)} g
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Salz:</span>{' '}
                            {parseNutritionalValue(product.Salz).toFixed(1)} g
                          </div>
                        </div>
                        <div className="mt-3">
                          <Link 
                            href={`/products?id=${product.ID}`}
                            className="inline-flex items-center text-naturkostbar-brown hover:underline"
                          >
                            <Info className="h-4 w-4 mr-1" />
                            Produktdetails anzeigen
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {visibleProducts.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">
                    {productSearch ? 'Keine Produkte gefunden' : 'Keine Produkte verfügbar'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {filteredProducts.length > showCount && (
        <div className="flex justify-center mt-6">
          <button
            className="px-6 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-medium transition-colors"
            onClick={() => setShowCount(c => c + 10)}
          >
            Mehr anzeigen
          </button>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-start min-h-screen w-full px-4 pb-16">
      <div className="w-full max-w-5xl">
        <h1 className="text-4xl sm:text-5xl font-bold mb-8 naturkostbar-accent text-center mt-10 sm:mt-16">
          Naturkostbar Nährwerteverwaltung
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-16">
          <Link href="/ingredients" className="block">
            <div className="h-32 flex items-center justify-center text-xl font-medium naturkostbar-accent-bg rounded-lg shadow-md transition hover:shadow-lg transform hover:scale-[1.02] text-white">
              Zutaten verwalten
            </div>
          </Link>
          <Link href="/products" className="block">
            <div className="h-32 flex items-center justify-center text-xl font-medium naturkostbar-accent-bg rounded-lg shadow-md transition hover:shadow-lg transform hover:scale-[1.02] text-white">
              Produkte verwalten
            </div>
          </Link>
        </div>

        <ProductList />
      </div>
    </main>
  );
}
