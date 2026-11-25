import { StrKey } from "@stellar/stellar-sdk";

// Memo.text admite hasta 28 bytes (UTF-8): un acento ocupa 2.
export const MEMO_MAX_BYTES = 28;
// XLM usa 7 decimales; Operation.payment recibe el monto como texto decimal.
const AMOUNT_PATTERN = /^\d+(\.\d{1,7})?$/;

export type PaymentForm = { destination: string; amount: string; memo: string };
export type PaymentRequest = { destination: string; amount: string; memo: string };
export type ParsedPayment = { ok: true; value: PaymentRequest } | { ok: false; error: string };

export function memoBytes(memo: string): number {
  return new TextEncoder().encode(memo).length;
}

/** Valida el formulario de pago y devuelve el pago listo para firmar, o el error a mostrar. */
export function parsePaymentInput(form: PaymentForm, from: string): ParsedPayment {
  const destination = form.destination.trim();
  if (!StrKey.isValidEd25519PublicKey(destination)) {
    return { ok: false, error: "La cuenta destino debe ser una dirección G… válida." };
  }
  if (destination === from) {
    return { ok: false, error: "La cuenta destino no puede ser tu propia cuenta." };
  }

  const amount = form.amount.trim();
  if (!AMOUNT_PATTERN.test(amount)) {
    return { ok: false, error: "Monto inválido: usa punto decimal y hasta 7 decimales (ej. 1.5)." };
  }
  if (!/[1-9]/.test(amount)) {
    return { ok: false, error: "El monto debe ser mayor a 0." };
  }

  const memo = form.memo.trim();
  if (memoBytes(memo) > MEMO_MAX_BYTES) {
    return { ok: false, error: `El memo no puede pasar de ${MEMO_MAX_BYTES} bytes (un acento ocupa 2).` };
  }

  return { ok: true, value: { destination, amount, memo } };
}
