import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { matchesDeliveryStatus, parseMailboxCount } from "../../lib/delivery-utils";
import { Metric, Select, normalizeSearch, shown } from "./shared";
import { PrintStreetTable } from "./print";

export function Delivery({ scope }: { scope: "mine" | "all" }) {
  const [rajon, setRajon] = useState("Všetky rajóny");
  const [division, setDivision] = useState("Všetky obvody");
  const [status, setStatusFilter] = useState("Všetky");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchPages, setSearchPages] = useState(1);
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "mine" | "assigned" | "unassigned">("all");
  const [outsideOnly, setOutsideOnly] = useState(false);
  const activeSearch = debouncedSearch.length >= 3;
  const needsDashboard = scope === "mine" || activeSearch || assignmentFilter !== "all";
  const data = useQuery(api.roznos.dashboard, needsDashboard ? {} : "skip");
  const options = useQuery(api.deliveryPage.options, scope === "all" ? {} : "skip");
  const selectedRajonId = options?.rajons.find((item) => item.name === rajon)?.id;
  const allWithoutFilters = scope === "all" && rajon === "Všetky rajóny" && division === "Všetky obvody" && status === "Všetky" && !activeSearch && assignmentFilter === "all" && !outsideOnly;
  const totals = useQuery(api.deliveryPage.totals, allWithoutFilters ? {} : "skip");
  const paged = usePaginatedQuery(api.deliveryPage.entrances,
    scope === "all" && !needsDashboard && options ? {
      ...(selectedRajonId ? { rajonId: selectedRajonId } : {}),
      ...(division !== "Všetky obvody" ? { division: Number(division) } : {}),
      ...(status !== "Všetky" ? { status: status as "UNDONE" | "DONE" | "LEFT_INSIDE" } : {}),
      ...(outsideOnly ? { outsideOnly: true } : {}),
    } : "skip", { initialNumItems: 25 });
  useEffect(() => { const timer = window.setTimeout(() => { const value = search.trim(); setDebouncedSearch(value.length >= 3 ? value : ""); }, 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => setSearchPages(1), [search, rajon, division, status, assignmentFilter, outsideOnly]);
  const setStatus = useMutation(api.management.setEntranceStatus);
  const setMailboxCount = useMutation(api.management.setEntranceMailboxCount);
  const [selectedPeople, setSelectedPeople] = useState<Record<string, string>>({});
  const [actualCounts, setActualCounts] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [printRequested, setPrintRequested] = useState(false);
  useEffect(() => { if (!printRequested) return; const timer = window.setTimeout(() => { window.print(); setPrintRequested(false); }, 100); return () => window.clearTimeout(timer); }, [printRequested]);

  const scopedItems = useMemo(() => {
    if (scope === "mine") return (data?.items ?? []).filter((item) => item.isMine);
    return needsDashboard ? (data?.items ?? []) : paged.results.map((item) => ({ ...item, status: item.deliveryStatus }));
  }, [data, scope, needsDashboard, paged.results]);
  const byDivision = useMemo(() => scopedItems.filter((item) => division === "Všetky obvody" || item.division === Number(division)), [scopedItems, division]);
  const availableRajons = useMemo(() => scope === "all"
    ? (options?.rajons.filter((item) => division === "Všetky obvody" || item.divisions.includes(Number(division))).map((item) => item.name) ?? [])
    : [...new Set(byDivision.map((item) => item.rajon))].sort(), [scope, options, division, byDivision]);
  useEffect(() => { if (rajon !== "Všetky rajóny" && !availableRajons.includes(rajon)) setRajon("Všetky rajóny"); }, [rajon, availableRajons]);
  const inRajon = useMemo(() => byDivision.filter((item) => rajon === "Všetky rajóny" || item.rajon === rajon), [byDivision, rajon]);
  const divisions = useMemo(() => scope === "all"
    ? (rajon === "Všetky rajóny" ? options?.divisions ?? [] : options?.rajons.find((item) => item.name === rajon)?.divisions ?? [])
    : [...new Set(scopedItems.filter((item) => rajon === "Všetky rajóny" || item.rajon === rajon).map((item) => item.division))].sort(), [scope, options, scopedItems, rajon]);
  useEffect(() => { if (division !== "Všetky obvody" && !divisions.includes(Number(division))) setDivision("Všetky obvody"); }, [division, divisions]);
  const items = useMemo(() => {
    const phrase = normalizeSearch(debouncedSearch);
    return inRajon.filter((item) => {
      if (!matchesDeliveryStatus(item.status, status)) return false;
      if (outsideOnly && item.mailboxLocation !== "OUTSIDE") return false;
      if (assignmentFilter === "mine" && !item.isMine) return false;
      if (assignmentFilter === "assigned" && (!item.assignedPersonName || item.isMine)) return false;
      if (assignmentFilter === "unassigned" && item.assignedPersonName) return false;
      return !phrase || normalizeSearch(`${item.street} ${item.number} ${item.rajon} obvod ${item.division}`).includes(phrase);
    });
  }, [inRajon, status, debouncedSearch, outsideOnly, assignmentFilter]);
  const visibleItems = scope === "all" && needsDashboard ? items.slice(0, searchPages * 25) : items;

  if (scope === "mine" ? !data : !options) return <section className="mx-auto max-w-4xl p-5">Načítavam vchody…</section>;
  const doneBoxes = visibleItems.filter((item) => item.status === "DONE").reduce((sum, item) => sum + item.mailboxes, 0);
  const personFor = (item: typeof items[number]) => selectedPeople[String(item.id)] ?? String(item.completedPersonId ?? item.assignedPersonId ?? "");
  async function saveStatus(item: typeof items[number], nextStatus: "TODO" | "DONE" | "LEFT_INSIDE") {
    setActionError("");
    setActionNotice("");
    try {
      const personId = personFor(item);
      const enteredCount = actualCounts[String(item.id)]?.trim() ?? "";
      const mailboxCount = parseMailboxCount(enteredCount);
      await setStatus({
        entranceId: item.id,
        status: nextStatus,
        ...(nextStatus === "DONE" && personId ? { personId: personId as any } : {}),
        ...(mailboxCount !== undefined ? { mailboxCount } : {}),
      });
      if (mailboxCount !== undefined) setActualCounts((current) => { const next = { ...current }; delete next[String(item.id)]; return next; });
      setActionNotice(nextStatus === "DONE" ? "Vchod bol označený ako roznesený." : nextStatus === "LEFT_INSIDE" ? "Vchod je označený ako nechaný vo vnútri." : "Vchod je znovu označený ako čakajúci.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Zmenu sa nepodarilo uložiť.");
    }
  }
  async function saveCount(item: typeof items[number]) {
    setActionError("");
    setActionNotice("");
    try {
      const mailboxCount = parseMailboxCount(actualCounts[String(item.id)]?.trim() ?? "");
      if (mailboxCount === undefined) throw new Error("Zadajte skutočný počet schránok.");
      await setMailboxCount({ entranceId: item.id, mailboxCount });
      setActualCounts((current) => { const next = { ...current }; delete next[String(item.id)]; return next; });
      setActionNotice(`Počet schránok pre ${item.street} ${item.number} bol uložený.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Počet schránok sa nepodarilo uložiť.");
    }
  }

  return <><section className="mx-auto max-w-4xl space-y-4 p-4 print:hidden">
    <div className={"rounded-2xl border p-4 " + (scope === "mine" ? "border-sky-500/40 bg-sky-500/10" : "border-primary/25 bg-card")}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{scope === "mine" ? "Moje pridelené" : "Všetky vchody"}</p><p className="mt-1 text-sm text-muted-foreground">{scope === "mine" ? (data?.currentPersonName ?? "Váš roznos") : "Kompletný zoznam pre všetkých používateľov"}</p></div>{scope === "mine" && <button onClick={() => setPrintRequested(true)} className="rounded-xl border px-3 py-2 text-sm font-semibold">Tlačiť / uložiť PDF</button>}</div></div>
    <div className="grid grid-cols-3 gap-2"><Metric label={allWithoutFilters ? "Vchody spolu" : scope === "all" ? "Načítané vchody" : "Vchody"} value={allWithoutFilters ? (totals?.entrances.toLocaleString("sk-SK") ?? "…") : String(visibleItems.length)} /><Metric label={allWithoutFilters ? "Schránky spolu" : scope === "all" ? "Načítané schránky" : "Schránky"} value={allWithoutFilters ? (totals?.mailboxes.toLocaleString("sk-SK") ?? "…") : shown(visibleItems)} /><Metric label={allWithoutFilters ? "Hotové schránky spolu" : scope === "all" ? "Hotové na stránke" : "Hotové"} value={allWithoutFilters ? (totals?.doneMailboxes.toLocaleString("sk-SK") ?? "…") : String(doneBoxes)} /></div>
    {scope === "all" && <div className="flex flex-wrap gap-2 text-xs" aria-label="Rýchle filtre vchodov">
      <button type="button" aria-pressed={assignmentFilter === "mine"} onClick={() => setAssignmentFilter(assignmentFilter === "mine" ? "all" : "mine")} className={"rounded-full bg-sky-500/15 px-3 py-1 text-sky-700 " + (assignmentFilter === "mine" ? "ring-2 ring-primary" : "")}>Moje</button>
      <button type="button" aria-pressed={assignmentFilter === "assigned"} onClick={() => setAssignmentFilter(assignmentFilter === "assigned" ? "all" : "assigned")} className={"rounded-full bg-green-500/15 px-3 py-1 text-green-700 " + (assignmentFilter === "assigned" ? "ring-2 ring-primary" : "")}>Pridelené</button>
      <button type="button" aria-pressed={assignmentFilter === "unassigned"} onClick={() => setAssignmentFilter(assignmentFilter === "unassigned" ? "all" : "unassigned")} className={"rounded-full bg-amber-500/15 px-3 py-1 text-amber-700 " + (assignmentFilter === "unassigned" ? "ring-2 ring-primary" : "")}>Nepridelené</button>
      <button type="button" aria-pressed={status === "DONE"} onClick={() => setStatusFilter(status === "DONE" ? "Všetky" : "DONE")} className={"rounded-full bg-violet-500/15 px-3 py-1 text-violet-700 dark:text-violet-300 " + (status === "DONE" ? "ring-2 ring-primary" : "")}>Roznesené</button>
      <button type="button" aria-pressed={status === "LEFT_INSIDE"} onClick={() => setStatusFilter(status === "LEFT_INSIDE" ? "Všetky" : "LEFT_INSIDE")} className={"rounded-full border border-primary/30 bg-primary/10 px-3 py-1 " + (status === "LEFT_INSIDE" ? "ring-2 ring-primary" : "")}>Nechané vo vnútri</button>
      <button type="button" aria-pressed={outsideOnly} onClick={() => setOutsideOnly(!outsideOnly)} className={"rounded-full border border-primary/30 bg-primary/10 px-3 py-1 " + (outsideOnly ? "ring-2 ring-primary" : "")}>Vonku</button>
    </div>}
    <div className="grid gap-2 sm:grid-cols-3">
      <Select label="Rajón" value={rajon} onChange={setRajon} options={["Všetky rajóny", ...availableRajons]} />
      <Select label="Volebný obvod" value={division} onChange={setDivision} options={["Všetky obvody", ...divisions.map(String)]} optionLabel={(value) => value === "Všetky obvody" ? value : "Obvod " + value} />
      <Select label="Stav" value={status} onChange={setStatusFilter} options={["Všetky", "UNDONE", "DONE", "LEFT_INSIDE"]} optionLabel={(value) => value === "UNDONE" ? "Neroznesené (aj vo vnútri)" : value === "DONE" ? "Roznesené" : value === "LEFT_INSIDE" ? "Nechané vo vnútri" : value} />
    </div>
    <label className="block text-sm font-medium">Hľadať vchody<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ulica, číslo vchodu, rajón alebo obvod" className="mt-1 block w-full rounded-xl border bg-card px-3 py-2" /><span className="mt-1 block text-xs text-muted-foreground">Vyhľadávanie sa spustí po zadaní aspoň 3 znakov.</span></label>
    {actionError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{actionError}</p>}{actionNotice && <p role="status" className="rounded-xl border border-green-600/30 bg-green-600/10 p-3 text-sm text-green-700">{actionNotice}</p>}
    <div className="overflow-hidden rounded-2xl border bg-card"><div className="border-b px-4 py-3 text-sm font-semibold">Vchody ({visibleItems.length}{scope === "all" && !needsDashboard && paged.status === "CanLoadMore" ? "+" : ""})</div>{scope === "all" && (needsDashboard ? !data : paged.status === "LoadingFirstPage") && <p className="p-4 text-sm text-muted-foreground">Načítavam výsledky…</p>}<ul className="divide-y">{visibleItems.map((item) => {
      const personId = personFor(item);
      const color = item.status === "DONE" ? "border-l-4 border-violet-500 bg-violet-500/10" : item.status === "LEFT_INSIDE" ? "border-l-4 border-primary bg-primary/10" : item.isMine ? "border-l-4 border-sky-500 bg-sky-500/5" : item.assignedPersonName ? "border-l-4 border-green-500 bg-green-500/5" : "border-l-4 border-amber-500 bg-amber-500/5";
      const badge = item.status === "DONE" ? "Roznesené" : item.status === "LEFT_INSIDE" ? "Nechané vo vnútri" : item.isMine ? "Moje" : item.assignedPersonName ? "Pridelené" : "Nepridelené";
      return <li key={item.id} className={"space-y-2 px-4 py-3 " + color}><div><div className="flex items-center justify-between gap-3"><p className="font-medium">{item.street} {item.number}</p><span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold">{badge}</span></div><p className="text-xs text-muted-foreground">{item.rajon} · obvod {item.division} · {item.mailboxes} schránok{item.isEstimated && <span className="ml-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-700">odhad</span>}{item.mailboxLocation === "OUTSIDE" && <span className="ml-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-semibold text-foreground">vonku</span>}</p><p className="mt-1 text-xs"><span className="text-muted-foreground">Pridelené: </span><strong>{item.assignedPersonName ?? "nepridelené"}</strong>{item.completedPersonName && <><span className="text-muted-foreground"> · Rozniesol/a: </span><strong>{item.completedPersonName}</strong></>}</p></div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end"><label className="block flex-1 text-xs font-medium">Skutočný počet schránok<input aria-label={"Skutočný počet schránok pre " + item.street + " " + item.number} value={actualCounts[String(item.id)] ?? ""} onChange={(event) => setActualCounts((current) => ({ ...current, [String(item.id)]: event.target.value }))} type="number" min="1" max="10000" step="1" inputMode="numeric" placeholder={"Teraz " + item.mailboxes + (item.isEstimated ? " (odhad)" : "")} className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm" /></label><button type="button" onClick={() => void saveCount(item)} disabled={!actualCounts[String(item.id)]?.trim()} className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50">Zmeniť počet schránok</button></div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"><select aria-label={"Osoba, ktorá rozniosla " + item.street + " " + item.number} value={personId} onChange={(event) => setSelectedPeople((current) => ({ ...current, [String(item.id)]: event.target.value }))} className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 text-sm"><option value="">Vyberte osobu, ktorá rozniosla</option>{(data?.people ?? options?.people ?? []).map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select>{item.status === "DONE" ? <button type="button" onClick={() => void saveStatus(item, "DONE")} disabled={!personId} className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50">Uložiť roznášača</button> : <button type="button" onClick={() => void saveStatus(item, "DONE")} disabled={!personId} className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Označiť ako roznesené</button>}{item.status !== "LEFT_INSIDE" && <button type="button" onClick={() => void saveStatus(item, "LEFT_INSIDE")} className="rounded-xl border px-3 py-2 text-sm font-semibold">Nechané vo vnútri</button>}{(data?.isAdmin ?? options?.isAdmin) && item.status !== "TODO" && <button type="button" onClick={() => { if (window.confirm(`Vrátiť ${item.street} ${item.number} na čaká?`)) void saveStatus(item, "TODO"); }} className="rounded-xl border border-destructive/40 px-3 py-2 text-sm font-semibold text-destructive">Vrátiť na čaká</button>}</div></li>;
    })}</ul></div>
    {scope === "all" && !needsDashboard && paged.status === "CanLoadMore" && <button type="button" onClick={() => paged.loadMore(25)} className="w-full rounded-xl border bg-card px-4 py-3 font-semibold">Načítať ďalších 25 vchodov</button>}
    {scope === "all" && !needsDashboard && paged.status === "LoadingMore" && <p className="text-center text-sm text-muted-foreground">Načítavam ďalšie vchody…</p>}
    {scope === "all" && needsDashboard && visibleItems.length < items.length && <button type="button" onClick={() => setSearchPages((count) => count + 1)} className="w-full rounded-xl border bg-card px-4 py-3 font-semibold">Zobraziť ďalších 25 nájdených vchodov</button>}
  </section>{printRequested && scope === "mine" && <PrintStreetTable person={data?.currentPersonName ?? "Roznos"} items={scopedItems} />}</>;
}

