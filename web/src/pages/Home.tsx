import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "../wallet-context";
import { listDeals, type Deal } from "../lib/trato";
import { StatusBadge } from "../components";
import { fromUnits, short } from "../lib/format";
import { CONFIG, contractUrl, tokenById } from "../lib/config";

export default function Home() {
  const { address } = useWallet();
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listDeals()
      .then(setDeals)
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  const mine = address ? deals?.filter((d) => d.freelancer === address || d.client === address) : [];

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Escrow para freelancers · Stellar</p>
        <h1>
          Cierra el trato.
          <br />
          <span className="accent">Cobra seguro.</span>
        </h1>
        <p className="lead">
          Crea un link de pago. Tu cliente deposita en USDC y el dinero queda bloqueado en un contrato
          inteligente hasta que entregas. Si el cliente no responde, cobras igual. Si no entregas, el
          cliente recupera su dinero. Sin intermediarios.
        </p>
        <div className="hero-cta">
          <Link to="/nuevo" className="btn btn-primary btn-lg">
            Crear link de pago
          </Link>
          <a className="btn btn-ghost btn-lg" href="#como-funciona">
            ¿Cómo funciona?
          </a>
        </div>
      </section>

      <section id="como-funciona" className="steps">
        {[
          ["1", "Crea el trato", "Define entregable, monto y fecha límite. Recibes un link."],
          ["2", "El cliente deposita", "Abre el link, conecta su wallet y bloquea el pago en el contrato."],
          ["3", "Entregas", "Marcas el trabajo como entregado con el link a tu entregable."],
          ["4", "Cobras", "El cliente libera el pago, o se libera solo si no responde a tiempo."],
        ].map(([n, t, d]) => (
          <div className="step" key={n}>
            <span className="step-n">{n}</span>
            <h3>{t}</h3>
            <p>{d}</p>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{address ? "Mis tratos" : "Tratos recientes"}</h2>
          <a className="muted small" href={contractUrl(CONFIG.contractId)} target="_blank" rel="noreferrer">
            Contrato ↗
          </a>
        </div>
        {error && <p className="muted">No se pudieron cargar los tratos: {error}</p>}
        {!deals && !error && <p className="muted">Cargando desde Stellar…</p>}
        {deals && (
          <DealList
            deals={address ? mine ?? [] : deals.slice(0, 8)}
            me={address}
            empty={address ? "Aún no tienes tratos con esta wallet." : "Aún no hay tratos."}
          />
        )}
      </section>
    </>
  );
}

function DealList({ deals, me, empty }: { deals: Deal[]; me: string | null; empty: string }) {
  if (deals.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="deal-list">
      {deals.map((d) => {
        const tok = tokenById(d.token);
        const role = me ? (d.freelancer === me ? "Freelancer" : "Cliente") : short(d.freelancer);
        return (
          <li key={String(d.id)}>
            <Link to={`/t/${d.id}`} className="deal-row">
              <span className="deal-id">#{String(d.id)}</span>
              <span className="deal-title">{d.title}</span>
              <span className="deal-role muted small">{role}</span>
              <span className="deal-amount">
                {fromUnits(d.amount, tok.decimals)} {tok.symbol}
              </span>
              <StatusBadge status={d.status} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
