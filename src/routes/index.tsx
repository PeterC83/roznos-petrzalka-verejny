import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { AuthWrapper } from "../components/auth-wrapper";
import { Delivery } from "../components/roznos/delivery";
import { Overview } from "../components/roznos/overview";
import { Admin } from "../components/roznos/admin";

export const Route = createFileRoute("/")({ component: Page });

function Page() {
  return <AuthWrapper><App /></AuthWrapper>;
}

function App() {
  const access = useQuery(api.users.currentAccess, {});
  const { signOut } = useAuthActions();
  const [tab, setTab] = useState<"mine" | "all" | "overview" | "admin">("mine");
  const [initialTabResolved, setInitialTabResolved] = useState(false);
  const [dark, setDark] = useState(true);
  useEffect(() => { const saved = window.localStorage.getItem("roznos-theme"); if (saved) setDark(saved === "dark"); }, []);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); window.localStorage.setItem("roznos-theme", dark ? "dark" : "light"); }, [dark]);
  useEffect(() => {
    if (!access || access.state !== "AUTHORIZED" || initialTabResolved) return;
    if (!access.hasAssignments) setTab("all");
    setInitialTabResolved(true);
  }, [access, initialTabResolved]);
  if (!access || access.state !== "AUTHORIZED") return null;
  const isAdmin = access.role === "ADMIN";
  const navClass = (name: typeof tab) => "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold " + (tab === name ? "bg-primary/10 text-primary" : "text-muted-foreground");
  return <main className="min-h-screen bg-background pb-24 text-foreground">
    <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur print:hidden"><div className="mx-auto flex max-w-4xl items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Petržalka</p><h1 className="text-xl font-bold">Roznos</h1></div><div className="flex items-center gap-2"><button onClick={() => setDark((value) => !value)} aria-label={dark ? "Prepnúť na svetlý režim" : "Prepnúť na tmavý režim"} className="rounded-full border px-3 py-1 text-xs font-semibold">{dark ? "☀ Svetlý" : "☾ Tmavý"}</button><button onClick={() => void signOut()} className="rounded-full border px-3 py-1 text-xs font-semibold">Odhlásiť</button></div></div></header>
    {tab === "mine" ? <Delivery scope="mine" /> : tab === "all" ? <Delivery scope="all" /> : tab === "overview" ? <Overview /> : <Admin />}
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden"><div className={"mx-auto grid max-w-4xl divide-x " + (isAdmin ? "grid-cols-4" : "grid-cols-3")}><button onClick={() => setTab("mine")} className={navClass("mine")}><span className="text-base">●</span>Moje</button><button onClick={() => setTab("all")} className={navClass("all")}><span className="text-base">▦</span>Vchody</button><button onClick={() => setTab("overview")} className={navClass("overview")}><span className="text-base">▤</span>Prehľad</button>{isAdmin && <button onClick={() => setTab("admin")} className={navClass("admin")}><span className="text-base">⚙</span>Správa</button>}</div></nav>
  </main>;
}

