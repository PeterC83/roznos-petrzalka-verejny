import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = resolve(root, "data/current-addresses-2026-10-24.json");
const raw = readFileSync(file);
const hash = createHash("sha256").update(raw).digest("hex");
const expected = "222cdeb6321e5ba3213b9f07bd29dec4bd5e66d634c3062a694313b33bba65d6";
assert.equal(hash, expected, "Súbor s adresami bol zmenený; overte jeho obsah.");
const data = JSON.parse(raw.toString("utf8"));
assert.equal(data.format, "roznos-address-snapshot-v1");
assert.equal(data.divisions.length, 6);
assert.equal(data.rajons.length, 38);
assert.equal(data.streets.length, 157);
assert.equal(data.districtDivisionLinks.length, 42);
assert.equal(data.entrances.length, 1737);
assert.equal(data.documentStreetLocations.length, 97);
assert.equal(data.entrances.reduce((sum, row) => sum + row.mailboxCount, 0), 54245);
assert.equal(data.entrances.filter((row) => row.mailboxLocation === "OUTSIDE").length, 37);
assert.ok(data.entrances.every((row) => row.status === "TODO"));
assert.ok(data.entrances.every((row) => data.streets[row.street]?.rajon === row.rajon));
const addresses = new Set(data.entrances.map((row) => [row.rajon, row.street, row.number].join("|")));
assert.equal(addresses.size, data.entrances.length, "Snapshot obsahuje duplicitný vchod.");

const checksum = "sha256:" + hash;
const cli = resolve(root, "node_modules/convex/bin/main.js");
function run(name, args) {
  const output = execFileSync(process.execPath, [cli, "run", "addressSnapshot:" + name, JSON.stringify(args)], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["inherit", "pipe", "inherit"],
  });
  return JSON.parse(output.trim());
}

console.log("Importujem len adresy do prázdnej databázy Convex; účty ani roznosy sa nevytvárajú.");
const importId = run("start", { checksum });
run("bootstrap", {
  importId, checksum,
  divisions: data.divisions,
  rajons: data.rajons,
  streets: data.streets,
  links: data.districtDivisionLinks,
});
run("addLocations", { importId, checksum, rows: data.documentStreetLocations });
let added = 0;
for (let offset = 0; offset < data.entrances.length; offset += 50) {
  added += run("addEntrances", { importId, checksum, rows: data.entrances.slice(offset, offset + 50) });
  console.log("Vchody: " + Math.min(offset + 50, data.entrances.length) + "/" + data.entrances.length);
}
const result = run("verify", { checksum });
assert.equal(result.valid, true, "Výsledná databáza nesúhlasí so snapshotom: " + JSON.stringify(result));
console.log("Hotovo: " + result.entrances + " vchodov, " + result.mailboxCount + " schránok; nových v tomto spustení " + added + ".");
