import { Asset, BASE_FEE, Memo, Operation, rpc, TransactionBuilder, type xdr } from "@stellar/stellar-sdk";
import { CONFIG } from "./config";
import type { PaymentRequest } from "./payment-input";
import { signTx } from "./wallet";

// La firma en la wallet puede tardar (Albedo abre otra ventana): margen amplio antes de expirar.
const TX_TIMEOUT_SECS = 300;
// ~1 s por intento: esperar lo suficiente para no invitar a reintentar (y pagar dos veces).
const POLL_ATTEMPTS = 60;

const RESULT_MESSAGES: Record<string, string> = {
  paymentUnderfunded: "Saldo insuficiente para este pago.",
  paymentNoDestination: `La cuenta destino no existe en ${CONFIG.networkLabel}.`,
  paymentLineFull: "La cuenta destino no puede recibir más de este activo.",
  txBadSeq: "Tu cuenta envió otra transacción al mismo tiempo. Intenta de nuevo.",
  txInsufficientBalance: "No te alcanza para la comisión de la red.",
  txInsufficientFee: "La comisión de la red subió. Intenta de nuevo.",
  txTooLate: "La firma tardó demasiado y la transacción expiró. Intenta de nuevo.",
};

/** Error del pago con un mensaje listo para mostrar. */
export class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentError";
  }
}

// En este SDK las uniones XDR se distinguen por `type` (txFailed, opInner, paymentUnderfunded, …).
function describeResult(result: xdr.TransactionResult): string {
  const tx = result.result;
  if (tx.type === "txFailed") {
    const op = tx.results[0];
    if (op?.type === "opInner" && op.tr.type === "payment") {
      const code = op.tr.paymentResult.type;
      return RESULT_MESSAGES[code] ?? `La red rechazó el pago (${code}).`;
    }
    return "La red rechazó el pago.";
  }
  return RESULT_MESSAGES[tx.type] ?? `La red rechazó la transacción (${tx.type}).`;
}

function unconfirmedMessage(hash: string): string {
  return `No pudimos confirmar el pago. Busca la transacción ${hash} en stellar.expert antes de reintentar.`;
}

async function loadAccount(server: rpc.Server, address: string, missingMessage: string) {
  try {
    return await server.getAccount(address);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/not found/i.test(msg)) throw new PaymentError(missingMessage);
    throw e;
  }
}

/** Envía un pago de XLM con memo de texto, firmado por la wallet de `from`. Devuelve el hash. */
export async function sendPayment(from: string, req: PaymentRequest): Promise<string> {
  const server = new rpc.Server(CONFIG.rpcUrl);
  const network = CONFIG.networkLabel;
  const source = await loadAccount(server, from, `Tu cuenta no existe en ${network}. ${CONFIG.activateHint}`);
  await loadAccount(
    server,
    req.destination,
    `La cuenta destino no existe en ${network}. ${CONFIG.activateHint} Después ya puedes pagarle.`,
  );

  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: CONFIG.networkPassphrase })
    .addOperation(Operation.payment({ destination: req.destination, asset: Asset.native(), amount: req.amount }))
    .addMemo(req.memo ? Memo.text(req.memo) : Memo.none())
    .setTimeout(TX_TIMEOUT_SECS)
    .build();

  const { signedTxXdr } = await signTx(tx.toXDR(), { networkPassphrase: CONFIG.networkPassphrase, address: from });
  const signed = TransactionBuilder.fromXDR(signedTxXdr, CONFIG.networkPassphrase);

  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR") {
    throw new PaymentError(sent.errorResult ? describeResult(sent.errorResult) : "La red rechazó la transacción.");
  }
  if (sent.status === "TRY_AGAIN_LATER") {
    throw new PaymentError("La red está ocupada. Intenta de nuevo en unos segundos.");
  }

  // Desde aquí el pago ya pudo haber entrado: cualquier fallo debe mostrar el hash, no invitar a reintentar.
  const final = await server.pollTransaction(sent.hash, { attempts: POLL_ATTEMPTS }).catch(() => {
    throw new PaymentError(unconfirmedMessage(sent.hash));
  });
  if (final.status === rpc.Api.GetTransactionStatus.SUCCESS) return sent.hash;
  if (final.status === rpc.Api.GetTransactionStatus.FAILED) throw new PaymentError(describeResult(final.resultXdr));
  throw new PaymentError(unconfirmedMessage(sent.hash));
}
