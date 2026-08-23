import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Compass, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Sutradhar Research Agent" },
      {
        name: "description",
        content: "Sign in to Sutradhar to run evidence-based, fully cited AI research in your own workspace.",
      },
      { property: "og:title", content: "Sign in — Sutradhar Research Agent" },
      { property: "og:description", content: "Access your cited AI research workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;
        if (data.session) {
          await navigate({ to: "/research", replace: true });
          return;
        }
        setConfirmationEmail(email);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.session) throw new Error("Sign in completed without a session. Please try again.");
        await navigate({ to: "/research", replace: true });
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Compass className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Sutradhar</h1>
          <p className="text-sm text-muted-foreground">Cited, evidence-first AI research.</p>
        </div>

        {confirmationEmail ? (
          <div className="space-y-4 rounded-lg border border-border bg-card p-5 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-primary" />
            <div>
              <h2 className="text-sm font-semibold">Check your email</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                We sent a verification link to {confirmationEmail}. Open it in this browser and you’ll continue to
                your research workspace automatically.
              </p>
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={() => setConfirmationEmail(null)}>
              Back to sign in
            </Button>
          </div>
        ) : (
        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <Button
            type="submit"
            disabled={busy}
            className="w-full"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === "signup" ? "Create account" : "Sign in"}
          </Button>
        </form>
        )}

        {!confirmationEmail ? <Button
          type="button"
          variant="ghost"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full text-xs text-muted-foreground"
        >
          {mode === "signin" ? "No account? Create one" : "Already have an account? Sign in"}
        </Button> : null}
      </div>
    </main>
  );
}
