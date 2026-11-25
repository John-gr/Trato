import { useState } from "react";
import { disputeDeal, resolveDispute, type TxResult } from "../lib/trato";
import { BPS_TOTAL, formatBps, percentToBps, resolutionShares } from "../lib/team-input";
import { fromUnits } from "../lib/format";

type Run = (label: string, fn: (who: string) => Promise<TxResult<unknown>>) => Promise<void>;

const DISPUTE_LABEL = "Disputa abierta";
const RESOLVE_LABEL = "Disputa resuelta";

type OpenDisputeProps = { dealId: bigint; busy: string | null; run: Run };

/** Cliente, trato entregado con árbitro y dentro del periodo de revisión. */
export function OpenDispute({ dealId, busy, run }: OpenDisputeProps) {
  return (
    <div className="dispute-box">
      <p className="muted small">
        ¿La entrega no cumple lo acordado? Abre una disputa antes de que termine la revisión: el pago queda
        bloqueado y el árbitro decide cómo se reparte.
      </p>
      <button
        className="btn btn-danger-ghost"
        disabled={!!busy}
        onClick={() => run(DISPUTE_LABEL, (w) => disputeDeal(w, dealId))}
      >
        {busy === DISPUTE_LABEL ? "Firmando…" : "Abrir disputa"}
      </button>
    </div>
  );
}

type ResolveProps = {
  dealId: bigint;
  amount: bigint;
  decimals: number;
  symbol: string;
  hasTeam: boolean;
  busy: string | null;
  run: Run;
};

/** Árbitro, trato en disputa: elige qué parte recibe el freelancer y el resto regresa al cliente. */
export function ResolveDispute({ dealId, amount, decimals, symbol, hasTeam, busy, run }: ResolveProps) {
  const [percent, setPercent] = useState("50");
  const bps = percentToBps(percent);
  const valid = bps !== null && bps <= BPS_TOTAL;
  const shares = valid ? resolutionShares(amount, bps) : null;
  const money = (units: bigint) => `${fromUnits(units, decimals)} ${symbol}`;

  return (
    <>
      <h3>Resolver la disputa</h3>
      <p className="muted">
        Eres el árbitro. Decide qué parte del pago recibe el freelancer; el resto regresa al cliente. 100 % libera
        todo y 0 % reembolsa todo.
      </p>
      <label>
        Para el freelancer (%)
        <input
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          inputMode="decimal"
          aria-describedby="resolve-preview"
        />
      </label>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={valid ? Number(formatBps(bps)) : 0}
        onChange={(e) => setPercent(e.target.value)}
        aria-label="Porcentaje para el freelancer"
      />
      {shares ? (
        <dl className="facts resolve-preview" id="resolve-preview">
          <dt>Freelancer{hasTeam ? " (se divide entre su equipo)" : ""}</dt>
          <dd>{money(shares.toFreelancer)}</dd>
          <dt>Cliente</dt>
          <dd>{money(shares.toClient)}</dd>
        </dl>
      ) : (
        <p className="small split-off" id="resolve-preview">
          Escribe un porcentaje de 0 a 100, con 2 decimales como máximo.
        </p>
      )}
      <button
        className="btn btn-primary btn-lg"
        disabled={!!busy || !valid}
        onClick={() => valid && run(RESOLVE_LABEL, (w) => resolveDispute(w, dealId, bps))}
      >
        {busy === RESOLVE_LABEL ? "Firmando…" : "Resolver y repartir el pago"}
      </button>
    </>
  );
}
