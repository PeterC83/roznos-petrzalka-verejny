import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";

async function currentPerson(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Vyžaduje sa prihlásenie.");
  const user = await ctx.db.get(userId);
  const email = user?.email?.trim().toLowerCase();
  if (!email) throw new Error("Vyžaduje sa overený e-mail.");
  const access = await ctx.db.query("allowedEmails").withIndex("by_email", (q) => q.eq("email", email)).first();
  if (!access || access.revokedAt) throw new Error("Tento e-mail nemá povolený prístup.");
  return { personId: access.personId ?? user?.personId, isAdmin: access.role === "ADMIN" };
}

const item = v.object({
  id: v.id("entrances"),
  streetId: v.id("streets"),
  rajon: v.string(),
  street: v.string(),
  hasDirectStreetAssignment: v.boolean(),
  number: v.string(),
  mailboxes: v.number(),
  isEstimated: v.boolean(),
  status: v.union(v.literal("TODO"), v.literal("DONE")),
  deliveryStatus: v.union(v.literal("TODO"), v.literal("DONE"), v.literal("LEFT_INSIDE")),
  mailboxLocation: v.union(v.literal("UNKNOWN"), v.literal("OUTSIDE"), v.literal("INSIDE")),
  division: v.number(),
  isMine: v.boolean(),
  assignedPersonId: v.optional(v.id("people")),
  assignedPersonName: v.optional(v.string()),
  completedPersonId: v.optional(v.id("people")),
  completedPersonName: v.optional(v.string()),
});

export const options = query({
  args: {},
  returns: v.object({
    people: v.array(v.object({ id: v.id("people"), displayName: v.string() })),
    isAdmin: v.boolean(),
    rajons: v.array(v.object({ id: v.id("rajons"), name: v.string(), divisions: v.array(v.number()) })),
    divisions: v.array(v.number()),
  }),
  handler: async (ctx) => {
    const { isAdmin } = await currentPerson(ctx);
    const [people, rajons, links, divisions] = await Promise.all([
      ctx.db.query("people").collect(),
      ctx.db.query("rajons").collect(),
      ctx.db.query("districtDivisionLinks").collect(),
      ctx.db.query("electoralDivisions").collect(),
    ]);
    const numberById = new Map(divisions.map((division) => [division._id, division.number]));
    return {
      isAdmin,
      people: people.filter((person) => !person.archivedAt).sort((a, b) => a.displayName.localeCompare(b.displayName, "sk")).map((person) => ({ id: person._id, displayName: person.displayName })),
      rajons: rajons.filter((rajon) => rajon.active).map((rajon) => ({
        id: rajon._id,
        name: rajon.name,
        divisions: links.filter((link) => link.rajonId === rajon._id).map((link) => numberById.get(link.electoralDivisionId)).filter((number): number is number => number !== undefined),
      })).sort((a, b) => a.name.localeCompare(b.name, "sk")),
      divisions: divisions.map((division) => division.number).sort((a, b) => a - b),
    };
  },
});

export function summarizeEntrances(entrances: ReadonlyArray<{ mailboxCount: number; status: "TODO" | "DONE" | "LEFT_INSIDE" }>) {
  let mailboxes = 0;
  let doneMailboxes = 0;
  for (const entrance of entrances) {
    mailboxes += entrance.mailboxCount;
    if (entrance.status === "DONE") doneMailboxes += entrance.mailboxCount;
  }
  return { entrances: entrances.length, mailboxes, doneMailboxes };
}

export const totals = query({
  args: {},
  returns: v.object({ entrances: v.number(), mailboxes: v.number(), doneMailboxes: v.number() }),
  handler: async (ctx) => {
    await currentPerson(ctx);
    // ponytail: scan the election's entrance set; maintain counters if this summary becomes slow.
    return summarizeEntrances(await ctx.db.query("entrances").collect());
  },
});

export const entrances = query({
  args: {
    paginationOpts: paginationOptsValidator,
    rajonId: v.optional(v.id("rajons")),
    division: v.optional(v.number()),
    status: v.optional(v.union(v.literal("TODO"), v.literal("DONE"), v.literal("LEFT_INSIDE"), v.literal("UNDONE"))),
    outsideOnly: v.optional(v.boolean()),
  },
  returns: paginationResultValidator(item),
  handler: async (ctx, args) => {
    const { personId } = await currentPerson(ctx);
    const division = args.division === undefined ? null : await ctx.db.query("electoralDivisions").withIndex("by_number", (q) => q.eq("number", args.division!)).first();
    if (args.division !== undefined && !division) throw new Error("Neznámy volebný obvod.");
    const page = args.rajonId
      ? await ctx.db.query("entrances").withIndex("by_rajonId", (q) => q.eq("rajonId", args.rajonId!))
          .filter((q) => q.and(
            division ? q.eq(q.field("electoralDivisionId"), division._id) : q.eq(q.field("rajonId"), args.rajonId!),
            args.status === "UNDONE" ? q.neq(q.field("status"), "DONE") : args.status ? q.eq(q.field("status"), args.status) : q.eq(q.field("rajonId"), args.rajonId!),
            args.outsideOnly ? q.eq(q.field("mailboxLocation"), "OUTSIDE") : q.eq(q.field("rajonId"), args.rajonId!),
          )).paginate(args.paginationOpts)
      : division
        ? await ctx.db.query("entrances").withIndex("by_electoralDivisionId", (q) => q.eq("electoralDivisionId", division._id))
            .filter((q) => q.and(args.status === "UNDONE" ? q.neq(q.field("status"), "DONE") : args.status ? q.eq(q.field("status"), args.status) : q.eq(q.field("electoralDivisionId"), division._id), args.outsideOnly ? q.eq(q.field("mailboxLocation"), "OUTSIDE") : q.eq(q.field("electoralDivisionId"), division._id)))
            .paginate(args.paginationOpts)
        : args.status === "UNDONE"
          ? await ctx.db.query("entrances").filter((q) => args.outsideOnly ? q.and(q.neq(q.field("status"), "DONE"), q.eq(q.field("mailboxLocation"), "OUTSIDE")) : q.neq(q.field("status"), "DONE")).paginate(args.paginationOpts)
        : args.status
          ? await ctx.db.query("entrances").withIndex("by_status", (q) => q.eq("status", args.status as "TODO" | "DONE" | "LEFT_INSIDE"))
              .filter((q) => args.outsideOnly ? q.eq(q.field("mailboxLocation"), "OUTSIDE") : q.eq(q.field("status"), args.status!)).paginate(args.paginationOpts)
          : args.outsideOnly
            ? await ctx.db.query("entrances").withIndex("by_mailboxLocation", (q) => q.eq("mailboxLocation", "OUTSIDE")).paginate(args.paginationOpts)
            : await ctx.db.query("entrances").paginate(args.paginationOpts);
    const items = await Promise.all(page.page.map(async (entrance) => {
      const [street, rajon, electoralDivision, streetAssignment, rajonAssignment, completion] = await Promise.all([
        ctx.db.get(entrance.streetId),
        ctx.db.get(entrance.rajonId),
        ctx.db.get(entrance.electoralDivisionId),
        ctx.db.query("streetAssignments").withIndex("by_streetId_and_endedAt", (q) => q.eq("streetId", entrance.streetId).eq("endedAt", undefined)).first(),
        ctx.db.query("districtAssignments").withIndex("by_rajonId_and_endedAt", (q) => q.eq("rajonId", entrance.rajonId).eq("endedAt", undefined)).first(),
        ctx.db.query("completions").withIndex("by_entranceId_and_revertedAt", (q) => q.eq("entranceId", entrance._id).eq("revertedAt", undefined)).first(),
      ]);
      const assignment = streetAssignment ?? rajonAssignment;
      const [assignedPerson, completedPerson] = await Promise.all([
        assignment?.personId ? ctx.db.get(assignment.personId) : null,
        completion ? ctx.db.get(completion.personId) : null,
      ]);
      return {
        id: entrance._id,
        streetId: entrance.streetId,
        rajon: rajon?.name ?? "",
        street: street?.name ?? "",
        hasDirectStreetAssignment: Boolean(streetAssignment),
        number: entrance.number,
        mailboxes: entrance.mailboxCount,
        isEstimated: entrance.isEstimated === true,
        status: entrance.status === "LEFT_INSIDE" ? "TODO" as const : entrance.status,
        deliveryStatus: entrance.status,
        mailboxLocation: entrance.mailboxLocation,
        division: electoralDivision?.number ?? 0,
        isMine: Boolean(personId && assignment?.personId === personId),
        assignedPersonId: assignment?.personId,
        assignedPersonName: assignment?.personId ? assignedPerson?.displayName ?? "Neznáma osoba" : undefined,
        completedPersonId: completion?.personId,
        completedPersonName: completion ? completedPerson?.displayName ?? "Neznáma osoba" : undefined,
      };
    }));
    return { ...page, page: items };
  },
});
