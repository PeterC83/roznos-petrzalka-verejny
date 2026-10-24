import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";

export const prepare = internalQuery({
  args: { runId: v.id("dailyReports") },
  returns: v.union(v.null(), v.object({
    scheduledAt: v.number(),
    sentEmails: v.array(v.string()),
    admins: v.array(v.string()),
    entries: v.array(v.object({
      street: v.string(),
      number: v.string(),
      rajon: v.string(),
      division: v.number(),
      mailboxes: v.number(),
      person: v.string(),
    })),
  })),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run || run.status !== "PENDING") return null;
    const previous = await ctx.db.query("dailyReports")
      .withIndex("by_scheduledAt", (q) => q.lt("scheduledAt", run.scheduledAt))
      .order("desc")
      .filter((q) => q.neq(q.field("status"), "PENDING"))
      .first();
    const completions = await ctx.db.query("completions")
      .withIndex("by_completedAt", (q) => q.gt("completedAt", previous?.scheduledAt ?? run.cutoffAt ?? run.createdAt - 1).lte("completedAt", run.scheduledAt))
      .collect();
    const admins = (await ctx.db.query("allowedEmails").collect())
      .filter((entry) => entry.role === "ADMIN" && !entry.revokedAt)
      .map((entry) => entry.email);
    const entries = await Promise.all(completions.filter((completion) => !completion.revertedAt).map(async (completion) => {
      const entrance = await ctx.db.get(completion.entranceId);
      if (!entrance || entrance.status !== "DONE") return null;
      const [street, rajon, division, person] = await Promise.all([
        ctx.db.get(entrance.streetId),
        ctx.db.get(entrance.rajonId),
        ctx.db.get(entrance.electoralDivisionId),
        ctx.db.get(completion.personId),
      ]);
      return {
        street: street?.name ?? "",
        number: entrance.number,
        rajon: rajon?.name ?? "",
        division: division?.number ?? 0,
        mailboxes: completion.mailboxCountAtCompletion,
        person: person?.displayName ?? "Neznáma osoba",
      };
    }));
    return {
      scheduledAt: run.scheduledAt,
      sentEmails: run.sentEmails,
      admins,
      entries: entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .sort((a, b) => a.division - b.division || a.street.localeCompare(b.street, "sk") || a.number.localeCompare(b.number, "sk", { numeric: true })),
    };
  },
});

export const oldestPending = internalQuery({
  args: {},
  returns: v.union(v.null(), v.id("dailyReports")),
  handler: async (ctx) => {
    const run = await ctx.db.query("dailyReports")
      .withIndex("by_scheduledAt")
      .order("asc")
      .filter((q) => q.eq(q.field("status"), "PENDING"))
      .first();
    return run?._id ?? null;
  },
});

export const markRecipientSent = internalMutation({
  args: { runId: v.id("dailyReports"), email: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId, email }) => {
    const run = await ctx.db.get(runId);
    if (run && run.status === "PENDING" && !run.sentEmails.includes(email)) {
      await ctx.db.patch(runId, { sentEmails: [...run.sentEmails, email] });
    }
    return null;
  },
});

export const finish = internalMutation({
  args: { runId: v.id("dailyReports"), status: v.union(v.literal("SENT"), v.literal("SKIPPED")) },
  returns: v.null(),
  handler: async (ctx, { runId, status }) => {
    const run = await ctx.db.get(runId);
    if (run && run.status === "PENDING") await ctx.db.patch(runId, { status, finishedAt: Date.now() });
    return null;
  },
});

export const retry = internalMutation({
  args: { runId: v.id("dailyReports"), delayMs: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { runId, delayMs }) => {
    const run = await ctx.db.get(runId);
    if (run?.status === "PENDING") await ctx.scheduler.runAfter(delayMs ?? 5 * 60 * 1000, internal.dailyReport.send, { runId });
    return null;
  },
});

export const send = internalAction({
  args: { runId: v.id("dailyReports") },
  returns: v.null(),
  handler: async (ctx, { runId }): Promise<null> => {
    const oldest = await ctx.runQuery(internal.dailyReport.oldestPending, {});
    if (oldest !== runId) {
      if (oldest) await ctx.runMutation(internal.dailyReport.retry, { runId, delayMs: 70_000 });
      return null;
    }
    const report = await ctx.runQuery(internal.dailyReport.prepare, { runId });
    if (!report) return null;
    if (report.entries.length === 0) {
      await ctx.runMutation(internal.dailyReport.finish, { runId, status: "SKIPPED" });
      return null;
    }
    const endpoint = process.env.EMAIL_NOTIFICATION_ENDPOINT;
    const apiToken = process.env.MACALY_API_TOKEN;
    const chatId = process.env.MACALY_CHAT_ID;
    if (!endpoint || !apiToken || !chatId || report.admins.length === 0) {
      console.error("Daily report delivery is not configured or has no active admin recipient.");
      await ctx.runMutation(internal.dailyReport.retry, { runId });
      return null;
    }
    const date = new Intl.DateTimeFormat("sk-SK", { timeZone: "Europe/Bratislava", dateStyle: "long" }).format(report.scheduledAt);
    const totalBoxes = report.entries.reduce((total, entry) => total + entry.mailboxes, 0);
    // The email API rejects messages longer than 10,000 characters.
    const lines = report.entries.map((entry) =>
      `Obvod ${entry.division} · ${entry.street} ${entry.number} · ${entry.mailboxes} schránok · rozniesol/a: ${entry.person}`);
    const chunks: string[][] = [];
    let chunk: string[] = [];
    let size = 0;
    for (const line of lines) {
      if (chunk.length && size + line.length + 1 > 8_500) {
        chunks.push(chunk);
        chunk = [];
        size = 0;
      }
      chunk.push(line);
      size += line.length + 1;
    }
    if (chunk.length) chunks.push(chunk);
    const sent = new Set(report.sentEmails);
    let sentThisCall = 0;
    for (const email of report.admins) {
      if (sent.has(email)) continue;
      for (let index = 0; index < chunks.length; index++) {
        const marker = `${email}#${index + 1}/${chunks.length}`;
        if (sent.has(marker)) continue;
        const message = [
          `Roznos Petržalka – hotové vchody od posledného reportu (${date})`,
          `Vchodov: ${report.entries.length}, schránok: ${totalBoxes}`,
          `Časť ${index + 1} z ${chunks.length}`,
          "",
          ...chunks[index],
        ].join("\n");
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
            body: JSON.stringify({
              toEmail: email,
              subject: `Roznos Petržalka – denné hotové vchody (${date}) · ${index + 1}/${chunks.length}`,
              message,
              chatId,
              appName: "Roznos Petržalka",
              secretKey: process.env.SECRET_KEY ?? apiToken,
            }),
          });
          if (!response.ok) throw new Error(`Email endpoint returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
          await ctx.runMutation(internal.dailyReport.markRecipientSent, { runId, email: marker });
          sent.add(marker);
          sentThisCall++;
        } catch (error) {
          console.error("Daily report delivery failed:", error instanceof Error ? error.message : "Unknown error");
          await ctx.runMutation(internal.dailyReport.retry, { runId });
          return null;
        }
        // Leave room under the shared 10-emails-per-minute service limit.
        if (sentThisCall >= 7) {
          await ctx.runMutation(internal.dailyReport.retry, { runId, delayMs: 70_000 });
          return null;
        }
      }
      await ctx.runMutation(internal.dailyReport.markRecipientSent, { runId, email });
      sent.add(email);
    }
    await ctx.runMutation(internal.dailyReport.finish, { runId, status: "SENT" });
    return null;
  },
});
