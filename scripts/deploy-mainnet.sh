#!/usr/bin/env bash
# Despliega el contrato de Trato en mainnet (XLM real) e imprime las variables para el frontend.
#
# Uso:
#   SOURCE=<alias de stellar keys> ./scripts/deploy-mainnet.sh
#
# Variables:
#   SOURCE    (obligatoria) identidad de `stellar keys` que paga el deploy. La clave nunca va al repo.
#   RPC_URL   RPC de mainnet. Por defecto https://mainnet.sorobanrpc.com
#   NETWORK   nombre con el que se guarda la red en la CLI. Por defecto trato-mainnet
#   CONFIRM   ponerla en "mainnet" para saltar la confirmación (por ejemplo en una terminal sin TTY)
#
# El contrato no se puede actualizar: cada deploy es un Contract ID nuevo y los tratos empiezan en 0.
set -euo pipefail

RPC_URL="${RPC_URL:-https://mainnet.sorobanrpc.com}"
NETWORK="${NETWORK:-trato-mainnet}"
PASSPHRASE="Public Global Stellar Network ; September 2015"
USDC_ISSUER="GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" # Circle
WASM="target/wasm32v1-none/release/trato.wasm"

fail() {
  echo "Error: $*" >&2
  exit 1
}

cd "$(dirname "$0")/.."

command -v stellar >/dev/null || fail "no encuentro la Stellar CLI (stellar)."
command -v cargo >/dev/null || fail "no encuentro cargo."
[ -n "${SOURCE:-}" ] || fail "falta SOURCE, el alias de 'stellar keys' que paga el deploy."
case "$RPC_URL" in
  *testnet*) fail "RPC_URL apunta a testnet ($RPC_URL); este script es solo para mainnet." ;;
esac

ADDRESS="$(stellar keys address "$SOURCE" 2>/dev/null)" ||
  fail "no existe la identidad '$SOURCE'. Créala con: stellar keys generate $SOURCE (o add)."

echo "Red:     mainnet ($RPC_URL)"
echo "Cuenta:  $ADDRESS"
echo
if [ "${CONFIRM:-}" != "mainnet" ]; then
  read -r -p "Esto usa XLM real y el contrato no se puede actualizar. Escribe 'mainnet' para seguir: " answer
  [ "$answer" = "mainnet" ] || fail "cancelado."
fi

if ! stellar network ls | grep -qx "$NETWORK"; then
  stellar network add "$NETWORK" --rpc-url "$RPC_URL" --network-passphrase "$PASSPHRASE"
fi

echo "==> Tests del contrato"
cargo test --locked --quiet

echo "==> Compilando"
stellar contract build
[ -f "$WASM" ] || fail "no se generó $WASM."

echo "==> Desplegando"
CONTRACT_ID="$(stellar contract deploy --wasm "$WASM" --source "$SOURCE" --network "$NETWORK")"
[ -n "$CONTRACT_ID" ] || fail "el deploy no devolvió un Contract ID."

echo "==> Comprobando que responde (count debe ser 0)"
COUNT="$(stellar contract invoke --id "$CONTRACT_ID" --source "$SOURCE" --network "$NETWORK" -- count)"
[ "$COUNT" = "0" ] || fail "count devolvió '$COUNT' en lugar de 0."

XLM_ID="$(stellar contract id asset --asset native --network "$NETWORK")"
USDC_ID="$(stellar contract id asset --asset "USDC:$USDC_ISSUER" --network "$NETWORK")"

cat <<EOF

Listo. Variables para Vercel (o web/.env):

VITE_NETWORK=mainnet
VITE_CONTRACT_ID=$CONTRACT_ID
VITE_RPC_URL=$RPC_URL
VITE_USDC_ID=$USDC_ID
VITE_XLM_ID=$XLM_ID

Contrato en el explorador: https://stellar.expert/explorer/public/contract/$CONTRACT_ID
Después: regenerar web/src/lib/spec.ts si cambió el contrato y hacer redeploy en Vercel.
EOF
