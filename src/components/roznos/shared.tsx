import type { ReactNode } from "react";

export function Select({ label, value, onChange, options, optionLabel = (value) => value }: { label: string; value: string; onChange: (value: string) => void; options: string[]; optionLabel?: (value: string) => string }) { return <label className="text-sm font-medium">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full rounded-xl border bg-card px-3 py-2">{options.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}</select></label>; }
export function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>; }
export function Panel({ title, children }: { title: string; children: ReactNode }) { return <div className="rounded-2xl border bg-card p-4"><h3 className="font-semibold">{title}</h3><div className="mt-3">{children}</div></div>; }
export function normalizeSearch(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
export function shown(items: Array<{ mailboxes: number }>) { return items.reduce((sum, item) => sum + item.mailboxes, 0).toLocaleString("sk-SK"); }
