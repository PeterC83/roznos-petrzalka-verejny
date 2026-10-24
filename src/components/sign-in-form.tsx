import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect, useState, type FormEvent } from "react";

export function SignInForm() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) return;
    const form = new FormData();
    form.set("code", code);
    setBusy(true);
    void signIn("resend-otp", form)
      .then(() => window.history.replaceState({}, "", window.location.pathname))
      .catch(() => setError("Prihlasovací odkaz nie je platný alebo už vypršal. Požiadajte o nový."))
      .finally(() => setBusy(false));
  }, [signIn]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const address = String(form.get("email") ?? "").trim().toLowerCase();
    form.set("redirectTo", window.location.origin);
    try {
      await signIn("resend-otp", form);
      setEmail(address);
      setSent(true);
    } catch {
      setError("Prihlasovací odkaz sa nepodarilo odoslať. Skúste to znova.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Petržalka</p><h1 className="mt-1 text-2xl font-bold">Roznos</h1></div>
        {busy && !sent ? <p className="text-sm text-muted-foreground">Prihlasujem…</p> : sent ? (
          <>
            <p className="text-sm leading-6 text-muted-foreground">Prihlasovací odkaz bol odoslaný na <strong className="font-semibold text-foreground">{email}</strong>.</p>
            <p className="text-sm leading-6 text-muted-foreground">Otvorte e-mail a kliknite na odkaz. Prihlásenie prebehne automaticky.</p>
            <button type="button" onClick={() => { setSent(false); setError(null); }} className="w-full text-sm text-muted-foreground">Použiť iný e-mail</button>
          </>
        ) : (
          <>
            <p className="text-sm leading-6 text-muted-foreground">Zadajte svoj povolený e-mail. Pošleme vám jednorazový prihlasovací odkaz.</p>
            <input name="email" type="email" required autoComplete="email" disabled={busy} className="w-full rounded-xl border bg-background px-3 py-2.5" placeholder="meno@priklad.sk" />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60">Poslať prihlasovací odkaz</button>
          </>
        )}
        {error && sent && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </main>
  );
}