import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { nextReportAt } from "./reportTime";

function normalizedName(displayName: string) {
  return displayName.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

async function requireAccess(ctx: any, admin = false) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Vyžaduje sa prihlásenie.");
  const user = await ctx.db.get(userId);
  const email = user?.email?.trim().toLowerCase();
  if (!email) throw new Error("Vyžaduje sa overený e-mail.");
  const allowed = await ctx.db.query("allowedEmails").withIndex("by_email", (q: any) => q.eq("email", email)).first();
  if (!allowed || allowed.revokedAt) throw new Error("Tento e-mail nemá povolený prístup.");
  if (admin && allowed.role !== "ADMIN") throw new Error("Vyžadujú sa administrátorské oprávnenia.");
  return { userId, user, allowed };
}

async function findOrCreatePerson(ctx: any, displayName: string) {
  const name = displayName.trim();
  if (!name) throw new Error("Zadajte meno.");
  const normalized = normalizedName(name);
  const existing = await ctx.db.query("people").withIndex("by_normalizedName", (q: any) => q.eq("normalizedName", normalized)).first();
  if (existing && !existing.archivedAt) return existing._id;
  return await ctx.db.insert("people", { displayName: name, normalizedName: normalized, createdAt: Date.now() });
}

async function linkAuthUsers(ctx: any, email: string, personId: any) {
  const users = await ctx.db.query("users").withIndex("email", (q: any) => q.eq("email", email)).collect();
  for (const user of users) await ctx.db.patch(user._id, { personId });
}

async function upsertAllowedUser(ctx: any, args: { email: string; displayName: string; role: "ADMIN" | "USER"; invitedByUserId?: any }) {
  const email = args.email.trim().toLowerCase();
  const displayName = args.displayName.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Neplatný e-mail.");
  const personId = await findOrCreatePerson(ctx, displayName);
  const existing = await ctx.db.query("allowedEmails").withIndex("by_email", (q: any) => q.eq("email", email)).first();
  if (existing) await ctx.db.patch(existing._id, { displayName, personId, role: args.role, revokedAt: undefined });
  else await ctx.db.insert("allowedEmails", { email, displayName, personId, role: args.role, invitedAt: Date.now(), invitedByUserId: args.invitedByUserId });
  await linkAuthUsers(ctx, email, personId);
  return personId;
}

export const adminData = query({
  args: {},
  handler: async (ctx) => {
    await requireAccess(ctx, true);
    const [allowedEmails, people, rajons, assignments, streetAssignments, entrances, streets, divisionLinks, divisions] = await Promise.all([
      ctx.db.query("allowedEmails").collect(),
      ctx.db.query("people").collect(),
      ctx.db.query("rajons").collect(),
      ctx.db.query("districtAssignments").collect(),
      ctx.db.query("streetAssignments").collect(),
      ctx.db.query("entrances").collect(),
      ctx.db.query("streets").collect(),
      ctx.db.query("districtDivisionLinks").collect(),
      ctx.db.query("electoralDivisions").collect(),
    ]);
    const personById = new Map(people.map((person) => [person._id, person]));
    const divisionById = new Map(divisions.map((division) => [division._id, division]));
    const activeStreetAssignments = new Map(streetAssignments.filter((assignment) => !assignment.endedAt).map((assignment) => [assignment.streetId, assignment]));
    const rajonSummaries = rajons.map((rajon) => {
      const rajonEntrances = entrances.filter((entrance) => entrance.rajonId === rajon._id);
      return {
        rajonId: rajon._id,
        divisions: divisionLinks.filter((link) => link.rajonId === rajon._id).map((link) => divisionById.get(link.electoralDivisionId)?.number).filter((number): number is number => number !== undefined).sort((a, b) => a - b),
        entrances: rajonEntrances.length,
        mailboxes: rajonEntrances.reduce((sum, entrance) => sum + entrance.mailboxCount, 0),
        streets: streets.filter((street) => street.rajonId === rajon._id && rajonEntrances.some((entrance) => entrance.streetId === street._id)).map((street) => {
          const streetEntrances = rajonEntrances.filter((entrance) => entrance.streetId === street._id);
          const assignment = activeStreetAssignments.get(street._id);
          return { id: street._id, name: street.name, entrances: streetEntrances.length, mailboxes: streetEntrances.reduce((sum, entrance) => sum + entrance.mailboxCount, 0), personId: assignment?.personId, personName: assignment?.personId ? personById.get(assignment.personId)?.displayName ?? "Neznáma osoba" : undefined, isUnassigned: Boolean(assignment?.isUnassigned) };
        }).sort((a, b) => a.name.localeCompare(b.name, "sk")),
      };
    });
    const activeAllowed = allowedEmails.filter((entry) => !entry.revokedAt);
    const allowedByPersonId = new Map(activeAllowed.filter((entry) => entry.personId).map((entry) => [entry.personId!, entry]));
    const userProfiles = [
      ...people.filter((person) => !person.archivedAt).map((person) => {
        const access = allowedByPersonId.get(person._id);
        return { personId: person._id, allowedEmailId: access?._id, displayName: person.displayName, email: access?.email, role: access?.role, hasEmail: Boolean(access) };
      }),
      ...activeAllowed.filter((entry) => !entry.personId).map((entry) => ({ personId: undefined, allowedEmailId: entry._id, displayName: entry.displayName ?? entry.email, email: entry.email, role: entry.role, hasEmail: true })),
    ].sort((a, b) => a.displayName.localeCompare(b.displayName, "sk"));
    return {
      allowedEmails: activeAllowed.sort((a, b) => a.email.localeCompare(b.email)),
      userProfiles,
      people: people.filter((person) => !person.archivedAt).sort((a, b) => a.displayName.localeCompare(b.displayName, "sk")),
      rajons: rajons.sort((a, b) => a.name.localeCompare(b.name, "sk")),
      rajonSummaries,
      assignments: assignments.filter((assignment) => !assignment.endedAt).map((assignment) => ({ rajonId: assignment.rajonId, personId: assignment.personId, personName: personById.get(assignment.personId)?.displayName ?? "Neznáma osoba" })),
    };
  },
});

export const grantEmailAccess = mutation({
  args: { email: v.string(), displayName: v.optional(v.string()), role: v.union(v.literal("ADMIN"), v.literal("USER")) },
  handler: async (ctx, args) => {
    const { userId } = await requireAccess(ctx, true);
    const email = args.email.trim().toLowerCase();
    const existing = await ctx.db.query("allowedEmails").withIndex("by_email", (q) => q.eq("email", email)).first();
    const displayName = args.displayName?.trim() || existing?.displayName || email;
    return await upsertAllowedUser(ctx, { email, displayName, role: args.role, invitedByUserId: userId });
  },
});

export const saveUserProfile = mutation({
  args: { personId: v.optional(v.id("people")), allowedEmailId: v.optional(v.id("allowedEmails")), displayName: v.string(), email: v.optional(v.string()), role: v.union(v.literal("ADMIN"), v.literal("USER")) },
  handler: async (ctx, args) => {
    const { userId } = await requireAccess(ctx, true);
    const displayName = args.displayName.trim();
    if (!displayName) throw new Error("Zadajte meno.");
    let personId = args.personId;
    if (personId) {
      const existingPerson = await ctx.db.get(personId);
      if (!existingPerson || existingPerson.archivedAt) throw new Error("Používateľ neexistuje.");
      await ctx.db.patch(personId, { displayName, normalizedName: normalizedName(displayName) });
    } else {
      personId = await findOrCreatePerson(ctx, displayName);
    }
    const currentAccess = args.allowedEmailId ? await ctx.db.get(args.allowedEmailId) : (await ctx.db.query("allowedEmails").withIndex("by_personId", (q) => q.eq("personId", personId!)).first());
    const email = args.email?.trim().toLowerCase();
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Neplatný e-mail.");
      const duplicate = await ctx.db.query("allowedEmails").withIndex("by_email", (q) => q.eq("email", email)).first();
      if (duplicate && duplicate._id !== currentAccess?._id) throw new Error("Tento e-mail už patrí inému používateľovi.");
      if (currentAccess) await ctx.db.patch(currentAccess._id, { email, displayName, personId, role: args.role, revokedAt: undefined });
      else await ctx.db.insert("allowedEmails", { email, displayName, personId, role: args.role, invitedAt: Date.now(), invitedByUserId: userId });
      await linkAuthUsers(ctx, email, personId);
    } else if (currentAccess) {
      await ctx.db.patch(currentAccess._id, { displayName, personId, role: args.role });
    }
    return personId;
  },
});

export const deleteUserProfile = mutation({
  args: { personId: v.optional(v.id("people")), allowedEmailId: v.optional(v.id("allowedEmails")) },
  handler: async (ctx, args) => {
    await requireAccess(ctx, true);
    const now = Date.now();
    const access = args.allowedEmailId ? await ctx.db.get(args.allowedEmailId) : (args.personId ? await ctx.db.query("allowedEmails").withIndex("by_personId", (q) => q.eq("personId", args.personId!)).first() : null);
    if (access) await ctx.db.patch(access._id, { revokedAt: now });
    if (args.personId) {
      const person = await ctx.db.get(args.personId);
      if (person) await ctx.db.patch(person._id, { archivedAt: now });
    }
  },
});

export const createPerson = mutation({
  args: { displayName: v.string() },
  handler: async (ctx, args) => {
    await requireAccess(ctx, true);
    return await findOrCreatePerson(ctx, args.displayName);
  },
});

export const assignRajon = mutation({
  args: { rajonId: v.id("rajons"), personId: v.id("people") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAccess(ctx, true);
    const rajon = await ctx.db.get(args.rajonId);
    const person = await ctx.db.get(args.personId);
    if (!rajon || !rajon.active) throw new Error("Rajón neexistuje.");
    if (!person || person.archivedAt) throw new Error("Vybraná osoba nie je aktívna.");
    const existing = await ctx.db.query("districtAssignments").withIndex("by_rajonId", (q) => q.eq("rajonId", args.rajonId)).collect();
    const now = Date.now();
    for (const assignment of existing) if (!assignment.endedAt) await ctx.db.patch(assignment._id, { endedAt: now });
    await ctx.db.insert("districtAssignments", { rajonId: args.rajonId, personId: args.personId, assignedAt: now, assignedByUserId: userId });
    const streets = await ctx.db.query("streets").withIndex("by_rajonId", (q) => q.eq("rajonId", args.rajonId)).collect();
    let clearedExclusions = 0;
    for (const street of streets) {
      const streetAssignments = await ctx.db.query("streetAssignments").withIndex("by_streetId", (q) => q.eq("streetId", street._id)).collect();
      for (const streetAssignment of streetAssignments) {
        if (!streetAssignment.endedAt && streetAssignment.isUnassigned) {
          await ctx.db.patch(streetAssignment._id, { endedAt: now });
          clearedExclusions += 1;
        }
      }
    }
    await ctx.db.insert("auditLog", {
      actorUserId: userId,
      action: "ASSIGN_RAJON",
      entityType: "rajons",
      entityId: String(args.rajonId),
      after: JSON.stringify({ personId: args.personId, clearedExclusions }),
      createdAt: now,
    });
    return null;
  },
});

export const assignStreet = mutation({
  args: { streetId: v.id("streets"), personId: v.id("people") },
  handler: async (ctx, args) => {
    const { userId } = await requireAccess(ctx, true);
    const existing = await ctx.db.query("streetAssignments").withIndex("by_streetId", (q) => q.eq("streetId", args.streetId)).collect();
    const now = Date.now();
    for (const assignment of existing) if (!assignment.endedAt) await ctx.db.patch(assignment._id, { endedAt: now });
    await ctx.db.insert("streetAssignments", { streetId: args.streetId, personId: args.personId, assignedAt: now, assignedByUserId: userId });
  },
});

export const setEntranceMailboxCount = mutation({
  args: { entranceId: v.id("entrances"), mailboxCount: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAccess(ctx);
    if (!Number.isInteger(args.mailboxCount) || args.mailboxCount < 1 || args.mailboxCount > 10000) {
      throw new Error("Skutočný počet schránok musí byť celé číslo od 1 do 10 000.");
    }
    const entrance = await ctx.db.get(args.entranceId);
    if (!entrance) throw new Error("Vchod neexistuje.");
    if (entrance.mailboxCount === args.mailboxCount && entrance.isEstimated !== true) return null;
    const activeCompletions = (await ctx.db.query("completions").withIndex("by_entranceId", (q) => q.eq("entranceId", entrance._id)).collect()).filter((completion) => !completion.revertedAt);
    await ctx.db.patch(args.entranceId, { mailboxCount: args.mailboxCount, isEstimated: false, version: entrance.version + 1 });
    for (const completion of activeCompletions) {
      await ctx.db.patch(completion._id, { mailboxCountAtCompletion: args.mailboxCount });
    }
    await ctx.db.insert("auditLog", {
      actorUserId: userId,
      action: "SET_MAILBOX_COUNT",
      entityType: "entrances",
      entityId: String(args.entranceId),
      before: JSON.stringify({ mailboxCount: entrance.mailboxCount, isEstimated: entrance.isEstimated }),
      after: JSON.stringify({ mailboxCount: args.mailboxCount, isEstimated: false }),
      createdAt: Date.now(),
    });
    return null;
  },
});

export const setEntranceStatus = mutation({
  args: {
    entranceId: v.id("entrances"),
    status: v.union(v.literal("TODO"), v.literal("DONE"), v.literal("LEFT_INSIDE")),
    personId: v.optional(v.id("people")),
    mailboxCount: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAccess(ctx, args.status === "TODO");
    const entrance = await ctx.db.get(args.entranceId);
    if (!entrance) throw new Error("Vchod neexistuje.");
    if (args.mailboxCount !== undefined && (!Number.isInteger(args.mailboxCount) || args.mailboxCount < 1 || args.mailboxCount > 10000)) {
      throw new Error("Skutočný počet schránok musí byť celé číslo od 1 do 10 000.");
    }
    const mailboxCount = args.mailboxCount ?? entrance.mailboxCount;
    const now = Date.now();
    const activeCompletions = (await ctx.db.query("completions").withIndex("by_entranceId", (q) => q.eq("entranceId", entrance._id)).collect()).filter((completion) => !completion.revertedAt);
    if (args.status !== "DONE") {
      for (const completion of activeCompletions) await ctx.db.patch(completion._id, { revertedAt: now, revertedByUserId: userId });
    } else {
      const streetAssignment = (await ctx.db.query("streetAssignments").withIndex("by_streetId", (q) => q.eq("streetId", entrance.streetId)).collect()).find((item) => !item.endedAt);
      const rajonAssignment = (await ctx.db.query("districtAssignments").withIndex("by_rajonId", (q) => q.eq("rajonId", entrance.rajonId)).collect()).find((item) => !item.endedAt);
      const personId = args.personId ?? streetAssignment?.personId ?? rajonAssignment?.personId;
      if (!personId) throw new Error("Pred označením hotovo priraďte osobu rajónu, ulici alebo ju vyberte pri vchode.");
      const person = await ctx.db.get(personId);
      if (!person || person.archivedAt) throw new Error("Vybraná osoba nie je aktívna.");
      const active = activeCompletions[0];
      if (active) await ctx.db.patch(active._id, { personId, recordedByUserId: userId, mailboxCountAtCompletion: mailboxCount });
      else await ctx.db.insert("completions", { entranceId: entrance._id, personId, recordedByUserId: userId, mailboxCountAtCompletion: mailboxCount, mailboxLocation: entrance.mailboxLocation, completedAt: now });
    }
    await ctx.db.patch(args.entranceId, {
      status: args.status,
      mailboxCount,
      ...(args.mailboxCount !== undefined ? { isEstimated: false } : {}),
      version: entrance.version + 1,
    });
    if (args.status === "DONE" && entrance.status !== "DONE") {
      const scheduledAt = nextReportAt(now);
      const existingReport = await ctx.db.query("dailyReports").withIndex("by_scheduledAt", (q) => q.eq("scheduledAt", scheduledAt)).first();
      if (!existingReport) {
        const runId = await ctx.db.insert("dailyReports", { scheduledAt, createdAt: now, cutoffAt: now - 1, status: "PENDING", sentEmails: [] });
        await ctx.scheduler.runAt(scheduledAt, internal.dailyReport.send, { runId });
      }
    }
    await ctx.db.insert("auditLog", {
      actorUserId: userId,
      action: args.status === "DONE" ? "MARK_DONE" : args.status === "LEFT_INSIDE" ? "MARK_LEFT_INSIDE" : "MARK_TODO",
      entityType: "entrances",
      entityId: String(args.entranceId),
      before: JSON.stringify({ status: entrance.status, mailboxCount: entrance.mailboxCount, isEstimated: entrance.isEstimated }),
      after: JSON.stringify({ status: args.status, personId: args.personId, mailboxCount, isEstimated: args.mailboxCount !== undefined ? false : entrance.isEstimated }),
      createdAt: now,
    });
    return null;
  },
});

const knownUsers: Array<{ displayName: string; email: string }> = [];

export const seedKnownUsers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const linked: Array<{ displayName: string; email: string; personId: any }> = [];
    for (const user of knownUsers) {
      const current = await ctx.db.query("allowedEmails").withIndex("by_email", (q) => q.eq("email", user.email)).first();
      const personId = await upsertAllowedUser(ctx, { ...user, role: current?.role ?? "USER" });
      linked.push({ ...user, personId });
    }
    return { linked };
  },
});
export const verifyKnownUserLinks = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [allowed, districtAssignments, streetAssignments] = await Promise.all([
      ctx.db.query("allowedEmails").collect(),
      ctx.db.query("districtAssignments").collect(),
      ctx.db.query("streetAssignments").collect(),
    ]);
    return knownUsers.map((user) => {
      const account = allowed.find((entry) => entry.email === user.email);
      const personId = account?.personId;
      return {
        email: user.email,
        linked: Boolean(personId),
        rajons: personId ? districtAssignments.filter((assignment) => assignment.personId === personId && !assignment.endedAt).length : 0,
        streets: personId ? streetAssignments.filter((assignment) => assignment.personId === personId && !assignment.endedAt).length : 0,
      };
    });
  },
});


export const unassignStreet = mutation({
  args: { streetId: v.id("streets") },
  handler: async (ctx, args) => {
    const { userId } = await requireAccess(ctx, true);
    const street = await ctx.db.get(args.streetId);
    if (!street) throw new Error("Ulica neexistuje.");
    const active = (await ctx.db.query("streetAssignments").withIndex("by_streetId", (q) => q.eq("streetId", args.streetId)).collect()).filter((assignment) => !assignment.endedAt);
    const inherited = (await ctx.db.query("districtAssignments").withIndex("by_rajonId", (q) => q.eq("rajonId", street.rajonId)).collect()).some((assignment) => !assignment.endedAt);
    const now = Date.now();
    for (const assignment of active) await ctx.db.patch(assignment._id, { endedAt: now });
    if (inherited) await ctx.db.insert("streetAssignments", { streetId: args.streetId, isUnassigned: true, assignedAt: now, assignedByUserId: userId });
    await ctx.db.insert("auditLog", { actorUserId: userId, action: "UNASSIGN_STREET", entityType: "streets", entityId: String(args.streetId), after: JSON.stringify({ excludedFromRajon: inherited }), createdAt: now });
    return { removed: active.length > 0 || inherited, excludedFromRajon: inherited };
  },
});
