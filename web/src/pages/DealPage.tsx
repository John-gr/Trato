import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useWallet } from "../wallet-context";
import {
  cancelDeal,
  claimDeal,
  deliverDeal,
  friendlyError,
  fundDeal,
  getDeal,
  refundDeal,
  releaseDeal,
  type Deal,
  type TxResult,
} from "../lib/trato";
import { accountUrl, tokenById } from "../lib/config";
import { formatDate, formatDuration, fromUnits, short, timeLeft } from "../lib/format";
import { Notice, StatusBadge, TxLink } from "../components";

type Tx = { label: string; hash: string };

function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function DealPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const { address, connect } = useWallet();
  const now = useNow();

  const [deal, setDeal] = useState<Deal | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txs, setTxs] = useState<Tx[]>(() => {
    const h = params.get("tx");
    return h ? [{ label: "Trato creado", hash: h }] : [];
  });
  const [evidence, setEvidence] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setDeal(await getDeal(BigInt(id)));
      setLoadError(null);
    } catch (e) {
      setLoadError(friendlyError(e));
    }
  }, [id]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  if (loadError) return <Notice kind="error">{loadError}</Notice>;
  if (!deal) return <p className="muted center">Cargando trato desde Stellar…</p>;

  const tok = tokenById(deal.token);
  const amount = `${fromUnits(deal.amount, tok.decimals)} ${tok.symbol}`;
  const isFreelancer = address === deal.freelancer;
  const isClient = !!address && address === deal.client;
  const deliveryDeadline = Number(deal.delivery_deadline);
  const claimAt = Number(deal.delivered_at) + Number(deal.review_period);
  const link = `${window.location.origin}/t/${deal.id}`;

  async function run(label: string, fn: (who: string) => Promise<TxResult<unknown>>) {
    setError(null);
    const who = address ?? (await connect());
    if (!who) return;
    setBusy(label);
    try {
      const { hash } = await fn(who);
      setTxs((prev) => [...prev, { label, hash }]);
      await refresh();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* el usuario puede copiarlo a mano */
    }
  }

  return (
    <div className="deal-grid">
      <section className="card">
        <div className="card-head">
          <span className="muted">Trato #{String(deal.id)}</span>
          <StatusBadge status={deal.status} />
        </div>
        <h1 className="deal-h1">{deal.title}</h1>
        <p className="big-amount">{amount}</p>

        <dl className="facts">
          <dt>Freelancer</dt>
          <dd>
            <a href={accountUrl(deal.freelancer)} target="_blank" rel="noreferrer">
              {short(deal.freelancer)}
            </a>
            {isFreelancer && <span className="you">tú</span>}
          </dd>
          <dt>Cliente</dt>
          <dd>
            {deal.client ? (
              <>
                <a href={accountUrl(deal.client)} target="_blank" rel="noreferrer">
                  {short(deal.client)}
                </a>
                {isClient && <span className="you">tú</span>}
              </>
            ) : (
              <span className="muted">quien pague el link</span>
            )}
          </dd>
          <dt>Entrega antes de</dt>
          <dd>
            {formatDate(deal.delivery_deadline)}
            {(deal.status === "Open" || deal.status === "Funded") && (
              <span className="muted small"> · {timeLeft(deliveryDeadline, now)}</span>
            )}
          </dd>
          <dt>Revisión del cliente</dt>
          <dd>{formatDuration(Number(deal.review_period))}</dd>
          {deal.evidence && (
            <>
              <dt>Entregable</dt>
              <dd className="evidence">
                {/^https?:\/\//.test(deal.evidence) ? (
                  <a href={deal.evidence} target="_blank" rel="noreferrer noopener">
                    {deal.evidence}
                  </a>
                ) : (
                  deal.evidence
                )}
              </dd>
            </>
          )}
        </dl>

        <Timeline deal={deal} />
      </section>

      <aside className="card action-card">
        {params.get("nuevo") && deal.status === "Open" && isFreelancer && (
          <Notice kind="ok">¡Trato creado! Comparte este link con tu cliente.</Notice>
        )}

        {/* ---------- Abierto ---------- */}
        {deal.status === "Open" &&
          (isFreelancer ? (
            <>
              <h3>Link de pago</h3>
              <div className="copy-row">
                <input readOnly value={link} onFocus={(e) => e.target.select()} />
                <button className="btn btn-ghost" onClick={copyLink}>
                  {copied ? "¡Copiado!" : "Copiar"}
                </button>
              </div>
              <p className="muted small">Cuando tu cliente deposite, el pago queda bloqueado a tu favor.</p>
              <button
                className="btn btn-danger-ghost"
                disabled={!!busy}
                onClick={() => run("Trato cancelado", (w) => cancelDeal(w, deal.id))}
              >
                {busy === "Trato cancelado" ? "Firmando…" : "Cancelar trato"}
              </button>
            </>
          ) : (
            <>
              <h3>Depositar pago</h3>
              <p className="muted">
                Bloquea <strong>{amount}</strong> en el contrato. El freelancer solo lo recibe cuando entregue,
                y si no entrega antes de la fecha límite, recuperas tu dinero.
              </p>
              <button
                className="btn btn-primary btn-lg"
                disabled={!!busy || now >= deliveryDeadline}
                onClick={() => run("Pago depositado", (w) => fundDeal(w, deal.id))}
              >
                {busy ? "Firmando…" : address ? `Depositar ${amount}` : "Conectar wallet y depositar"}
              </button>
            </>
          ))}

        {/* ---------- Fondeado ---------- */}
        {deal.status === "Funded" && (
          <>
            {isFreelancer && now <= deliveryDeadline && (
              <>
                <h3>Entregar trabajo</h3>
                <p className="muted">El pago está bloqueado. Comparte el link a tu entregable.</p>
                <input
                  className="mb"
                  value={evidence}
                  maxLength={280}
                  onChange={(e) => setEvidence(e.target.value)}
                  placeholder="https://drive.google.com/…"
                />
                <button
                  className="btn btn-primary btn-lg"
                  disabled={!!busy || !evidence.trim()}
                  onClick={() => run("Trabajo entregado", (w) => deliverDeal(w, deal.id, evidence.trim()))}
                >
                  {busy ? "Firmando…" : "Marcar como entregado"}
                </button>
              </>
            )}
            {isFreelancer && now > deliveryDeadline && (
              <Notice kind="info">La fecha de entrega pasó. El cliente puede pedir su reembolso.</Notice>
            )}
            {isClient && now <= deliveryDeadline && (
              <>
                <h3>Pago bloqueado</h3>
                <p className="muted">
                  Esperando la entrega. Si no llega en {timeLeft(deliveryDeadline, now)}, podrás recuperar tu
                  dinero.
                </p>
              </>
            )}
            {isClient && now > deliveryDeadline && (
              <>
                <h3>No hubo entrega a tiempo</h3>
                <button
                  className="btn btn-primary btn-lg"
                  disabled={!!busy}
                  onClick={() => run("Reembolso", (w) => refundDeal(w, deal.id))}
                >
                  {busy ? "Firmando…" : `Recuperar ${amount}`}
                </button>
              </>
            )}
            {!isFreelancer && !isClient && <p className="muted">Pago bloqueado, esperando entrega.</p>}
          </>
        )}

        {/* ---------- Entregado ---------- */}
        {deal.status === "Delivered" && (
          <>
            {isClient && (
              <>
                <h3>Revisa la entrega</h3>
                <p className="muted">
                  Si todo está bien, libera el pago. Si no respondes en {timeLeft(claimAt, now)}, el freelancer
                  podrá cobrar.
                </p>
                <button
                  className="btn btn-primary btn-lg"
                  disabled={!!busy}
                  onClick={() => run("Pago liberado", (w) => releaseDeal(w, deal.id))}
                >
                  {busy ? "Firmando…" : `Aprobar y pagar ${amount}`}
                </button>
              </>
            )}
            {isFreelancer && (
              <>
                <h3>Esperando aprobación</h3>
                {now < claimAt ? (
                  <p className="muted">
                    El cliente tiene {timeLeft(claimAt, now)} para aprobar. Después podrás cobrar tú mismo.
                  </p>
                ) : (
                  <>
                    <p className="muted">El cliente no respondió a tiempo. Ya puedes cobrar.</p>
                    <button
                      className="btn btn-primary btn-lg"
                      disabled={!!busy}
                      onClick={() => run("Cobro por tiempo", (w) => claimDeal(w, deal.id))}
                    >
                      {busy ? "Firmando…" : `Cobrar ${amount}`}
                    </button>
                  </>
                )}
              </>
            )}
            {!isFreelancer && !isClient && <p className="muted">Trabajo entregado, en revisión.</p>}
          </>
        )}

        {deal.status === "Released" && <Notice kind="ok">Pago completado: {amount} al freelancer.</Notice>}
        {deal.status === "Refunded" && <Notice kind="info">Reembolsado: {amount} regresaron al cliente.</Notice>}
        {deal.status === "Cancelled" && <Notice kind="info">Este trato fue cancelado.</Notice>}

        {!address && deal.status !== "Open" && (
          <button className="btn btn-ghost mt" onClick={connect}>
            Conectar wallet
          </button>
        )}

        {error && <Notice kind="error">{error}</Notice>}

        {txs.length > 0 && (
          <div className="txs">
            <h4>Transacciones</h4>
            <ul>
              {txs.map((t) => (
                <li key={t.hash + t.label}>
                  <span>{t.label}</span>
                  <TxLink hash={t.hash} label="stellar.expert" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

function Timeline({ deal }: { deal: Deal }) {
  const order = ["Open", "Funded", "Delivered", "Released"] as const;
  const idx = order.indexOf(deal.status as (typeof order)[number]);
  const labels = ["Creado", "Pago bloqueado", "Entregado", "Pagado"];
  if (deal.status === "Refunded" || deal.status === "Cancelled") {
    return (
      <ol className="timeline">
        <li className="done">Creado</li>
        {deal.status === "Refunded" && <li className="done">Pago bloqueado</li>}
        <li className="done alt">{deal.status === "Refunded" ? "Reembolsado" : "Cancelado"}</li>
      </ol>
    );
  }
  return (
    <ol className="timeline">
      {labels.map((l, i) => (
        <li key={l} className={i <= idx ? "done" : ""}>
          {l}
        </li>
      ))}
    </ol>
  );
}
