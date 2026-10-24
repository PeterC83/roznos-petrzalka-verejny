const hourMs = 60 * 60 * 1000;
const bratislavaHour = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Bratislava",
  hour: "2-digit",
  hourCycle: "h23",
});

export function nextReportAt(now: number): number {
  let timestamp = Math.floor(now / hourMs) * hourMs + hourMs;
  for (let i = 0; i < 49; i += 1, timestamp += hourMs) {
    if (bratislavaHour.format(timestamp) === "19") return timestamp;
  }
  throw new Error("Čas večerného reportu sa nepodarilo určiť.");
}
