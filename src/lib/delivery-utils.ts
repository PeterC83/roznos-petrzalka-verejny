export function parseMailboxCount(value: string): number | undefined {
  if (!value) return undefined;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 10000) {
    throw new Error("Skutočný počet schránok musí byť celé číslo od 1 do 10 000.");
  }
  return Number(value);
}

export function matchesDeliveryStatus(status: string, filter: string): boolean {
  return filter === "Všetky" || (filter === "UNDONE" ? status !== "DONE" : status === filter);
}

export function creditedPersonId(item: { status: string; completedPersonId?: string; assignedPersonId?: string }): string | undefined {
  if (item.status !== "DONE") return undefined;
  return item.completedPersonId ?? item.assignedPersonId;
}

export function overviewPersonId(item: { status: string; completedPersonId?: string; assignedPersonId?: string }): string | undefined {
  return item.status === "DONE" ? creditedPersonId(item) : item.assignedPersonId;
}
