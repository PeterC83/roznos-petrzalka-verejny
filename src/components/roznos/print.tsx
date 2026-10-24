export function PrintStreetTable({ person, items }: { person: string; items: Array<{ rajon: string; street: string; number: string; division: number; mailboxes: number; status: string }> }) {
  const sorted = [...items].sort((a, b) => a.rajon.localeCompare(b.rajon, "sk") || a.street.localeCompare(b.street, "sk") || a.number.localeCompare(b.number, "sk", { numeric: true }));
  const totalBoxes = sorted.reduce((sum, item) => sum + item.mailboxes, 0);
  return <section className="print-sheet hidden p-8 print:block">
    <h1 className="text-2xl font-bold">Moje pridelené vchody</h1>
    <p className="mt-1 text-sm">{person}</p>
    <p className="mt-1 text-xs">Vygenerované {new Date().toLocaleString("sk-SK")}</p>
    <p className="mt-3 font-semibold">{sorted.length} vchodov · {totalBoxes.toLocaleString("sk-SK")} schránok</p>
    <table className="mt-5 w-full border-collapse text-left text-sm">
      <thead><tr className="border-b"><th className="p-2">Rajón</th><th className="p-2">Ulica</th><th className="p-2">Vchod</th><th className="p-2">Obvod</th><th className="p-2">Schránky</th><th className="p-2">Stav</th></tr></thead>
      <tbody>{sorted.map((item, index) => <tr key={index} className="border-b"><td className="p-2">{item.rajon}</td><td className="p-2">{item.street}</td><td className="p-2">{item.number}</td><td className="p-2">{item.division}</td><td className="p-2">{item.mailboxes.toLocaleString("sk-SK")}</td><td className="p-2">{item.status === "DONE" ? "Roznesené" : item.status === "LEFT_INSIDE" ? "Nechané vo vnútri" : "Čaká"}</td></tr>)}</tbody>
      <tfoot><tr className="border-t font-bold"><td className="p-2" colSpan={4}>Spolu</td><td className="p-2">{totalBoxes.toLocaleString("sk-SK")}</td><td className="p-2">{sorted.length} vchodov</td></tr></tfoot>
    </table>
    {!sorted.length && <p className="mt-3">Nemáte pridelené žiadne vchody.</p>}
  </section>;
}
export function PrintOverviewTable({ workloads }: { workloads: Array<{ person: { id: string; displayName: string }; items: Array<{ mailboxes: number }>; doneItems: Array<{ mailboxes: number }> }> }) {
  return <section className="print-sheet hidden p-8 print:block">
    <h1 className="text-2xl font-bold">Prehľad roznosu</h1>
    <p className="mt-1 text-xs">Vygenerované {new Date().toLocaleString("sk-SK")}</p>
    <table className="mt-5 w-full border-collapse text-left text-sm">
      <thead><tr className="border-b"><th className="p-2">Používateľ</th><th className="p-2">Započítané vchody</th><th className="p-2">Započítané schránky</th><th className="p-2">Hotové schránky</th><th className="p-2">Hotovo</th></tr></thead>
      <tbody>{workloads.map((workload) => {
        const total = workload.items.reduce((sum, item) => sum + item.mailboxes, 0);
        const done = workload.doneItems.reduce((sum, item) => sum + item.mailboxes, 0);
        return <tr key={workload.person.id} className="border-b"><td className="p-2 font-semibold">{workload.person.displayName}</td><td className="p-2">{workload.items.length}</td><td className="p-2">{total.toLocaleString("sk-SK")}</td><td className="p-2">{done.toLocaleString("sk-SK")}</td><td className="p-2">{total ? Math.round(done / total * 100) : 0} %</td></tr>;
      })}</tbody>
    </table>
    {!workloads.length && <p className="mt-3">Pre vybrané filtre nie sú údaje.</p>}
  </section>;
}

