import { Link } from "react-router-dom";
import { useWallet } from "./wallet-context";
import { short } from "./lib/format";
import { txUrl } from "./lib/config";
import type { StatusTag } from "./lib/trato";

export function Header() {
  const { address, connect, disconnect } = useWallet();
  return (
    <header className="header">
      <Link to="/" className="brand">
        <span className="brand-mark">T</span>
        <span>Trato</span>
      </Link>
      <nav className="nav">
        <Link to="/nuevo" className="nav-link">
          Crear trato
        </Link>
        {address ? (
          <button className="btn btn-ghost" onClick={disconnect} title={address}>
            <span className="dot" /> {short(address)}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={connect}>
            Conectar wallet
          </button>
        )}
      </nav>
    </header>
  );
}

const STATUS_LABEL: Record<StatusTag, string> = {
  Open: "Esperando pago",
  Funded: "Pago bloqueado",
  Delivered: "Entregado",
  Released: "Pagado",
  Refunded: "Reembolsado",
  Cancelled: "Cancelado",
};

export function StatusBadge({ status }: { status: StatusTag }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{STATUS_LABEL[status]}</span>;
}

export function TxLink({ hash, label = "Ver en stellar.expert" }: { hash: string; label?: string }) {
  if (!hash) return null;
  return (
    <a className="tx-link" href={txUrl(hash)} target="_blank" rel="noreferrer">
      {label} ↗
    </a>
  );
}

export function Notice({ kind, children }: { kind: "error" | "ok" | "info"; children: React.ReactNode }) {
  return <div className={`notice notice-${kind}`}>{children}</div>;
}
