import { useState } from "react";
import { useWallet } from "../wallet-context";
import { friendlyError } from "../lib/trato";
import { MEMO_MAX_BYTES, memoBytes, parsePaymentInput } from "../lib/payment-input";
import { sendPayment } from "../lib/payment";
import { CONFIG } from "../lib/config";
import { Notice, TxLink } from "../components";

type SentPayment = { hash: string; amount: string; memo: string };

export default function PayPage() {
  const { address, connect } = useWallet();
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentPayment | null>(null);

  const usedBytes = memoBytes(memo.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setSent(null);
    // Bloquear desde el primer clic (también mientras se conecta la wallet) evita dos pagos por doble clic.
    setBusy(true);
    try {
      const who = address ?? (await connect());
      if (!who) return;

      const parsed = parsePaymentInput({ destination, amount, memo }, who);
      if (!parsed.ok) return setError(parsed.error);

      const hash = await sendPayment(who, parsed.value);
      setSent({ hash, amount: parsed.value.amount, memo: parsed.value.memo });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card narrow">
      <h2>Pago con memo</h2>
      <p className="muted">
        Envía XLM ({CONFIG.networkLabel}) desde tu wallet a otra cuenta, con un memo de texto: el código de un reto o la
        referencia de una factura. Es un pago directo, sin escrow.
      </p>
      <form onSubmit={submit} className="form">
        <label>
          Cuenta destino
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="G…"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label>
          Monto (XLM)
          <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} placeholder="1" />
        </label>
        <label>
          Memo
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Código o referencia"
            spellCheck={false}
            autoComplete="off"
          />
          <span className="hint">
            {usedBytes}/{MEMO_MAX_BYTES} bytes
          </span>
        </label>
        {error && <Notice kind="error">{error}</Notice>}
        {sent && (
          <Notice kind="ok">
            Pago enviado: {sent.amount} XLM{sent.memo ? ` con el memo «${sent.memo}»` : ""}.{" "}
            <TxLink hash={sent.hash} />
          </Notice>
        )}
        <button className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? "Firmando en tu wallet…" : address ? "Enviar pago" : "Conectar wallet y pagar"}
        </button>
      </form>
    </section>
  );
}
