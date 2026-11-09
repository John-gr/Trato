import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../wallet-context";
import { createDeal, friendlyError } from "../lib/trato";
import { TOKENS } from "../lib/config";
import { toUnits } from "../lib/format";
import { Notice } from "../components";

const REVIEW_OPTIONS = [
  { label: "2 minutos (demo)", secs: 120 },
  { label: "1 día", secs: 86_400 },
  { label: "3 días", secs: 3 * 86_400 },
  { label: "7 días", secs: 7 * 86_400 },
];

function defaultDeadline() {
  const d = new Date(Date.now() + 7 * 86_400_000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NewDeal() {
  const { address, connect } = useWallet();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [tokenId, setTokenId] = useState(TOKENS[0]?.id ?? "");
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [review, setReview] = useState(REVIEW_OPTIONS[2].secs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const who = address ?? (await connect());
    if (!who) return;

    const token = TOKENS.find((t) => t.id === tokenId);
    if (!token) return setError("Elige un token.");
    if (!title.trim()) return setError("Describe el entregable.");
    let units: bigint;
    try {
      units = toUnits(amount, token.decimals);
    } catch {
      return setError("Monto inválido.");
    }
    if (units <= 0n) return setError("El monto debe ser mayor a 0.");
    const deadlineSecs = Math.floor(new Date(deadline).getTime() / 1000);
    if (!deadlineSecs || deadlineSecs <= Date.now() / 1000 + 60)
      return setError("La fecha de entrega debe ser en el futuro.");

    setBusy(true);
    try {
      const { result, hash } = await createDeal(who, {
        token: token.id,
        amount: units,
        title: title.trim(),
        deliveryDeadline: BigInt(deadlineSecs),
        reviewPeriod: BigInt(review),
      });
      navigate(`/t/${result}?nuevo=1${hash ? `&tx=${hash}` : ""}`);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card narrow">
      <h2>Nuevo trato</h2>
      <p className="muted">
        Tú eres el freelancer. Al crear el trato obtienes un link para que tu cliente deposite el pago.
      </p>
      <form onSubmit={submit} className="form">
        <label>
          ¿Qué vas a entregar?
          <input
            value={title}
            maxLength={280}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej. Logo + manual de marca para Café Luna"
          />
        </label>
        <div className="row">
          <label className="grow">
            Monto
            <input
              value={amount}
              inputMode="decimal"
              onChange={(e) => setAmount(e.target.value)}
              placeholder="250"
            />
          </label>
          <label>
            Moneda
            <select value={tokenId} onChange={(e) => setTokenId(e.target.value)}>
              {TOKENS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.symbol}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Fecha límite de entrega
          <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <label>
          Tiempo que tiene el cliente para revisar
          <select value={review} onChange={(e) => setReview(Number(e.target.value))}>
            {REVIEW_OPTIONS.map((o) => (
              <option key={o.secs} value={o.secs}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="hint">Si no responde en ese tiempo después de tu entrega, puedes cobrar tú.</span>
        </label>
        {error && <Notice kind="error">{error}</Notice>}
        <button className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? "Firmando en tu wallet…" : address ? "Crear trato" : "Conectar wallet y crear"}
        </button>
      </form>
    </section>
  );
}
