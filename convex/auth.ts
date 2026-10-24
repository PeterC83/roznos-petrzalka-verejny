import { convexAuth } from "@convex-dev/auth/server";
import { ResendOTP } from "./ResendOTP";

async function allowedRedirect({ redirectTo }: { redirectTo: string }) {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (!appUrl || !redirectTo.startsWith(appUrl)) {
    throw new Error("Neplatný cieľ prihlasovacieho odkazu.");
  }
  const next = redirectTo.slice(appUrl.length, appUrl.length + 1);
  if (next && next !== "?" && next !== "/") {
    throw new Error("Neplatný cieľ prihlasovacieho odkazu.");
  }
  return redirectTo;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [ResendOTP],
  callbacks: { redirect: allowedRedirect },
});