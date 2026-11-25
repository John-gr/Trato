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
| **Contrato** | `CDPC4FALI7CWB66RNGZMB72J2G2N5VLLEADKA45M3RGSFIDEJTTPMSYP` ([stellar.expert](https://stellar.expert/explorer/testnet/contract/CDPC4FALI7CWB66RNGZMB72J2G2N5VLLEADKA45M3RGSFIDEJTTPMSYP)) |
| **Red** | Stellar Testnet |
| **App** | [trato-webapp.vercel.app](https://trato-webapp.vercel.app/) |

### Flujo de demo (≈2 min)

1. **Freelancer** (wallet A): *Crear trato* → descripción, monto, fecha, revisión "2 minutos (demo)" → firma.
2. Copia el link de pago `/t/<id>`.
3. **Cliente** (wallet B, otro navegador o perfil): abre el link → *Depositar* → firma. Los fondos quedan en el contrato.
4. **Freelancer**: pega el link al entregable → *Marcar como entregado*.
5. **Cliente**: *Aprobar y pagar* → el freelancer recibe el pago.
   - Alternativa: si el cliente no responde en 2 min, el freelancer ve *Cobrar* y cobra solo.

Cada paso muestra el link de la transacción en stellar.expert.

### Pago directo con memo (`/pagar`)

Fuera del escrow, `/pagar` manda un pago clásico de XLM con memo de texto opcional, firmado con tu wallet.

- **Destino:** una dirección `G…` válida que no sea la tuya y que ya exista en la red.
- **Monto:** con punto decimal y hasta 7 decimales (ej. `1.5`).
- **Memo:** hasta 28 bytes en UTF-8 (un acento ocupa 2). Sirve para referencias o códigos de pago.

> Para obtener XLM de testnet usa [Friendbot](https://lab.stellar.org/account/fund). Para USDC de testnet,
> agrega la trustline de USDC (emisor `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`) en tu wallet
> y usa el [faucet de Circle](https://faucet.circle.com/) (red Stellar).

---

## Arquitectura

```
 Navegador (React + Vite)
   │  Stellar Wallets Kit ── firma ──► Wallet del usuario
   │  stellar-sdk contract.Client (spec del contrato incrustado en web/src/lib/spec.ts)
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
| `set_arbiter(id, arbiter)` | Freelancer | Propone un árbitro mientras el trato está `Open`; el cliente lo acepta al depositar (no puede ser el árbitro) |
| `set_splits(id, splits)` | Freelancer | Reparte el pago entre su equipo en bps (deben sumar 10 000, máx. 10 integrantes) mientras el trato está `Open` |
| `dispute(id)` | Cliente | Rechaza la entrega dentro del periodo de revisión; decide el árbitro (`Disputed`) |
| `resolve(id, freelancer_bps)` | Árbitro | Envía `freelancer_bps` al freelancer (o a su equipo) y el resto al cliente (`Resolved`) |
| `get(id)`, `count()`, `arbiter(id)`, `splits(id)`, `reputation(freelancer)` | Cualquiera | Lectura |

```
Open ──fund──► Funded ──deliver──► Delivered ──release / claim──► Released
  │                │                   └──dispute──► Disputed ──resolve──► Resolved
  │                └──refund (deadline vencido)──► Refunded
  └──cancel──► Cancelled
```

Eventos: `DealCreated`, `DealFunded`, `DealDelivered`, `DealReleased{by_timeout}`, `DealRefunded`, `DealCancelled`,
`ArbiterSet`, `SplitsSet`, `DealDisputed`, `DealResolved{freelancer_bps}`.

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
npm test                         # validación de pagos, reparto y disputas (node --test, Node 22.18+)
```

Variables (`web/.env`):

```
VITE_NETWORK=testnet
VITE_CONTRACT_ID=C...
VITE_RPC_URL=https://soroban-testnet.stellar.org
VITE_USDC_ID=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
VITE_XLM_ID=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

`VITE_NETWORK` elige la red al compilar: `testnet` (por defecto) o `mainnet`. Con ella cambian la passphrase
de las firmas, el explorador (stellar.expert) y los textos de la app. `VITE_RPC_URL` es opcional: si falta,
se usa `https://soroban-testnet.stellar.org` en testnet y `https://mainnet.sorobanrpc.com` en mainnet. Si
compilas para mainnet con un RPC de testnet, la app se detiene al arrancar con un error que lo explica.

---

### Deploy del frontend (Vercel)

1. Importa el repo en Vercel → **Root Directory:** `web` (Vite se detecta solo).
2. Agrega las variables `VITE_*` de arriba en *Environment Variables*.
3. Deploy. `web/vercel.json` ya redirige todas las rutas a `index.html` para que funcionen los links `/t/<id>`.

---

## Verificado en testnet

| Prueba | Tx |
|---|---|
| Deploy del contrato | [fda20f…](https://stellar.expert/explorer/testnet/tx/fda20f2b8f90d97a01425e6f681df7dabe06f5d3c522252cd8f65784790da492) |
| Trato #0 fondeado (25 XLM bloqueados) | [0971ef…](https://stellar.expert/explorer/testnet/tx/0971efe8b6740bcb99f42a2392d8507c7128dad06d94d9e42cde8e9e693cb737) |
| Trato #0 entregado | [042380…](https://stellar.expert/explorer/testnet/tx/0423807d7a7dcc317ec74d5fd7a64f8f7f72e8390ac329f507cab7a4ca92d059) |
| Trato #0 liberado por el cliente | [61b3ad…](https://stellar.expert/explorer/testnet/tx/61b3ad62ba2834e92a0711ec9051f1f5957d966e95afcebb9a08574de4de7717) |
| Trato #1 con árbitro asignado | [200f85…](https://stellar.expert/explorer/testnet/tx/200f856b0bf428bd28d38cbd044197b2f8047f5e84a9f049dbd75c7beab8b565) |
| Trato #1 disputado por el cliente | [282781…](https://stellar.expert/explorer/testnet/tx/282781faa59a4d7e86d8bb01399e7edf059b4776f3c561ed4a97592201d6618f) |
| Trato #1 resuelto por el árbitro (70 % al freelancer, 30 % al cliente) | [66aed8…](https://stellar.expert/explorer/testnet/tx/66aed86ab566d1d85e87f44cd458b4936d832253b9b2f7872777f4020f6b55ce) |
| Trato #12 creado (10 XLM) | [99a424…](https://stellar.expert/explorer/testnet/tx/99a4248528970fde31de754fc8c84f55c6aab2bfe8b58e02258a96358669845c) |
| Trato #12 con árbitro asignado | [0fbfe9…](https://stellar.expert/explorer/testnet/tx/0fbfe9a54e224acf89dba9c4ced5635f629ebd5c12d1d4a1b1fd9f13925b6433) |
| Trato #12 con reparto del equipo (70 % freelancer, 30 % integrante) | [452e5e…](https://stellar.expert/explorer/testnet/tx/452e5e3dd358903357f5433627694a2a18f130313ef56dc55cd736ababdcdb95) |
| Trato #12 fondeado por el cliente | [7c2aed…](https://stellar.expert/explorer/testnet/tx/7c2aed2a10ea2bd89135cf5e26d6f38e95b638ed9838296e64399bb779a329fe) |
| Trato #12 entregado | [348960…](https://stellar.expert/explorer/testnet/tx/348960a5da39cf85cc4b36e77490629622eb356c43576f2e94d5eaec178d71d9) |
| Trato #12 disputado por el cliente | [795d0f…](https://stellar.expert/explorer/testnet/tx/795d0fb2dd868d564363ab8ede3ab4d3e3e6368c89d6c52820441e9378b2bd72) |
| Trato #12 resuelto por el árbitro (60 % al lado del freelancer, 40 % al cliente) | [3b09ae…](https://stellar.expert/explorer/testnet/tx/3b09ae52d280a91df465efaf49eb81f991b32a80ffc470f301e2c1faf823d7fd) |

En el trato #2 el árbitro intentó depositar como cliente y el contrato lo rechazó (`Error(Contract, #15)`).
Después de los dos tratos, `reputation` del freelancer marca 2 completados, 1 disputa y 32 XLM de volumen.

El trato #12 recorre todas las funciones nuevas de punta a punta: la resolución mandó 6 XLM al lado del
freelancer y el reparto los dividió en 4.2 XLM para el freelancer y 1.8 XLM exactos para el integrante del
equipo; los otros 4 XLM regresaron al cliente. Se puede ver en la app en `/t/12`.

---

## 🚀 Lo que lanzamos el 27 de noviembre

Trato pasa de "un pago, un entregable" a **escrow para freelancers y equipos, por entregas y con
resolución de conflictos**, todo aplicado por el contrato Soroban:

| Lanzamiento | Qué resuelve | Cómo |
|---|---|---|
| **App pública en testnet** | Cualquiera puede probar el flujo completo con su wallet real | App en Vercel + contrato en testnet, flujo verificado con Freighter/Varial |
| **Pagos por hitos** | Proyectos largos: el cliente no paga todo de golpe y el freelancer cobra por avance | Un trato con varios entregables; cada hito se entrega, aprueba o cobra por timeout por separado |
| **Disputas con árbitro** | Hoy, si el cliente rechaza la entrega, no hay salida | Árbitro elegido por ambas partes al crear el trato; decide liberar, reembolsar o repartir |
| **Splits para equipos** | Colectivos y agencias pequeñas que se reparten el pago a mano | Al liberar, el contrato paga a varios integrantes según porcentajes (bps) |
| **Reputación on-chain** | El cliente no sabe si puede confiar en un freelancer nuevo | Contador de tratos completados y reembolsados por freelancer, visible en el link de pago |
| **Pagar con cualquier activo** | El cliente no siempre tiene USDC | El cliente paga con XLM u otro activo y el freelancer recibe USDC (path payments / DEX de Soroban) |

## Roadmap (después del lanzamiento)

- On/off-ramp a pesos vía anchors SEP-24.
- Wallets con passkeys para clientes sin extensión.
- Notificaciones por email/WhatsApp al cambiar de estado.

## Herramientas del ecosistema
- [soroban-sdk](https://crates.io/crates/soroban-sdk) · [@stellar/stellar-sdk](https://www.npmjs.com/package/@stellar/stellar-sdk) · [Stellar Wallets Kit](https://stellarwalletskit.dev/) · Stellar CLI
