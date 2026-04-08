import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck } from "lucide-react";

interface LoginProps {
  onLoginSuccess: () => void;
}

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
      } else {
        onLoginSuccess();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-[360px] space-y-6">
          {/* Logo */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto shadow-lg">
              <ShieldCheck className="w-9 h-9 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Union Local</h1>
            <p className="text-sm text-muted-foreground">Steward Portal</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Username
              </label>
              <Input
                autoComplete="username"
                autoCapitalize="none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="steward.jones"
                className="h-12 rounded-xl bg-card"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Password
              </label>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 rounded-xl bg-card"
                required
              />
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 rounded-xl font-bold text-base mt-2"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Not a member yet?{" "}
            <a
              href={BASE + "/request-access"}
              className="font-bold text-primary underline"
            >
              Request Access
            </a>
          </p>
        </div>
      </div>

      <div className="pb-8 text-center">
        <p className="text-xs text-muted-foreground">
          Union Local — Steward Access Only
        </p>
      </div>
    </div>
  );
}
