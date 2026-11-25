import { useEffect, useState } from "react";
import { friendlyError, getReputation, type Reputation } from "../lib/trato";
import { fromUnits } from "../lib/format";

type Loaded = { freelancer: string; rep: Reputation } | { freelancer: string; error: string };

/** Historial on-chain del freelancer: lo escribe el contrato al cerrar cada trato y nadie lo puede editar. */
export function FreelancerReputation({ freelancer }: { freelancer: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let active = true;
    getReputation(freelancer)
      .then((rep) => active && setLoaded({ freelancer, rep }))
      .catch((e: unknown) => active && setLoaded({ freelancer, error: friendlyError(e) }));
    return () => {
      active = false;
    };
  }, [freelancer]);

  // Al cambiar de trato, no mostrar el historial del freelancer anterior mientras carga el nuevo.
  const current = loaded?.freelancer === freelancer ? loaded : null;

  return (
    <section className="reputation" aria-label="Historial del freelancer">
      <h4>Historial del freelancer</h4>
      {!current ? (
        <p className="muted small">Leyendo su historial en el contrato…</p>
      ) : "error" in current ? (
        <p className="muted small">No se pudo leer el historial: {current.error}</p>
      ) : (
        <ReputationStats rep={current.rep} />
      )}
    </section>
  );
}

function ReputationStats({ rep }: { rep: Reputation }) {
  if (rep.completed + rep.refunded + rep.disputed === 0) {
    return <p className="muted small">Todavía no tiene tratos cerrados en Trato.</p>;
  }
  return (
    <>
      <ul className="rep-stats">
        <li>
          <strong>{rep.completed}</strong>
          <span>cobrados</span>
        </li>
        <li>
          <strong>{rep.refunded}</strong>
          <span>reembolsados</span>
        </li>
        <li>
          <strong>{rep.disputed}</strong>
          <span>con disputa</span>
        </li>
        <li>
          <strong>{fromUnits(rep.volume)}</strong>
          <span>cobrado (todos los tokens)</span>
        </li>
      </ul>
      <p className="muted small">Lo registra el contrato al cerrar cada trato; nadie lo puede editar.</p>
    </>
  );
}
