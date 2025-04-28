"use client";
import { useState } from "react";
import { signInWithEmail } from "@/lib/auth";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await signInWithEmail(email, password);
    setLoading(false);
    if (error) {
      setError("Login fehlgeschlagen. Bitte überprüfe deine Zugangsdaten.");
    } else {
      router.replace("/");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center naturkostbar-accent">Login</h1>
        <div className="mb-4">
          <label className="block mb-1 font-medium">E-Mail</label>
          <input
            type="email"
            className="border rounded px-3 py-2 w-full"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="mb-6">
          <label className="block mb-1 font-medium">Passwort</label>
          <input
            type="password"
            className="border rounded px-3 py-2 w-full"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <div className="text-red-500 mb-4 text-center">{error}</div>}
        <button
          type="submit"
          className="w-full py-2 rounded naturkostbar-accent-bg text-white font-semibold text-lg hover:scale-105 transition"
          disabled={loading}
        >
          {loading ? "Einloggen..." : "Login"}
        </button>
      </form>
    </div>
  );
} 