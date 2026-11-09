export function toUnits(value: string, decimals = 7): bigint {
  const [int, frac = ""] = value.trim().split(".");
  if (!/^\d+$/.test(int || "0") || !/^\d*$/.test(frac)) throw new Error("Monto inválido");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(int || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

export function fromUnits(units: bigint, decimals = 7): string {
  const base = 10n ** BigInt(decimals);
  const int = units / base;
  const frac = (units % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${int.toLocaleString("es-MX")}.${frac}` : int.toLocaleString("es-MX");
}

export const short = (addr?: string) => (addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : "—");

export function formatDate(secs: bigint | number): string {
  return new Date(Number(secs) * 1000).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDuration(secs: number): string {
  if (secs < 3600) return `${Math.round(secs / 60)} min`;
  if (secs < 86400) return `${Math.round(secs / 3600)} h`;
  return `${Math.round(secs / 86400)} días`;
}

export function timeLeft(targetSecs: number, nowSecs: number): string {
  const d = targetSecs - nowSecs;
  if (d <= 0) return "vencido";
  const days = Math.floor(d / 86400);
  const h = Math.floor((d % 86400) / 3600);
  const m = Math.floor((d % 3600) / 60);
  const s = d % 60;
  if (days > 0) return `${days}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}
