import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { overviewPersonId } from "../../lib/delivery-utils";
import { Select } from "./shared";
import { PrintOverviewTable } from "./print";

export function Overview() {
  const data = useQuery(api.roznos.dashboard, {});
  const unassignStreet = useMutation(api.management.unassignStreet);
  const setStatus = useMutation(api.management.setEntranceStatus);
  const [personId, setPersonId] = useState("ALL");
  const [sortBy, setSortBy] = useState<"assigned" | "doneBoxes" | "donePercent">("assigned");
  const [minAssigned, setMinAssigned] = useState("");
  const [maxAssigned, setMaxAssigned] = useState("");
  const [actionError, setActionError] = useState("");
  const [printRequested, setPrintRequested] = useState(false);
  useEffect(() => { if (!printRequested) return; const timer = window.setTimeout(() => { window.print(); setPrintRequested(false); }, 100); return () => window.clearTimeout(timer); }, [printRequested]);
  if (!data) return <section className="mx-auto max-w-4xl p-5">Načítavam prehľad…</section>;
  const workloads = data.people.map((person) => {
    const items = data.items.filter((item) => String(overviewPersonId(item) ?? "") === String(person.id));
    const doneItems = items.filter((item) => item.status === "DONE");
    const groupMap = new Map<string, { rajon: string; street: string; division: number; streetId: typeof data.items[number]["streetId"]; entrances: number; mailboxes: number; done: number; doneMailboxes: number; leftInside: number; canUnassign: boolean }>();
    for (const item of items) {
      const key = String(item.streetId);
      const group = groupMap.get(key) ?? { rajon: item.rajon, street: item.street, division: item.division, streetId: item.streetId, entrances: 0, mailboxes: 0, done: 0, doneMailboxes: 0, leftInside: 0, canUnassign: false };
      group.entrances += 1; group.mailboxes += item.mailboxes;
      if (String(item.assignedPersonId ?? "") === String(person.id)) group.canUnassign = true;
      if (item.status === "DONE") { group.done += 1; group.doneMailboxes += item.mailboxes; }
      if (item.status === "LEFT_INSIDE") group.leftInside += 1;
      groupMap.set(key, group);
    }
    return { person, items, doneItems, groups: [...groupMap.values()].sort((a, b) => a.rajon.localeCompare(b.rajon, "sk") || a.street.localeCompare(b.street, "sk")) };
  }).filter((workload) => {
    const assigned = workload.items.reduce((sum, item) => sum + item.mailboxes, 0);
    return (personId === "ALL" || String(workload.person.id) === personId) && (!minAssigned || assigned >= Number(minAssigned)) && (!maxAssigned || assigned <= Number(maxAssigned));
  }).sort((a, b) => {
    const totalA = a.items.reduce((sum, item) => sum + item.mailboxes, 0), totalB = b.items.reduce((sum, item) => sum + item.mailboxes, 0);
    const doneA = a.doneItems.reduce((sum, item) => sum + item.mailboxes, 0), doneB = b.doneItems.reduce((sum, item) => sum + item.mailboxes, 0);
    return sortBy === "doneBoxes" ? doneB - doneA || totalB - totalA : sortBy === "donePercent" ? doneB / Math.max(1, totalB) - doneA / Math.max(1, totalA) || doneB - doneA : totalB - totalA || doneB - doneA;
  });
  async function revertEntrance(item: NonNullable<typeof data>["items"][number]) {
    if (!window.confirm(`Vrátiť ${item.street} ${item.number} na čaká?`)) return;
    setActionError("");
    try {
      await setStatus({ entranceId: item.id, status: "TODO" });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Vchod sa nepodarilo vrátiť na čaká.");
    }
  }
  return <><section className="mx-auto max-w-4xl space-y-4 p-4 print:hidden">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Prehľad roznosu</h2><p className="mt-1 text-sm text-muted-foreground">Čakajúce schránky patria pridelenej osobe; hotové sa započítajú tomu, kto ich skutočne rozniesol.</p></div><button onClick={() => setPrintRequested(true)} className="rounded-xl border px-3 py-2 text-sm font-semibold">Tlačiť / uložiť PDF</button></div>
    <div className="grid gap-2 sm:grid-cols-4"><Select label="Používateľ" value={personId} onChange={setPersonId} options={["ALL", ...data.people.map((person) => String(person.id))]} optionLabel={(value) => value === "ALL" ? "Všetci používatelia" : data.people.find((person) => String(person.id) === value)?.displayName ?? value} /><Select label="Zoradiť podľa" value={sortBy} onChange={(value) => setSortBy(value as "assigned" | "doneBoxes" | "donePercent")} options={["assigned", "doneBoxes", "donePercent"]} optionLabel={(value) => value === "assigned" ? "Započítané schránky" : value === "doneBoxes" ? "Hotové schránky — počet" : "Hotové schránky — percento"} /><label className="text-sm font-medium">Započítané od<input value={minAssigned} onChange={(event) => setMinAssigned(event.target.value)} type="number" min="0" placeholder="0" className="mt-1 block w-full rounded-xl border bg-card px-3 py-2" /></label><label className="text-sm font-medium">Započítané do<input value={maxAssigned} onChange={(event) => setMaxAssigned(event.target.value)} type="number" min="0" placeholder="bez limitu" className="mt-1 block w-full rounded-xl border bg-card px-3 py-2" /></label></div>
    {actionError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{actionError}</p>}
    <div className="space-y-3">{workloads.map((workload) => {
      const total = workload.items.reduce((sum, item) => sum + item.mailboxes, 0), done = workload.doneItems.reduce((sum, item) => sum + item.mailboxes, 0);
      return <details key={workload.person.id} className="rounded-2xl border bg-card p-4"><summary className="cursor-pointer list-none"><div className="flex justify-between gap-3"><div><p className="font-semibold">{workload.person.displayName}</p><p className="mt-1 text-sm text-muted-foreground">Započítané: {workload.items.length} vchodov · {total.toLocaleString("sk-SK")} schránok</p></div><div className="text-right text-sm"><p className="font-semibold text-green-700">Skutočne roznesené</p><p>{done.toLocaleString("sk-SK")} schránok · {total ? Math.round(done / total * 100) + " %" : "—"}</p></div></div></summary>
        <div className="mt-4 border-t pt-3"><h3 className="text-sm font-semibold">Ulice v prehľade</h3>{workload.items.length ? <ul className="divide-y text-sm">{workload.groups.map((group) => <li key={String(group.streetId)} className="flex flex-wrap items-center justify-between gap-3 py-2"><span><strong>{group.rajon} · {group.street}</strong><br /><span className="text-xs text-muted-foreground">Obvod {group.division}</span></span><span className="text-right text-muted-foreground">Táto osoba roznesla {group.done}/{group.entrances} vchodov<br />{group.doneMailboxes.toLocaleString("sk-SK")}/{group.mailboxes.toLocaleString("sk-SK")} schránok{group.leftInside > 0 && <><br />{group.leftInside} nechané vo vnútri</>}</span>{data.isAdmin && group.canUnassign && <button onClick={() => { if (window.confirm("Odobrať priradenie tejto ulice?")) void unassignStreet({ streetId: group.streetId }); }} className="rounded-lg border border-destructive/40 px-2 py-1 text-xs font-semibold text-destructive">Odobrať ulicu</button>}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Zatiaľ nemá započítané žiadne vchody.</p>}</div>
        <div className="mt-4 border-t pt-3"><h3 className="text-sm font-semibold">Roznesené touto osobou</h3>{workload.doneItems.length ? <ul className="divide-y text-sm">{workload.doneItems.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><strong>{item.street} {item.number}</strong><br /><span className="text-xs text-muted-foreground">{item.rajon} · obvod {item.division}{item.assignedPersonName && item.assignedPersonId !== workload.person.id ? " · pridelené: " + item.assignedPersonName : ""}</span></span><span className="font-medium">{item.mailboxes.toLocaleString("sk-SK")} schránok</span>{data.isAdmin && <button onClick={() => void revertEntrance(item)} className="rounded-lg border border-destructive/40 px-2 py-1 text-xs font-semibold text-destructive">Vrátiť na čaká</button>}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Zatiaľ nič nerozniesol/a.</p>}</div>
      </details>;
    })}</div>
  </section>{printRequested && <PrintOverviewTable workloads={workloads} />}</>;
}

