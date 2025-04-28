"use client";
import { useState, useEffect } from "react";
import { supabase, parseNutritionalValue, ProduktMaster } from "@/lib/supabase";

function ProductList() {
  const [products, setProducts] = useState<ProduktMaster[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [showCount, setShowCount] = useState(10);

  useEffect(() => {
    async function fetchProducts() {
      const { data } = await supabase.from('ProduktMaster').select('*').order('ID', { ascending: false });
      setProducts(data || []);
    }
    fetchProducts();
  }, []);

  const filteredProducts = products.filter(product =>
    !productSearch || (product.Produktname && product.Produktname.toLowerCase().includes(productSearch.toLowerCase()))
  );
  const visibleProducts = filteredProducts.slice(0, showCount);

  return (
    <div className="mt-12">
      <h2 className="text-xl font-bold mb-6 naturkostbar-accent">Produktliste</h2>
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2">
        <input
          type="text"
          placeholder="Produkte suchen..."
          className="border rounded px-3 py-2 w-full sm:w-64"
          value={productSearch}
          onChange={e => {
            setProductSearch(e.target.value);
            setShowCount(10);
          }}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border rounded bg-white">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2 text-left font-semibold">Name</th>
              <th className="px-4 py-2 text-left font-semibold">kcal</th>
              <th className="px-4 py-2 text-left font-semibold">Fett (g)</th>
              <th className="px-4 py-2 text-left font-semibold">Kohlenhydrate (g)</th>
              <th className="px-4 py-2 text-left font-semibold">Eiweiß (g)</th>
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map(product => (
              <tr key={product.ID} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{product.Produktname}</td>
                <td className="px-4 py-2">{parseNutritionalValue(product.kcal).toFixed(1)}</td>
                <td className="px-4 py-2">{parseNutritionalValue(product.Fett).toFixed(1)}</td>
                <td className="px-4 py-2">{parseNutritionalValue(product.Kohlenhydrate).toFixed(1)}</td>
                <td className="px-4 py-2">{parseNutritionalValue(product.Eiweiss).toFixed(1)}</td>
              </tr>
            ))}
            {visibleProducts.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-400">Keine Produkte gefunden</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filteredProducts.length > showCount && (
        <div className="flex justify-center mt-4">
          <button
            className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm"
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
    <main className="flex flex-col items-center justify-start min-h-screen w-full">
      <h1 className="text-4xl font-bold mb-8 naturkostbar-accent text-center mt-8">Naturkostbar Nährwerteverwaltung</h1>
      <div className="flex flex-col md:flex-row gap-8 justify-center items-center w-full max-w-3xl mb-12">
        <a href="/ingredients" className="w-full md:w-1/2">
          <button className="w-full h-32 text-xl naturkostbar-accent-bg rounded-lg shadow-md transition hover:scale-105">Zutaten verwalten</button>
        </a>
        <a href="/products" className="w-full md:w-1/2">
          <button className="w-full h-32 text-xl naturkostbar-accent-bg rounded-lg shadow-md transition hover:scale-105">Produkte verwalten</button>
        </a>
      </div>
      <div className="w-full max-w-5xl">
        <ProductList />
      </div>
    </main>
  );
}
