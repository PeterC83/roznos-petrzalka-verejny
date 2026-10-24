import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

// This is the final address state, not the historical migrations. Never run on an existing campaign.
const SNAPSHOT = "sha256:222cdeb6321e5ba3213b9f07bd29dec4bd5e66d634c3062a694313b33bba65d6";

const division = v.object({ number: v.number(), label: v.string() });
const rajon = v.object({
  name: v.string(),
  sourceFile: v.string(),
  sourceChecksum: v.string(),
  active: v.boolean(),
});
const street = v.object({
  rajon: v.number(),
  name: v.string(),
  normalizedName: v.string(),
  originalName: v.string(),
});
const link = v.object({ rajon: v.number(), division: v.number() });
const location = v.object({
  division: v.number(),
  street: v.string(),
  latitude: v.number(),
  longitude: v.number(),
  missingEntrances: v.number(),
});
const entrance = v.object({
  rajon: v.number(),
  street: v.number(),
  division: v.number(),
  number: v.string(),
  originalNumber: v.string(),
  mailboxCount: v.number(),
  isEstimated: v.optional(v.boolean()),
  mailboxLocation: v.union(v.literal("UNKNOWN"), v.literal("OUTSIDE"), v.literal("INSIDE")),
  status: v.literal("TODO"),
  version: v.number(),
});

export const start = internalMutation({
  args: { checksum: v.string() },
  handler: async (ctx, args) => {
    if (args.checksum !== SNAPSHOT) throw new Error("Nesprávny adresný snapshot.");
    const imports = await ctx.db.query("imports").collect();
    const previous = imports.find((item) => item.sourceManifestChecksum === SNAPSHOT);
    if (previous) return previous._id;
    for (const table of ["electoralDivisions", "rajons", "streets", "districtDivisionLinks", "entrances", "documentStreetLocations"] as const) {
      if (await ctx.db.query(table).first()) throw new Error("Import je povolený iba do prázdnej adresnej databázy.");
    }
    if (imports.length) throw new Error("Cieľová databáza už obsahuje iný import.");
    return await ctx.db.insert("imports", {
      status: "IMPORTED",
      sourceManifestChecksum: SNAPSHOT,
      schemaVersion: "address-snapshot-v1",
      createdAt: Date.now(),
      reportJson: "{}",
    });
  },
});

export const bootstrap = internalMutation({
  args: {
    importId: v.id("imports"),
    checksum: v.string(),
    divisions: v.array(division),
    rajons: v.array(rajon),
    streets: v.array(street),
    links: v.array(link),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.importId);
    if (args.checksum !== SNAPSHOT || record?.sourceManifestChecksum !== SNAPSHOT) throw new Error("Nesprávny import.");
    const previous = JSON.parse(record.reportJson);
    if (previous.rajonIds) return previous;
    if (args.divisions.length !== 6 || args.rajons.length !== 38 || args.streets.length !== 157 || args.links.length !== 42) {
      throw new Error("Neúplná štruktúra adresného snapshotu.");
    }
    if (await ctx.db.query("rajons").first()) throw new Error("Rajóny už existujú.");
    const divisionIds: Record<number, Id<"electoralDivisions">> = {};
    for (const row of args.divisions) {
      if (!Number.isInteger(row.number) || divisionIds[row.number]) throw new Error("Neplatný obvod.");
      divisionIds[row.number] = await ctx.db.insert("electoralDivisions", row);
    }
    const rajonIds: Id<"rajons">[] = [];
    for (const row of args.rajons) {
      rajonIds.push(await ctx.db.insert("rajons", { ...row, importId: args.importId }));
    }
    const streetIds: Id<"streets">[] = [];
    for (const row of args.streets) {
      const rajonId = rajonIds[row.rajon];
      if (!rajonId) throw new Error("Neplatný rajón ulice.");
      streetIds.push(await ctx.db.insert("streets", {
        rajonId,
        name: row.name,
        normalizedName: row.normalizedName,
        originalName: row.originalName,
      }));
    }
    for (const row of args.links) {
      const rajonId = rajonIds[row.rajon];
      const electoralDivisionId = divisionIds[row.division];
      if (!rajonId || !electoralDivisionId) throw new Error("Neplatné prepojenie rajónu a obvodu.");
      await ctx.db.insert("districtDivisionLinks", { rajonId, electoralDivisionId });
    }
    const ids = { divisionIds, rajonIds, streetIds };
    await ctx.db.patch(args.importId, { reportJson: JSON.stringify(ids) });
    return ids;
  },
});

export const addLocations = internalMutation({
  args: { importId: v.id("imports"), checksum: v.string(), rows: v.array(location) },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.importId);
    if (args.checksum !== SNAPSHOT || record?.sourceManifestChecksum !== SNAPSHOT) throw new Error("Nesprávny import.");
    if (args.rows.length !== 97) throw new Error("Neúplné polohy ulíc.");
    const previous = await ctx.db.query("documentStreetLocations").collect();
    if (previous.length) {
      if (previous.length !== args.rows.length || previous.some((old) =>
        !args.rows.some((row) => row.division === old.division && row.street === old.street &&
          row.latitude === old.latitude && row.longitude === old.longitude &&
          row.missingEntrances === old.missingEntrances))) {
        throw new Error("Existujúce polohy sa líšia od snapshotu.");
      }
      return previous.length;
    }
    for (const row of args.rows) await ctx.db.insert("documentStreetLocations", row);
    return args.rows.length;
  },
});

export const addEntrances = internalMutation({
  args: { importId: v.id("imports"), checksum: v.string(), rows: v.array(entrance) },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.importId);
    if (args.checksum !== SNAPSHOT || record?.sourceManifestChecksum !== SNAPSHOT) throw new Error("Nesprávny import.");
    if (args.rows.length < 1 || args.rows.length > 50) throw new Error("Dávka musí mať 1 až 50 vchodov.");
    const { divisionIds, rajonIds, streetIds } = JSON.parse(record.reportJson) as {
      divisionIds: Record<number, Id<"electoralDivisions">>;
      rajonIds: Id<"rajons">[];
      streetIds: Id<"streets">[];
    };
    if (!rajonIds || !streetIds || !divisionIds) throw new Error("Najprv vytvorte rajóny a ulice.");
    let inserted = 0;
    for (const row of args.rows) {
      const rajonId = rajonIds[row.rajon];
      const streetId = streetIds[row.street];
      const electoralDivisionId = divisionIds[row.division];
      if (!rajonId || !streetId || !electoralDivisionId) throw new Error("Neplatný odkaz na adresu.");
      const streetRecord = await ctx.db.get(streetId);
      if (streetRecord?.rajonId !== rajonId) throw new Error("Ulica nepatrí do rajónu.");
      if (!Number.isInteger(row.mailboxCount) || row.mailboxCount < 1 || !Number.isInteger(row.version) || row.version < 1) {
        throw new Error("Neplatný počet schránok alebo verzia.");
      }
      const candidates = await ctx.db.query("entrances")
        .withIndex("by_rajonId_and_number", (q) => q.eq("rajonId", rajonId).eq("number", row.number))
        .collect();
      const matches = candidates.filter((item) => item.streetId === streetId);
      if (matches.length > 1) throw new Error("Duplicitný vchod v cieľovej databáze.");
      const old = matches[0];
      if (old) {
        if (old.electoralDivisionId !== electoralDivisionId || old.originalNumber !== row.originalNumber ||
          old.mailboxCount !== row.mailboxCount || old.isEstimated !== row.isEstimated ||
          old.mailboxLocation !== row.mailboxLocation || old.status !== row.status || old.version !== row.version) {
          throw new Error("Existujúci vchod sa líši od snapshotu.");
        }
        continue;
      }
      await ctx.db.insert("entrances", {
        rajonId, streetId, electoralDivisionId,
        number: row.number,
        originalNumber: row.originalNumber,
        mailboxCount: row.mailboxCount,
        isEstimated: row.isEstimated,
        mailboxLocation: row.mailboxLocation,
        status: row.status,
        importId: args.importId,
        version: row.version,
      });
      inserted++;
    }
    return inserted;
  },
});

export const verify = internalQuery({
  args: { checksum: v.string() },
  handler: async (ctx, args) => {
    if (args.checksum !== SNAPSHOT) throw new Error("Nesprávny snapshot.");
    const [divisions, rajons, links, streets, entrances, locations] = await Promise.all([
      ctx.db.query("electoralDivisions").collect(),
      ctx.db.query("rajons").collect(),
      ctx.db.query("districtDivisionLinks").collect(),
      ctx.db.query("streets").collect(),
      ctx.db.query("entrances").collect(),
      ctx.db.query("documentStreetLocations").collect(),
    ]);
    const mailboxCount = entrances.reduce((sum, row) => sum + row.mailboxCount, 0);
    const outside = entrances.filter((row) => row.mailboxLocation === "OUTSIDE").length;
    const valid = divisions.length === 6 && rajons.length === 38 && links.length === 42 &&
      streets.length === 157 && entrances.length === 1737 && locations.length === 97 &&
      mailboxCount === 54245 && outside === 37 && entrances.every((row) => row.status === "TODO");
    return { valid, divisions: divisions.length, rajons: rajons.length, streets: streets.length,
      entrances: entrances.length, mailboxCount, outside };
  },
});
