import { describe, expect, it } from "vitest";
import { creditedPersonId, overviewPersonId, parseMailboxCount } from "../../src/lib/delivery-utils";

describe("skutočný počet schránok", () => {
  it("prijme bežný počet zo vstupu", () => {
    expect(parseMailboxCount("15")).toBe(15);
    expect(parseMailboxCount("10000")).toBe(10000);
  });
  it("neprijme neplatný počet", () => {
    expect(() => parseMailboxCount("0")).toThrow();
    expect(() => parseMailboxCount("15.5")).toThrow();
    expect(() => parseMailboxCount("abc")).toThrow();
    expect(() => parseMailboxCount("10001")).toThrow();
  });
});

describe("pripísanie hotového roznosu", () => {
  it("pripíše hotové schránky osobe, ktorá ich rozniosla, nie pridelenej osobe", () => {
    expect(creditedPersonId({ status: "DONE", assignedPersonId: "pridelena", completedPersonId: "skutocna" })).toBe("skutocna");
  });
  it("nezapočíta čakajúci vchod ako hotový", () => {
    expect(creditedPersonId({ status: "TODO", assignedPersonId: "pridelena" })).toBeUndefined();
  });
  it("presunie hotový vchod v prehľade od pridelenej osoby k skutočnému roznášačovi", () => {
    const item = { status: "DONE", assignedPersonId: "pridelena", completedPersonId: "skutocna" };
    expect(overviewPersonId(item)).toBe("skutocna");
    expect(overviewPersonId(item)).not.toBe("pridelena");
    expect(overviewPersonId({ ...item, status: "TODO" })).toBe("pridelena");
  });
});
