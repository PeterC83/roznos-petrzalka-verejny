import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const currentAccess = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { state: "UNAUTHENTICATED" as const };
    const user = await ctx.db.get(userId);
    const email = user?.email?.trim().toLowerCase();
    if (!email) return { state: "DENIED" as const, reason: "E-mail nebol overený." };

    const allowed = await ctx.db.query("allowedEmails").withIndex("by_email", (q) => q.eq("email", email)).first();
    if (!allowed || allowed.revokedAt) return { state: "DENIED" as const, email, reason: "Tento e-mail nemá povolený prístup." };
    const personId = allowed.personId ?? user?.personId;
    const [districtAssignments, streetAssignments] = personId ? await Promise.all([
      ctx.db.query("districtAssignments").withIndex("by_personId", (q) => q.eq("personId", personId)).collect(),
      ctx.db.query("streetAssignments").withIndex("by_personId", (q) => q.eq("personId", personId)).collect(),
    ]) : [[], []];
    const hasAssignments = districtAssignments.some((item) => !item.endedAt) || streetAssignments.some((item) => !item.endedAt);
    return { state: "AUTHORIZED" as const, email, role: allowed.role, displayName: allowed.displayName, personId, hasAssignments };
  },
});