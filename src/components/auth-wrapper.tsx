import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SignInForm } from "./sign-in-form";

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthLoading><Loading /></AuthLoading>
      <Unauthenticated><SignInForm /></Unauthenticated>
      <Authenticated><AccessGate>{children}</AccessGate></Authenticated>
    </>
  );
}

function AccessGate({ children }: { children: React.ReactNode }) {
  const access = useQuery(api.users.currentAccess, {});
  if (!access) return <Loading />;
  if (access.state === "AUTHORIZED") return <>{children}</>;
  return <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground"><div className="max-w-sm rounded-2xl border bg-card p-6 shadow-sm"><h1 className="text-xl font-bold">Prístup nie je povolený</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{access.reason ?? "Tento e-mail nie je v zozname povolených používateľov."}</p><p className="mt-4 text-sm text-muted-foreground">Požiadajte administrátora o pridanie e-mailu.</p></div></main>;
}

function Loading() {
  return <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Overujem prístup…</main>;
}