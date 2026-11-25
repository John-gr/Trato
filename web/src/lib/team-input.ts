import { StrKey } from "@stellar/stellar-sdk";

// Mismas reglas que el contrato (splits.rs): de 1 a 10 integrantes, ninguno en 0 y suma exacta de 10_000 bps.
export const BPS_TOTAL = 10_000;
export const MAX_SPLITS = 10;

// Porcentaje con hasta 2 decimales: 0.01 % es 1 bps, la unidad mínima del contrato.
const PERCENT_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

export type SplitRow = { recipient: string; percent: string };
export type SplitShare = { recipient: string; bps: number };
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** "12.5" → 1250 bps (sin pasar por flotantes), o null si no es un porcentaje válido. */
export function percentToBps(raw: string): number | null {
  const value = raw.trim().replace(",", ".");
  if (!PERCENT_PATTERN.test(value)) return null;
  const [whole, decimals = ""] = value.split(".");
  return Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
}

/** 6000 → "60", 1250 → "12.5", 1 → "0.01". */
export function formatBps(bps: number): string {
  const whole = Math.floor(bps / 100);
  const cents = bps % 100;
  if (cents === 0) return String(whole);
  return `${whole}.${String(cents).padStart(2, "0").replace(/0$/, "")}`;
}

/** Valida el árbitro propuesto por el freelancer. */
export function parseArbiter(raw: string, freelancer: string): Parsed<string> {
  const arbiter = raw.trim();
  if (!StrKey.isValidEd25519PublicKey(arbiter)) return fail("El árbitro debe ser una dirección G… válida.");
  if (arbiter === freelancer) return fail("No puedes ser el árbitro de tu propio trato.");
  return { ok: true, value: arbiter };
}

/** Valida el reparto del equipo y lo devuelve en bps, listo para set_splits. */
export function parseSplits(rows: SplitRow[]): Parsed<SplitShare[]> {
  if (rows.length === 0 || rows.length > MAX_SPLITS) {
    return fail(`El reparto lleva de 1 a ${MAX_SPLITS} integrantes.`);
  }
  const seen = new Set<string>();
  const shares: SplitShare[] = [];
  for (const [i, row] of rows.entries()) {
    const who = `Integrante ${i + 1}`;
    const recipient = row.recipient.trim();
    if (!StrKey.isValidEd25519PublicKey(recipient)) return fail(`${who}: la dirección debe ser una G… válida.`);
    if (seen.has(recipient)) return fail(`${who}: esa dirección ya está en el reparto.`);
    seen.add(recipient);
    const bps = percentToBps(row.percent);
    if (bps === null || bps === 0 || bps > BPS_TOTAL) {
      return fail(`${who}: el porcentaje debe ser mayor a 0 y hasta 100, con 2 decimales como máximo.`);
    }
    shares.push({ recipient, bps });
  }
  const total = shares.reduce((sum, s) => sum + s.bps, 0);
  if (total !== BPS_TOTAL) return fail(`El reparto suma ${formatBps(total)} %: tiene que sumar exactamente 100 %.`);
  return { ok: true, value: shares };
}
