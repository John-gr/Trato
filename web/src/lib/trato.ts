import { contract } from "@stellar/stellar-sdk";
import { CONFIG } from "./config";
import { signTx } from "./wallet";
import { TRATO_SPEC } from "./spec";

export type StatusTag = "Open" | "Funded" | "Delivered" | "Released" | "Refunded" | "Cancelled";

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

export async function getDeal(id: bigint): Promise<Deal> {
  const c = (await getClient()) as unknown as DynClient;
  const tx = await c.get({ id });
  return normalizeDeal(tx.result as Record<string, unknown>);
}

export async function getCount(): Promise<bigint> {
  const c = (await getClient()) as unknown as DynClient;
  const tx = await c.count();
  return tx.result as bigint;
}

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
};

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/Error\(Contract, #(\d+)\)/);
  if (m) return CONTRACT_ERRORS[Number(m[1])] ?? msg;
  if (/balance|underfunded|resulting balance/i.test(msg)) return "Saldo insuficiente del token.";
  if (/trustline/i.test(msg)) return "Tu cuenta no tiene trustline para ese token.";
  if (/reject|declin|cancel/i.test(msg)) return "Firma cancelada en la wallet.";
  return msg.length > 220 ? msg.slice(0, 220) + "…" : msg;
}
