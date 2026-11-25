import { accountUrl } from "../lib/config";
import { short } from "../lib/format";
import { formatBps } from "../lib/team-input";
import type { Split } from "../lib/trato";

type Props = { arbiter?: string; splits: Split[]; address: string | null };

function AccountLink({ account, address }: { account: string; address: string | null }) {
  return (
    <>
      <a href={accountUrl(account)} target="_blank" rel="noreferrer">
        {short(account)}
      </a>
      {address === account && <span className="you">tú</span>}
    </>
  );
}

/** Filas de la ficha del trato con el árbitro y el reparto: el cliente los ve antes de pagar. */
export function TeamFacts({ arbiter, splits, address }: Props) {
  return (
    <>
      <dt>Árbitro</dt>
      <dd>
        {arbiter ? (
          <AccountLink account={arbiter} address={address} />
        ) : (
          <span className="muted">sin árbitro: no admite disputas</span>
        )}
      </dd>
      {splits.length > 0 && (
        <>
          <dt>Reparto</dt>
          <dd>
            <ul className="split-list">
              {splits.map((s) => (
                <li key={s.recipient}>
                  <strong>{formatBps(s.bps)} %</strong> · <AccountLink account={s.recipient} address={address} />
                </li>
              ))}
            </ul>
          </dd>
        </>
      )}
    </>
  );
}
