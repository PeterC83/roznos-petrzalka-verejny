import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const role = v.union(v.literal("ADMIN"), v.literal("USER"));

export const grantEmailAccess = internalMutation({
  args: { email: v.string(), role },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Neplatný e-mail.");
    const existing = await ctx.db.query("allowedEmails").withIndex("by_email", (q) => q.eq("email", email)).first();
    if (existing) {
      await ctx.db.patch(existing._id, { role: args.role, revokedAt: undefined });
      return { email, role: args.role, updated: true };
    }
    await ctx.db.insert("allowedEmails", { email, role: args.role, invitedAt: Date.now() });
    return { email, role: args.role, updated: false };
  },
});