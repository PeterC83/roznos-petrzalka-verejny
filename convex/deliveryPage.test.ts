import { expect, it } from "vitest";
import { summarizeEntrances } from "./deliveryPage";
import { matchesDeliveryStatus } from "../src/lib/delivery-utils";

it("includes left-inside entrances among undelivered", () => {
  expect(matchesDeliveryStatus("TODO", "UNDONE")).toBe(true);
  expect(matchesDeliveryStatus("LEFT_INSIDE", "UNDONE")).toBe(true);
  expect(matchesDeliveryStatus("DONE", "UNDONE")).toBe(false);
  expect(matchesDeliveryStatus("LEFT_INSIDE", "LEFT_INSIDE")).toBe(true);
});

it("counts all entrances, mailboxes and only completed mailboxes", () => {
  expect(summarizeEntrances([
    { mailboxCount: 24, status: "TODO" },
    { mailboxCount: 16, status: "DONE" },
    { mailboxCount: 12, status: "LEFT_INSIDE" },
  ])).toEqual({ entrances: 3, mailboxes: 52, doneMailboxes: 16 });
});
