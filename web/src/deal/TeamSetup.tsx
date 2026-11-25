import { useState } from "react";
import { setArbiter, setSplits, type Split, type TxResult } from "../lib/trato";
import {
  BPS_TOTAL,
  formatBps,
  MAX_SPLITS,
  parseArbiter,
  parseSplits,
  percentToBps,
  type SplitRow,
} from "../lib/team-input";
import { Notice } from "../components";

type Run = (label: string, fn: (who: string) => Promise<TxResult<unknown>>) => Promise<void>;

type Props = {
  dealId: bigint;
  freelancer: string;
  arbiter?: string;
  splits: Split[];
  busy: string | null;
  run: Run;
};

type EditableRow = SplitRow & { key: string };

const newRow = (recipient = "", percent = ""): EditableRow => ({ key: crypto.randomUUID(), recipient, percent });

const ARBITER_LABEL = "Árbitro asignado";
const SPLITS_LABEL = "Reparto del equipo";

/** Freelancer con el trato Open: propone árbitro y reparte el pago antes de que el cliente deposite. */
export function TeamSetup({ dealId, freelancer, arbiter, splits, busy, run }: Props) {
  const [arbiterInput, setArbiterInput] = useState(arbiter ?? "");
  const [rows, setRows] = useState<EditableRow[]>(() =>
    splits.length > 0
      ? splits.map((s) => newRow(s.recipient, formatBps(s.bps)))
      : [newRow(freelancer, "100")],
  );
  const [formError, setFormError] = useState<string | null>(null);

  const total = rows.reduce((sum, r) => sum + (percentToBps(r.percent) ?? 0), 0);

  function saveArbiter() {
    const parsed = parseArbiter(arbiterInput, freelancer);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    setFormError(null);
    void run(ARBITER_LABEL, (w) => setArbiter(w, dealId, parsed.value));
  }

  function saveSplits() {
    const parsed = parseSplits(rows);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    setFormError(null);
    void run(SPLITS_LABEL, (w) => setSplits(w, dealId, parsed.value));
  }

  const updateRow = (key: string, patch: Partial<SplitRow>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const removeRow = (key: string) => setRows((prev) => prev.filter((row) => row.key !== key));
  const addRow = () => setRows((prev) => [...prev, newRow()]);

  return (
    <details className="team-setup">
      <summary>Árbitro y reparto del equipo (opcional)</summary>
      <div className="team-setup-body">
        <p className="muted small">
          Solo se pueden fijar antes de que el cliente deposite: él los ve en este link antes de pagar.
        </p>

        <h4>Árbitro</h4>
        <p className="muted small">
          Si el cliente no está conforme con la entrega, abre una disputa y el árbitro decide cuánto recibe cada
          parte. Sin árbitro no hay disputas.
        </p>
        <input
          value={arbiterInput}
          onChange={(e) => setArbiterInput(e.target.value)}
          placeholder="G… del árbitro"
          spellCheck={false}
          aria-label="Dirección del árbitro"
        />
        <button className="btn btn-ghost" disabled={!!busy || !arbiterInput.trim()} onClick={saveArbiter}>
          {busy === ARBITER_LABEL ? "Firmando…" : arbiter ? "Cambiar árbitro" : "Asignar árbitro"}
        </button>

        <h4>Reparto del pago</h4>
        <p className="muted small">Cuando se libere el pago, se divide entre estas cuentas.</p>
        {rows.map((row, i) => (
          <div className="split-row" key={row.key}>
            <input
              value={row.recipient}
              onChange={(e) => updateRow(row.key, { recipient: e.target.value })}
              placeholder="G… del integrante"
              spellCheck={false}
              aria-label={`Dirección del integrante ${i + 1}`}
            />
            <input
              className="split-percent"
              value={row.percent}
              onChange={(e) => updateRow(row.key, { percent: e.target.value })}
              inputMode="decimal"
              placeholder="%"
              aria-label={`Porcentaje del integrante ${i + 1}`}
            />
            {rows.length > 1 && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => removeRow(row.key)}
                aria-label={`Quitar integrante ${i + 1}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <div className="split-foot">
          <span className={total === BPS_TOTAL ? "small" : "small split-off"}>Suma: {formatBps(total)} %</span>
          {rows.length < MAX_SPLITS && (
            <button type="button" className="btn btn-ghost" onClick={addRow}>
              + Integrante
            </button>
          )}
        </div>
        <button className="btn btn-ghost" disabled={!!busy} onClick={saveSplits}>
          {busy === SPLITS_LABEL ? "Firmando…" : "Guardar reparto"}
        </button>

        {formError && <Notice kind="error">{formError}</Notice>}
      </div>
    </details>
  );
}
