# Lanzar Trato en mainnet

Guía para desplegar el contrato en la red principal de Stellar (XLM real) y apuntar la app a él. Está
pensada para el lanzamiento del 27 de noviembre, pero sirve para cualquier deploy nuevo.

> El contrato **no se puede actualizar** (no tiene función `upgrade`). Cada deploy es un Contract ID
> nuevo y los tratos empiezan otra vez en 0. Antes de desplegar, el código del contrato tiene que estar
> congelado y con los tests en verde.

## 1. Antes de empezar

- Rust con el target `wasm32v1-none` y la Stellar CLI (en este equipo se corren desde WSL).
- `cargo test` en verde. El script lo vuelve a correr y se detiene si algo falla.
- Una cuenta de mainnet con XLM para pagar el deploy y las pruebas. Con unos **10 XLM** sobra: el deploy
  cuesta centavos, pero la cuenta necesita su reserva mínima y saldo para probar.

## 2. La cuenta que despliega

La clave vive solo en la Stellar CLI de quien despliega. **Nunca** se escribe en el repo, en `.env` ni en
un chat.

```bash
stellar keys generate trato-mainnet-deployer   # o: stellar keys add trato-mainnet-deployer
stellar keys address trato-mainnet-deployer    # la dirección G... a la que se mandan los XLM
```

En mainnet no hay Friendbot: hay que mandarle XLM desde un exchange o desde otra wallet.

## 3. Desplegar

Desde la raíz del repo:

```bash
SOURCE=trato-mainnet-deployer ./scripts/deploy-mainnet.sh
```

El script:

1. Revisa que exista la identidad y que el RPC no sea de testnet.
2. Pide escribir `mainnet` para confirmar.
3. Agrega la red `trato-mainnet` a la CLI si no existe (RPC por defecto: `https://mainnet.sorobanrpc.com`).
4. Corre `cargo test`, compila con `stellar contract build` y despliega el wasm.
5. Llama a `count` en el contrato nuevo y se detiene si no devuelve `0`.
6. Calcula los contratos de XLM y USDC (Circle) en mainnet e imprime las variables del frontend.

Para otro RPC: `RPC_URL=https://... SOURCE=... ./scripts/deploy-mainnet.sh`.

## 4. Probar con montos chicos

Antes de anunciarlo, hacer un trato real de punta a punta con 1 XLM, con dos wallets distintas
(freelancer y cliente):

1. `create` desde `/nuevo` con un deadline corto.
2. `fund` desde el link `/t/<id>` con la otra wallet.
3. `deliver` y luego `release` (o esperar el periodo de revisión y hacer `claim`).
4. Revisar las transacciones en `https://stellar.expert/explorer/public/contract/<CONTRACT_ID>`.

Si se quiere probar USDC, la wallet del cliente necesita la trustline de USDC de Circle.

## 5. Apuntar la app al contrato nuevo

Las variables que imprime el script van en Vercel (y en `web/.env` para probar en local):

```
VITE_NETWORK=mainnet
VITE_CONTRACT_ID=C...
VITE_RPC_URL=https://mainnet.sorobanrpc.com
VITE_USDC_ID=CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75
VITE_XLM_ID=CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA
```

La app se niega a arrancar si `VITE_NETWORK` está mal escrita o si es `mainnet` con un RPC de testnet
(`web/src/lib/config.ts`). Después de cambiar variables en Vercel hay que hacer redeploy.

`web/src/lib/spec.ts` solo cambia si cambió el código del contrato. Si se despliega el mismo wasm que
está en testnet, basta con actualizar en su encabezado el Contract ID al que corresponde.

Testnet puede seguir viva en una URL de preview de Vercel con las variables de testnet, para la demo.

## 6. Después del deploy

- README: Contract ID de mainnet, link a stellar.expert y los hashes del trato de prueba.
- `web/.env.example`: dejar testnet por defecto y anotar el Contract ID de mainnet en un comentario.
- Los links de pago viejos (`/t/<id>` de testnet) abren otro trato si la app ya apunta a mainnet.
