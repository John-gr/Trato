import { contract, rpc } from "@stellar/stellar-sdk";
import { CONFIG } from "./config";
import { signTx } from "./wallet";
import { TRATO_SPEC } from "./spec";
import { TokenError, tokenErrorFrom } from "./token-errors";

export type StatusTag =
  | "Open"
  | "Funded"
  | "Delivered"
  | "Released"
  | "Refunded"
  | "Cancelled"
  | "Disputed"
  | "Resolved";

export type Deal = {
  id: bigint;
  freelancer: string;
  client?: string;
  token: string;
  amount: bigint;
  title: string;
  delivery_deadline: bigint;
  review_period: bigint;
  delivered_at: bigint;
  evidence: string;
  status: StatusTag;
  created_at: bigint;
};

// Spec del contrato incrustado (src/lib/spec.ts) para no descargar el wasm en cada carga.
const SPEC = new contract.Spec(TRATO_SPEC);
let readClient: contract.Client | null = null;

async function getClient(publicKey?: string): Promise<contract.Client> {
  const base = {
    contractId: CONFIG.contractId,
    rpcUrl: CONFIG.rpcUrl,
    networkPassphrase: CONFIG.networkPassphrase,
  };
  if (!publicKey) {
    readClient ??= new contract.Client(SPEC, base);
    return readClient;
  }
  return new contract.Client(SPEC, { ...base, publicKey, signTransaction: signTx });
}

// El cliente dinámico tipa los métodos como `any`; los envolvemos con tipos propios.
type Assembled = contract.AssembledTransaction<unknown>;
type DynClient = Record<string, (args?: Record<string, unknown>) => Promise<Assembled>>;

function normalizeDeal(raw: Record<string, unknown>): Deal {
  const status = raw.status as { tag: StatusTag } | StatusTag;
  return {
    ...(raw as unknown as Deal),
    client: (raw.client as string | null | undefined) ?? undefined,
    status: typeof status === "string" ? status : status.tag,
  };
}

/** Reparto del pago entre el equipo: bps sobre 10_000 (= 100 %). */
export type Split = { recipient: string; bps: number };

/** Historial on-chain del freelancer. `volume` está en unidades del token, sin distinguir token. */
export type Reputation = { completed: number; refunded: number; disputed: number; volume: bigint };

/** Llamada de solo lectura (simulación, sin firma). */
async function read<T>(method: string, args?: Record<string, unknown>): Promise<T> {
  const c = (await getClient()) as unknown as DynClient;
  const tx = await c[method](args);
  // En lecturas el SDK no lanza: devuelve un Err sin el código. El código está en la simulación.
  if (tx.simulation && rpc.Api.isSimulationError(tx.simulation)) throw new Error(tx.simulation.error);
  return tx.result as T;
}

export async function getDeal(id: bigint): Promise<Deal> {
  return normalizeDeal(await read<Record<string, unknown>>("get", { id }));
}

export const getCount = () => read<bigint>("count");

/** Árbitro del trato, o undefined si no tiene (entonces no admite disputas). */
export async function getArbiter(id: bigint): Promise<string | undefined> {
  return (await read<string | null>("arbiter", { id })) ?? undefined;
}

/** Reparto del equipo; vacío si todo el pago va al freelancer. */
export const getSplits = (id: bigint) => read<Split[]>("splits", { id });

export const getReputation = (freelancer: string) => read<Reputation>("reputation", { freelancer });

export async function listDeals(): Promise<Deal[]> {
  const count = Number(await getCount());
  const ids = Array.from({ length: count }, (_, i) => BigInt(count - 1 - i));
  const deals = await Promise.all(ids.map((id) => getDeal(id).catch(() => null)));
  return deals.filter((d): d is Deal => d !== null);
}

export type TxResult<T> = { hash: string; result: T };

async function invoke<T>(
  publicKey: string,
  method: string,
  args: Record<string, unknown>,
): Promise<TxResult<T>> {
  const c = (await getClient(publicKey)) as unknown as DynClient;
  const tx = await c[method](args);
  // Si falló el token (saldo, trustline), avisarlo antes de pedir la firma.
  const tokenError = tokenErrorFrom(tx, CONFIG.contractId);
  if (tokenError) throw tokenError;
  const sent = await tx.signAndSend();
  const hash =
    sent.sendTransactionResponse?.hash ??
    (sent.getTransactionResponse as { txHash?: string } | undefined)?.txHash ??
    "";
  return { hash, result: sent.result as T };
}

export const createDeal = (
  freelancer: string,
  p: { token: string; amount: bigint; title: string; deliveryDeadline: bigint; reviewPeriod: bigint },
) =>
  invoke<bigint>(freelancer, "create", {
    freelancer,
    token: p.token,
    amount: p.amount,
    title: p.title,
    delivery_deadline: p.deliveryDeadline,
    review_period: p.reviewPeriod,
  });

export const fundDeal = (client: string, id: bigint) => invoke<void>(client, "fund", { id, client });
export const deliverDeal = (freelancer: string, id: bigint, evidence: string) =>
  invoke<void>(freelancer, "deliver", { id, evidence });
export const releaseDeal = (client: string, id: bigint) => invoke<void>(client, "release", { id });
export const claimDeal = (freelancer: string, id: bigint) => invoke<void>(freelancer, "claim", { id });
export const refundDeal = (client: string, id: bigint) => invoke<void>(client, "refund", { id });
export const cancelDeal = (freelancer: string, id: bigint) => invoke<void>(freelancer, "cancel", { id });

// Árbitro y reparto solo se pueden fijar mientras el trato está Open: el cliente los ve antes de pagar.
export const setArbiter = (freelancer: string, id: bigint, arbiter: string) =>
  invoke<void>(freelancer, "set_arbiter", { id, arbiter });
export const setSplits = (freelancer: string, id: bigint, splits: Split[]) =>
  invoke<void>(freelancer, "set_splits", { id, splits });
// El cliente disputa dentro del periodo de revisión; el árbitro manda freelancerBps al freelancer y el resto al cliente.
export const disputeDeal = (client: string, id: bigint) => invoke<void>(client, "dispute", { id });
export const resolveDispute = (arbiter: string, id: bigint, freelancerBps: number) =>
  invoke<void>(arbiter, "resolve", { id, freelancer_bps: freelancerBps });

const CONTRACT_ERRORS: Record<number, string> = {
  1: "Ese trato no existe.",
  2: "El monto debe ser mayor a 0.",
  3: "La fecha de entrega debe ser en el futuro.",
  4: "El periodo de revisión debe estar entre 1 minuto y 30 días.",
  5: "El texto es demasiado largo (máx. 280 caracteres).",
  6: "Esta acción no aplica en el estado actual del trato.",
  7: "Solo el cliente puede hacer esto.",
  8: "No puedes pagar tu propio trato.",
  9: "La fecha límite de entrega ya pasó.",
  10: "Todavía no se puede: falta que venza el plazo.",
  11: "El reparto del equipo debe sumar 100 %, con hasta 10 integrantes y ninguno en 0 %.",
  12: "Este trato no tiene árbitro, así que no admite disputas.",
  13: "El periodo de revisión ya terminó: ya no se puede abrir una disputa.",
  14: "El reparto del árbitro no puede pasar de 100 %.",
  15: "El árbitro del trato no puede ser quien paga.",
};

export const DEAL_NOT_FOUND = CONTRACT_ERRORS[1];
const U64_MAX = 18_446_744_073_709_551_615n;

/** Id del trato a partir de la URL, o null si no puede ser un u64. */
export function parseDealId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = BigInt(raw);
  return id <= U64_MAX ? id : null;
}

export function friendlyError(e: unknown): string {
  if (e instanceof TokenError) return e.message;
  // Stellar Wallets Kit lanza objetos { code, message }, no instancias de Error.
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e && "message" in e
        ? String((e as { message: unknown }).message)
        : String(e);
  const m = msg.match(/Error\(Contract, #(\d+)\)/);
  if (m) return CONTRACT_ERRORS[Number(m[1])] ?? msg;
  if (/balance|underfunded|resulting balance/i.test(msg)) return "Saldo insuficiente del token.";
  if (/trustline/i.test(msg)) return "Tu cuenta no tiene trustline para ese token.";
  if (/reject|declin|cancel/i.test(msg)) return "Firma cancelada en la wallet.";
  return msg.length > 220 ? msg.slice(0, 220) + "…" : msg;
}
