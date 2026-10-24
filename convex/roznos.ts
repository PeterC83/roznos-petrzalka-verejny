import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Vyžaduje sa prihlásenie.");
    const user = await ctx.db.get(userId);
    const email = user?.email?.trim().toLowerCase();
    if (!email) throw new Error("Vyžaduje sa overený e-mail.");
    const allowed = await ctx.db.query("allowedEmails").withIndex("by_email", (q) => q.eq("email", email)).first();
    if (!allowed || allowed.revokedAt) throw new Error("Tento e-mail nemá povolený prístup.");
    const currentPersonId = allowed.personId ?? user?.personId;

    const [rajons, entrances, streets, divisions, people, assignments, streetAssignments, completions, mapLocations] = await Promise.all([
      ctx.db.query("rajons").collect(),
      ctx.db.query("entrances").collect(),
      ctx.db.query("streets").collect(),
      ctx.db.query("electoralDivisions").collect(),
      ctx.db.query("people").collect(),
      ctx.db.query("districtAssignments").collect(),
      ctx.db.query("streetAssignments").collect(),
      ctx.db.query("completions").collect(),
      ctx.db.query("documentStreetLocations").collect(),
    ]);
    const streetById = new Map(streets.map((street) => [street._id, street]));
    const rajonById = new Map(rajons.map((rajon) => [rajon._id, rajon]));
    const divisionById = new Map(divisions.map((division) => [division._id, division]));
    const personById = new Map(people.filter((person) => !person.archivedAt).map((person) => [person._id, person]));
    const assignmentByRajonId = new Map(assignments.filter((assignment) => !assignment.endedAt).map((assignment) => [assignment.rajonId, assignment]));
    const assignmentByStreetId = new Map(streetAssignments.filter((assignment) => !assignment.endedAt).map((assignment) => [assignment.streetId, assignment]));
    const completionByEntranceId = new Map(completions.filter((completion) => !completion.revertedAt).map((completion) => [completion.entranceId, completion]));
    const items = entrances.map((entrance) => {
      const streetAssignment = assignmentByStreetId.get(entrance.streetId);
      const assignment = streetAssignment ?? assignmentByRajonId.get(entrance.rajonId);
      const isMine = currentPersonId !== undefined && assignment?.personId === currentPersonId;
      const completion = completionByEntranceId.get(entrance._id);
      return {
        id: entrance._id,
        streetId: entrance.streetId,
        rajon: rajonById.get(entrance.rajonId)?.name ?? "",
        street: streetById.get(entrance.streetId)?.name ?? "",
        hasDirectStreetAssignment: Boolean(streetAssignment),
        number: entrance.number,
        mailboxes: entrance.mailboxCount,
        isEstimated: entrance.isEstimated === true,
        status: entrance.status,
        mailboxLocation: entrance.mailboxLocation,
        division: divisionById.get(entrance.electoralDivisionId)?.number ?? 0,
        isMine,
        assignedPersonId: assignment?.personId,
        assignedPersonName: assignment?.personId ? personById.get(assignment.personId)?.displayName ?? "Neznáma osoba" : undefined,
        completedPersonId: completion?.personId,
        completedPersonName: completion ? personById.get(completion.personId)?.displayName ?? "Neznáma osoba" : undefined,
      };
    }).sort((a, b) => a.rajon.localeCompare(b.rajon, "sk") || a.street.localeCompare(b.street, "sk") || a.number.localeCompare(b.number, "sk", { numeric: true }));
    return {
      stats: {
        rajons: rajons.length,
        entrances: items.length,
        mailboxes: items.reduce((sum, item) => sum + item.mailboxes, 0),
        done: items.filter((item) => item.status === "DONE").length,
      },
      people: people.filter((person) => !person.archivedAt).sort((a, b) => a.displayName.localeCompare(b.displayName, "sk")).map((person) => ({ id: person._id, displayName: person.displayName })),
      currentPersonId,
      currentPersonName: currentPersonId ? personById.get(currentPersonId)?.displayName : undefined,
      isAdmin: allowed.role === "ADMIN",
      rajons: [...new Set(items.map((item) => item.rajon))],
      mapLocations: mapLocations.map((location) => ({ division: location.division, street: location.street, latitude: location.latitude, longitude: location.longitude, missingEntrances: location.missingEntrances })),
      items,
    };
  },
});
