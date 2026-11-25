import { contract, humanizeEvents, rpc } from "@stellar/stellar-sdk";

// Códigos del Stellar Asset Contract (USDC, XLM) que pueden salir al mover fondos.
const TOKEN_ERRORS: Record<number, string> = {
  // Sin el aviso de Friendbot: este archivo no importa la config para poder correrlo en Node.
  6: "Una de las cuentas no existe en la red: primero tiene que recibir XLM.",
  10: "Saldo insuficiente del token.",
  11: "El emisor del token congeló el saldo de una de las cuentas.",
  13: "Una de las cuentas no tiene trustline para este token. Agrégala desde la wallet.",
};

/** Error que lanzó el contrato del token (no Trato) al simular la transacción. */
export class TokenError extends Error {
  readonly code: number;

  constructor(code: number) {
    super(TOKEN_ERRORS[code] ?? `El token rechazó la operación (código ${code}).`);
    this.name = "TokenError";
    this.code = code;
  }
}

/**
 * Si la simulación falló dentro de otro contrato (el token), devuelve ese error.
 *
 * El SDK solo entrega "Error(Contract, #N)" y los códigos del token chocan con los de
 * Trato (#10 es saldo insuficiente en el token y TooEarly en Trato). El primer evento
 * "error" de la simulación lo emite el contrato donde nació el fallo.
 */
export function tokenErrorFrom(
  tx: contract.AssembledTransaction<unknown>,
  tratoContractId: string,
): TokenError | null {
  const sim = tx.simulation;
  if (!sim || !rpc.Api.isSimulationError(sim)) return null;
  const origin = humanizeEvents(sim.events).find((e) => e.topics[0] === "error");
  if (!origin?.contractId || origin.contractId === tratoContractId) return null;
  // Solo errores de contrato ({type:"contract"}); los de sistema (auth, budget) usan otra numeración.
  const detail = origin.topics[1] as { type?: unknown; code?: unknown } | undefined;
  return detail?.type === "contract" && typeof detail.code === "number" ? new TokenError(detail.code) : null;
}
