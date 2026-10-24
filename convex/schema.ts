import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import { authTables } from "@convex-dev/auth/server"

const role = v.union(v.literal("ADMIN"), v.literal("USER"))
const entranceStatus = v.union(v.literal("TODO"), v.literal("DONE"), v.literal("LEFT_INSIDE"))
const mailboxLocation = v.union(
  v.literal("UNKNOWN"),
  v.literal("OUTSIDE"),
  v.literal("INSIDE"),
)

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(role),
    personId: v.optional(v.id("people")),
    createdAt: v.optional(v.number()),
    disabledAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("by_personId", ["personId"]),

  allowedEmails: defineTable({
    email: v.string(),
    displayName: v.optional(v.string()),
    personId: v.optional(v.id("people")),
    role,
    invitedAt: v.number(),
    invitedByUserId: v.optional(v.id("users")),
    revokedAt: v.optional(v.number()),
  }).index("by_email", ["email"]).index("by_personId", ["personId"]),

  people: defineTable({
    displayName: v.string(),
    normalizedName: v.string(),
    mergedIntoPersonId: v.optional(v.id("people")),
    createdAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_normalizedName", ["normalizedName"])
    .index("by_mergedIntoPersonId", ["mergedIntoPersonId"]),

  electoralDivisions: defineTable({
    number: v.number(),
    label: v.string(),
  }).index("by_number", ["number"]),

  rajons: defineTable({
    name: v.string(),
    sourceFile: v.string(),
    sourceChecksum: v.string(),
    importId: v.id("imports"),
    active: v.boolean(),
  })
    .index("by_importId", ["importId"])
    .index("by_name", ["name"]),

  districtDivisionLinks: defineTable({
    rajonId: v.id("rajons"),
    electoralDivisionId: v.id("electoralDivisions"),
  })
    .index("by_rajonId", ["rajonId"])
    .index("by_electoralDivisionId", ["electoralDivisionId"])
    .index("by_rajonId_and_electoralDivisionId", ["rajonId", "electoralDivisionId"]),

  streets: defineTable({
    rajonId: v.id("rajons"),
    name: v.string(),
    normalizedName: v.string(),
    originalName: v.string(),
  })
    .index("by_rajonId", ["rajonId"])
    .index("by_normalizedName", ["normalizedName"])
    .index("by_rajonId_and_normalizedName", ["rajonId", "normalizedName"]),

  entrances: defineTable({
    rajonId: v.id("rajons"),
    streetId: v.id("streets"),
    electoralDivisionId: v.id("electoralDivisions"),
    number: v.string(),
    originalNumber: v.string(),
    mailboxCount: v.number(),
    isEstimated: v.optional(v.boolean()),
    status: entranceStatus,
    mailboxLocation,
    importId: v.id("imports"),
    version: v.number(),
  })
    .index("by_rajonId", ["rajonId"])
    .index("by_streetId", ["streetId"])
    .index("by_electoralDivisionId", ["electoralDivisionId"])
    .index("by_status", ["status"])
    .index("by_mailboxLocation", ["mailboxLocation"])
    .index("by_rajonId_and_number", ["rajonId", "number"]),

  documentStreetLocations: defineTable({
    division: v.number(),
    street: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    missingEntrances: v.number(),
  }).index("by_division", ["division"]),

  districtAssignments: defineTable({
    rajonId: v.id("rajons"),
    personId: v.id("people"),
    assignedAt: v.number(),
    assignedByUserId: v.id("users"),
    endedAt: v.optional(v.number()),
  })
    .index("by_rajonId", ["rajonId"])
    .index("by_personId", ["personId"])
    .index("by_rajonId_and_endedAt", ["rajonId", "endedAt"]),

  streetAssignments: defineTable({
    streetId: v.id("streets"),
    personId: v.optional(v.id("people")),
    isUnassigned: v.optional(v.boolean()),
    assignedAt: v.number(),
    assignedByUserId: v.id("users"),
    endedAt: v.optional(v.number()),
  })
    .index("by_streetId", ["streetId"])
    .index("by_personId", ["personId"])
    .index("by_streetId_and_endedAt", ["streetId", "endedAt"]),

  completions: defineTable({
    entranceId: v.id("entrances"),
    personId: v.id("people"),
    recordedByUserId: v.id("users"),
    mailboxCountAtCompletion: v.number(),
    mailboxLocation,
    note: v.optional(v.string()),
    completedAt: v.number(),
    revertedAt: v.optional(v.number()),
    revertedByUserId: v.optional(v.id("users")),
  })
    .index("by_entranceId", ["entranceId"])
    .index("by_personId", ["personId"])
    .index("by_completedAt", ["completedAt"])
    .index("by_entranceId_and_revertedAt", ["entranceId", "revertedAt"]),

  dailyReports: defineTable({
    scheduledAt: v.number(),
    createdAt: v.number(),
    cutoffAt: v.optional(v.number()),
    status: v.union(v.literal("PENDING"), v.literal("SENT"), v.literal("SKIPPED")),
    sentEmails: v.array(v.string()),
    finishedAt: v.optional(v.number()),
  }).index("by_scheduledAt", ["scheduledAt"]),

  auditLog: defineTable({
    actorUserId: v.optional(v.id("users")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    before: v.optional(v.string()),
    after: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_entityType_and_entityId", ["entityType", "entityId"])
    .index("by_actorUserId", ["actorUserId"])
    .index("by_createdAt", ["createdAt"]),

  imports: defineTable({
    status: v.union(v.literal("DRAFT"), v.literal("VALIDATED"), v.literal("IMPORTED"), v.literal("FAILED")),
    sourceManifestChecksum: v.string(),
    schemaVersion: v.string(),
    createdAt: v.number(),
    createdByUserId: v.optional(v.id("users")),
    reportJson: v.string(),
  }).index("by_status", ["status"]),

  importIssues: defineTable({
    importId: v.id("imports"),
    severity: v.union(v.literal("INFO"), v.literal("WARNING"), v.literal("ERROR")),
    code: v.string(),
    sourceFile: v.optional(v.string()),
    sourceRow: v.optional(v.number()),
    details: v.string(),
    resolvedAt: v.optional(v.number()),
    resolvedByUserId: v.optional(v.id("users")),
  })
    .index("by_importId", ["importId"])
    .index("by_importId_and_severity", ["importId", "severity"]),
})