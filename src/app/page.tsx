import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function Home() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">Naturkostbar Ingredient Management</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link href="/ingredients">
          <Button className="w-full h-32 text-xl">Manage Ingredients</Button>
        </Link>
        <Link href="/products">
          <Button className="w-full h-32 text-xl">Manage Products</Button>
        </Link>
        <Link href="/recipes">
          <Button className="w-full h-32 text-xl">Manage Recipes</Button>
        </Link>
      </div>
    </main>
  )
}
