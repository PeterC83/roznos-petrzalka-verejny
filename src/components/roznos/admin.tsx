import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import { Panel, normalizeSearch } from "./shared";

export function Admin() {
  const data = useQuery(api.management.adminData, {});
  const saveUserProfile = useMutation(api.management.saveUserProfile);
  const deleteUserProfile = useMutation(api.management.deleteUserProfile);
  const assign = useMutation(api.management.assignRajon);
  const assignStreet = useMutation(api.management.assignStreet);
  const unassignStreet = useMutation(api.management.unassignStreet);
  const [email, setEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [role, setRole] = useState<"ADMIN" | "USER">("USER");
  const [userSearch, setUserSearch] = useState("");
  const [userPage, setUserPage] = useState(0);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignmentDivision, setAssignmentDivision] = useState("");
  const [assignmentRajon, setAssignmentRajon] = useState("");
  const [assignmentPerson, setAssignmentPerson] = useState("");
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentNotice, setAssignmentNotice] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const assignmentDivisions = useMemo(() => [...new Set(data?.rajonSummaries.flatMap((summary) => summary.divisions) ?? [])].sort((a, b) => a - b), [data]);
  const assignmentRajons = useMemo(() => data?.rajons.filter((rajon) => {
    const summary = data.rajonSummaries.find((item) => item.rajonId === rajon._id);
    const phrase = normalizeSearch(assignmentSearch);
    return (assignmentDivision === "" || summary?.divisions.includes(Number(assignmentDivision))) && (!phrase || normalizeSearch(rajon.name + " " + (summary?.streets.map((street) => street.name).join(" ") ?? "")).includes(phrase));
  }) ?? [], [data, assignmentDivision, assignmentSearch]);
  useEffect(() => { if (assignmentRajon && !assignmentRajons.some((rajon) => rajon._id === assignmentRajon)) setAssignmentRajon(""); }, [assignmentRajon, assignmentRajons]);
  const filteredRajonSummaries = useMemo(() => {
    const phrase = normalizeSearch(assignmentSearch);
    return (data?.rajonSummaries ?? []).filter((summary) => {
      const rajon = data!.rajons.find((item) => item._id === summary.rajonId)!;
      return (assignmentDivision === "" || summary.divisions.includes(Number(assignmentDivision))) && (!phrase || normalizeSearch(rajon.name + " " + summary.streets.map((street) => street.name).join(" ")).includes(phrase));
    }).sort((a, b) => data!.rajons.find((rajon) => rajon._id === a.rajonId)!.name.localeCompare(data!.rajons.find((rajon) => rajon._id === b.rajonId)!.name, "sk"));
  }, [data, assignmentDivision, assignmentSearch]);
  const filteredProfiles = useMemo(() => (data?.userProfiles ?? []).filter((profile) => !userSearch || normalizeSearch(profile.displayName + " " + (profile.email ?? "")).includes(normalizeSearch(userSearch))), [data, userSearch]);
  const userPageCount = Math.max(1, Math.ceil(filteredProfiles.length / 10));
  const visibleProfiles = filteredProfiles.slice(userPage * 10, userPage * 10 + 10);
  useEffect(() => { if (userPage >= userPageCount) setUserPage(userPageCount - 1); }, [userPage, userPageCount]);
  if (!data) return <section className="mx-auto max-w-4xl p-5">Načítavam správu…</section>;

  async function submitEmail(event: FormEvent) { event.preventDefault(); await saveUserProfile({ displayName: userName, ...(email.trim() ? { email: email.trim() } : {}), role }); setEmail(""); setUserName(""); setUserPage(0); }
  async function submitProfile(event: FormEvent<HTMLFormElement>, profile: any) { event.preventDefault(); const form = new FormData(event.currentTarget); const displayName = String(form.get("displayName") ?? ""); const profileEmail = String(form.get("email") ?? "").trim(); const profileRole = String(form.get("role") ?? "USER") as "ADMIN" | "USER"; await saveUserProfile({ ...(profile.personId ? { personId: profile.personId } : {}), ...(profile.allowedEmailId ? { allowedEmailId: profile.allowedEmailId } : {}), displayName, ...(profileEmail ? { email: profileEmail } : {}), role: profileRole }); }
  async function removeProfile(profile: any) { if (window.confirm("Vymazať používateľa? Prístup bude zrušený a profil archivovaný; existujúce pridelenia ostanú v histórii.")) await deleteUserProfile({ ...(profile.personId ? { personId: profile.personId } : {}), ...(profile.allowedEmailId ? { allowedEmailId: profile.allowedEmailId } : {}) }); }
  async function submitAssignment(event: FormEvent) {
    event.preventDefault();
    if (!assignmentRajon || !assignmentPerson || assignmentSaving) return;
    setAssignmentSaving(true);
    setAssignmentNotice(null);
    try {
      await assign({ rajonId: assignmentRajon as any, personId: assignmentPerson as any });
      const rajonName = data?.rajons.find((item) => String(item._id) === assignmentRajon)?.name ?? "Rajón";
      setAssignmentNotice({ kind: "ok", message: rajonName + " bol pridelený. Ulice, ktorým bolo pridelenie odobraté, sú opäť súčasťou rajónu." });
    } catch (error) {
      setAssignmentNotice({ kind: "error", message: error instanceof Error ? error.message : "Rajón sa nepodarilo priradiť." });
    } finally {
      setAssignmentSaving(false);
    }
  }
  async function changeStreetPerson(streetId: string, personId: string) { if (personId) await assignStreet({ streetId: streetId as any, personId: personId as any }); else await unassignStreet({ streetId: streetId as any }); }
  async function removeStreet(streetId: string) { if (window.confirm("Odobrať priame priradenie tejto ulice?")) await unassignStreet({ streetId: streetId as any }); }

  return <section className="mx-auto max-w-4xl space-y-5 p-4">
    <h2 className="text-xl font-bold">Správa</h2>
    <Panel title="Používatelia"><form onSubmit={submitEmail} className="grid gap-2 sm:grid-cols-4"><input value={userName} onChange={(e) => setUserName(e.target.value)} required placeholder="Meno a priezvisko" className="rounded-xl border bg-background px-3 py-2" /><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-mail (voliteľný)" className="rounded-xl border bg-background px-3 py-2" /><select value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "USER")} className="rounded-xl border bg-background px-3 py-2"><option value="USER">Používateľ</option><option value="ADMIN">Administrátor</option></select><button className="rounded-xl bg-primary px-3 py-2 font-semibold text-primary-foreground">Pridať používateľa</button></form><p className="mt-2 text-xs text-muted-foreground">Používateľ bez e-mailu je interný profil pre roznos; e-mail mu môžete doplniť neskôr.</p><label className="mt-4 block text-sm font-medium">Hľadať používateľa<input value={userSearch} onChange={(event) => { setUserSearch(event.target.value); setUserPage(0); }} placeholder="Meno alebo e-mail" className="mt-1 block w-full rounded-xl border bg-background px-3 py-2" /></label><div className="mt-3 space-y-2">{visibleProfiles.map((profile) => <form key={profile.personId ?? profile.allowedEmailId} onSubmit={(event) => void submitProfile(event, profile)} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_120px_auto_auto]"><input name="displayName" defaultValue={profile.displayName} required className="rounded-xl border bg-background px-3 py-2 text-sm" /><input name="email" type="email" defaultValue={profile.email ?? ""} placeholder="bez e-mailu" className="rounded-xl border bg-background px-3 py-2 text-sm" /><select name="role" defaultValue={profile.role ?? "USER"} className="rounded-xl border bg-background px-3 py-2 text-sm"><option value="USER">Používateľ</option><option value="ADMIN">Administrátor</option></select><button className="rounded-xl border px-3 py-2 text-sm font-semibold">Uložiť</button><button type="button" onClick={() => void removeProfile(profile)} className="rounded-xl border border-destructive/40 px-3 py-2 text-sm font-semibold text-destructive">Vymazať</button></form>)}</div>{filteredProfiles.length > 10 && <div className="mt-3 flex items-center justify-between text-sm"><button onClick={() => setUserPage((page) => Math.max(0, page - 1))} disabled={userPage === 0} className="rounded-xl border px-3 py-2 disabled:opacity-40">Predchádzajúca</button><span>Strana {userPage + 1} z {userPageCount}</span><button onClick={() => setUserPage((page) => Math.min(userPageCount - 1, page + 1))} disabled={userPage >= userPageCount - 1} className="rounded-xl border px-3 py-2 disabled:opacity-40">Ďalšia</button></div>}</Panel>
    <Panel title="Priradenie rajónu"><label className="mb-3 block text-sm font-medium">Hľadať rajón alebo ulicu<input value={assignmentSearch} onChange={(event) => setAssignmentSearch(event.target.value)} placeholder="Rajón alebo ulica" className="mt-1 block w-full rounded-xl border bg-background px-3 py-2" /></label><form onSubmit={submitAssignment} className="grid gap-2 sm:grid-cols-4"><select value={assignmentDivision} onChange={(e) => setAssignmentDivision(e.target.value)} className="rounded-xl border bg-background px-3 py-2"><option value="">Vyberte obvod</option>{assignmentDivisions.map((number) => <option key={number} value={number}>Obvod {number}</option>)}</select><select value={assignmentRajon} onChange={(e) => setAssignmentRajon(e.target.value)} required className="rounded-xl border bg-background px-3 py-2"><option value="">Vyberte rajón</option>{assignmentRajons.map((rajon) => <option key={rajon._id} value={rajon._id}>{rajon.name}</option>)}</select><select value={assignmentPerson} onChange={(e) => setAssignmentPerson(e.target.value)} required className="rounded-xl border bg-background px-3 py-2"><option value="">Vyberte osobu</option>{data.people.map((person) => <option key={person._id} value={person._id}>{person.displayName}</option>)}</select><button disabled={assignmentSaving} className="rounded-xl bg-primary px-3 py-2 font-semibold text-primary-foreground disabled:opacity-50">{assignmentSaving ? "Priraďujem…" : "Priradiť"}</button></form>{assignmentNotice && <p role="status" className={"mt-2 rounded-xl border px-3 py-2 text-sm " + (assignmentNotice.kind === "ok" ? "border-green-500/40 text-green-700" : "border-destructive/40 text-destructive")}>{assignmentNotice.message}</p>}
      <div className="mt-4 space-y-2">{filteredRajonSummaries.map((summary) => {
        const rajon = data.rajons.find((entry) => entry._id === summary.rajonId)!;
        const assignment = data.assignments.find((entry) => entry.rajonId === summary.rajonId);
        const activeStreets = summary.streets.filter((street) => street.entrances > 0);
        const assignedStreets = activeStreets.filter((street) => !street.isUnassigned && Boolean(street.personId ?? assignment?.personId));
        const assignedStreetCount = assignedStreets.length;
        const assignedPercent = activeStreets.length ? Math.round((assignedStreetCount / activeStreets.length) * 100) : 0;
        const fullyAssigned = activeStreets.length > 0 && assignedStreetCount === activeStreets.length;
        const assignees = new Set(assignedStreets.map((street) => String(street.personId ?? assignment?.personId)));
        const assignmentText = !assignedStreetCount ? "nepriradené" : !fullyAssigned ? "čiastočne pridelené" : assignees.size === 1 ? data.people.find((person) => String(person._id) === [...assignees][0])?.displayName ?? "pridelené" : "pridelené viacerým osobám";
        return <details key={summary.rajonId} className={"rounded-xl border px-3 py-2 " + (fullyAssigned ? "border-green-500/40 bg-green-500/5" : "")}><summary className="cursor-pointer list-none"><div className="flex justify-between gap-3"><span className="font-medium">{rajon.name}</span><span className={"text-right text-xs " + (fullyAssigned ? "font-semibold text-green-700" : "text-muted-foreground")}>{activeStreets.length} ulíc · {summary.entrances} vchodov · {summary.mailboxes.toLocaleString("sk-SK")} schránok<br />{assignmentText} · {assignedStreetCount}/{activeStreets.length} ulíc · {assignedPercent} %</span></div></summary><ul className="mt-3 divide-y border-t text-sm">{activeStreets.map((street) => {
          const effectivePersonId = street.isUnassigned ? "" : street.personId ?? assignment?.personId ?? "";
          const effectivePersonName = street.isUnassigned ? undefined : street.personName ?? assignment?.personName;
          return <li key={street.id} className={"py-2 " + (effectivePersonName ? "bg-green-500/5" : "")}><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p>{street.name}</p><p className="text-xs text-muted-foreground">{street.entrances} vchodov · {street.mailboxes.toLocaleString("sk-SK")} schránok</p></div><div className="flex items-center gap-2"><select aria-label={"Osoba pre ulicu " + street.name} value={effectivePersonId} onChange={(event) => void changeStreetPerson(String(street.id), event.target.value)} className={"rounded-xl border bg-background px-3 py-2 text-sm " + (effectivePersonName ? "font-semibold text-green-700" : "")}><option value="">{effectivePersonName ? "Odobrať pridelenie ulice" : "Priradiť osobu ulici"}</option>{data.people.map((person) => <option key={person._id} value={person._id}>{person.displayName}</option>)}</select>{effectivePersonName && <button onClick={() => void removeStreet(String(street.id))} className="rounded-xl border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive">Odobrať</button>}</div></div>{street.personName && <p className="mt-1 text-xs text-green-700">Vlastné pridelenie ulice — prepisuje pridelenie rajónu.</p>}{street.isUnassigned && <p className="mt-1 text-xs text-amber-700">Ulica je odobratá z pridelenia rajónu.</p>}</li>;
        })}</ul></details>;
      })}</div>
    </Panel>
  </section>;
}

