# Trato — cierra el trato, cobra seguro

**Links de pago con escrow en Stellar para freelancers.**

El freelancer crea un trato y comparte un link. El cliente deposita en USDC y el dinero queda
bloqueado en un contrato Soroban hasta la entrega:

- ✅ El cliente aprueba → el pago se libera al freelancer.
- ⏱️ El cliente no responde dentro del periodo de revisión → el freelancer cobra solo.
- ↩️ El freelancer no entrega antes de la fecha límite → el cliente recupera su dinero.

Nadie (ni nosotros) custodia los fondos: las reglas están en el contrato.

---

## El problema

Freelancers en LATAM que trabajan con clientes de otros países viven con un dilema:

- **Si cobran después**, se arriesgan a que el cliente desaparezca o "regatee" al final.
- **Si cobran antes**, el cliente es quien asume el riesgo, y muchos clientes no aceptan.
- Plataformas como Upwork/Fiverr resuelven esto con un escrow centralizado, pero cobran **10–20 % de comisión**,
  tardan días en liberar y exigen que el trabajo viva en su plataforma.

Trato es el escrow sin plataforma intermedia: un link, un contrato inteligente y USDC.

## ¿Por qué Stellar?

| Necesidad | Primitiva de Stellar |
|---|---|
| Custodia neutral con reglas de tiempo | Contrato **Soroban** (deadlines con `ledger().timestamp()`) |
| Dinero estable, no especulativo | **USDC** nativo en Stellar (vía Stellar Asset Contract) |
| Comisiones mínimas en pagos chicos | Fees de fracción de centavo, finalidad en ~5 s |
| Wallets de usuarios reales | **Stellar Wallets Kit** (Freighter/Varial, xBull, Lobstr, Albedo, Hana…) |
| Entrada/salida a moneda local | Ecosistema de anchors SEP-24 (roadmap) |

---

## Demo en Testnet

| | |
|---|---|
| **Contrato** | `CDC7UJLZ5ERDMJQB3GQUNEJOYO3CXVVYQHGFNWCBUOLCUT22T3CBJUZU` ([stellar.expert](https://stellar.expert/explorer/testnet/contract/CDC7UJLZ5ERDMJQB3GQUNEJOYO3CXVVYQHGFNWCBUOLCUT22T3CBJUZU)) |
| **Red** | Stellar Testnet |
| **App** | `APP_URL_PLACEHOLDER` |

### Flujo de demo (≈2 min)

1. **Freelancer** (wallet A): *Crear trato* → descripción, monto, fecha, revisión "2 minutos (demo)" → firma.
2. Copia el link de pago `/t/<id>`.
3. **Cliente** (wallet B, otro navegador o perfil): abre el link → *Depositar* → firma. Los fondos quedan en el contrato.
4. **Freelancer**: pega el link al entregable → *Marcar como entregado*.
5. **Cliente**: *Aprobar y pagar* → el freelancer recibe el pago.
   - Alternativa: si el cliente no responde en 2 min, el freelancer ve *Cobrar* y cobra solo.

Cada paso muestra el link de la transacción en stellar.expert.

> Para obtener XLM de testnet usa [Friendbot](https://lab.stellar.org/account/fund). Para USDC de testnet,
> agrega la trustline de USDC (emisor `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`) en tu wallet
> y usa el [faucet de Circle](https://faucet.circle.com/) (red Stellar).

---

## Arquitectura

```
 Navegador (React + Vite)
   │  Stellar Wallets Kit ── firma ──► Wallet del usuario
   │  stellar-sdk contract.Client (spec leída on-chain)
   ▼
 Soroban RPC (testnet) ──► Contrato Trato ──► Token SAC (USDC / XLM)
```

Sin backend ni base de datos: el estado de cada trato se lee directamente del contrato.

### Contrato (`contracts/trato`)

| Función | Quién | Qué hace |
|---|---|---|
| `create(freelancer, token, amount, title, delivery_deadline, review_period) -> u64` | Freelancer | Crea el trato (estado `Open`) |
| `fund(id, client)` | Cliente | Transfiere `amount` al contrato (`Funded`) |
| `deliver(id, evidence)` | Freelancer | Marca entrega antes del deadline (`Delivered`) |
| `release(id)` | Cliente | Paga al freelancer (`Released`) |
| `claim(id)` | Freelancer | Cobra si venció el periodo de revisión (`Released`) |
| `refund(id)` | Cliente | Recupera fondos si no hubo entrega a tiempo (`Refunded`) |
| `cancel(id)` | Freelancer | Cancela si nadie ha pagado (`Cancelled`) |
| `get(id)`, `count()` | Cualquiera | Lectura |

```
Open ──fund──► Funded ──deliver──► Delivered ──release / claim──► Released
  │                └──refund (deadline vencido)──► Refunded
  └──cancel──► Cancelled
```

Eventos: `DealCreated`, `DealFunded`, `DealDelivered`, `DealReleased{by_timeout}`, `DealRefunded`, `DealCancelled`.

---

## Correr localmente

### Requisitos
- Rust + target `wasm32v1-none` (`rustup target add wasm32v1-none`)
- [Stellar CLI](https://developers.stellar.org/docs/tools/cli)
- Node 20+

### Contrato

```bash
cargo test                       # tests unitarios
stellar contract build           # genera target/wasm32v1-none/release/trato.wasm
stellar keys generate deployer --network testnet --fund
stellar contract deploy --wasm target/wasm32v1-none/release/trato.wasm --source deployer --network testnet
```

### Frontend

```bash
cd web
cp .env.example .env             # pon el CONTRACT_ID
npm install
npm run dev
```

Variables (`web/.env`):

```
VITE_CONTRACT_ID=C...
VITE_RPC_URL=https://soroban-testnet.stellar.org
VITE_USDC_ID=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
VITE_XLM_ID=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

---

## Roadmap

- Disputas con árbitro elegido por ambas partes.
- Pagos por hitos (varios entregables en un trato).
- On/off-ramp a pesos vía anchors SEP-24.
- Notificaciones por email/WhatsApp al cambiar de estado.

## Herramientas del ecosistema
- [soroban-sdk](https://crates.io/crates/soroban-sdk) · [@stellar/stellar-sdk](https://www.npmjs.com/package/@stellar/stellar-sdk) · [Stellar Wallets Kit](https://stellarwalletskit.dev/) · Stellar CLI
