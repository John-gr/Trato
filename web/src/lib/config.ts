import { Networks } from "@stellar/stellar-sdk";

// VITE_NETWORK elige la red al compilar: "testnet" (por defecto) o "mainnet".
type NetworkName = "testnet" | "mainnet";

type NetworkPreset = {
  label: string;
  passphrase: string;
  defaultRpcUrl: string;
  explorer: string;
  /** Qué hacer cuando una cuenta todavía no existe en esta red. */
  activateHint: string;
};

const NETWORKS: Record<NetworkName, NetworkPreset> = {
  testnet: {
    label: "Testnet",
    passphrase: Networks.TESTNET,
    defaultRpcUrl: "https://soroban-testnet.stellar.org",
    explorer: "https://stellar.expert/explorer/testnet",
    activateHint: "Fondéala con Friendbot.",
  },
  mainnet: {
    label: "Mainnet",
    passphrase: Networks.PUBLIC,
    // RPC público sin API key (lista de proveedores en developers.stellar.org/docs/data/apis/rpc/providers).
    defaultRpcUrl: "https://mainnet.sorobanrpc.com",
    explorer: "https://stellar.expert/explorer/public",
    activateHint: "Tiene que recibir al menos 1 XLM para activarse.",
  },
};

// Falla al arrancar si la red está mal escrita: compilar para mainnet con la passphrase de testnet
// (o al revés) haría que todas las firmas fallen sin explicar por qué.
function parseNetwork(raw: string | undefined): NetworkName {
  const value = (raw || "testnet").trim().toLowerCase();
  if (value === "testnet" || value === "mainnet") return value;
  throw new Error(`VITE_NETWORK inválida: "${raw}". Usa "testnet" o "mainnet".`);
}

// Al pasar a mainnet es fácil olvidar el VITE_RPC_URL de testnet: se firmaría para una red y se
// enviaría a la otra.
function resolveRpcUrl(name: NetworkName, raw: string | undefined): string {
  const url = (raw || "").trim() || NETWORKS[name].defaultRpcUrl;
  if (name === "mainnet" && /testnet/i.test(url)) {
    throw new Error(`VITE_RPC_URL apunta a testnet (${url}) pero VITE_NETWORK es mainnet.`);
  }
  return url;
}

const network = parseNetwork(import.meta.env.VITE_NETWORK as string | undefined);
const preset = NETWORKS[network];

export const CONFIG = {
  network,
  isTestnet: network === "testnet",
  networkLabel: preset.label,
  activateHint: preset.activateHint,
  contractId: import.meta.env.VITE_CONTRACT_ID as string,
  rpcUrl: resolveRpcUrl(network, import.meta.env.VITE_RPC_URL as string | undefined),
  networkPassphrase: preset.passphrase,
  explorer: preset.explorer,
};

export type TokenInfo = { symbol: string; id: string; decimals: number };

export const TOKENS: TokenInfo[] = [
  {
    symbol: "USDC",
    id: (import.meta.env.VITE_USDC_ID as string) ?? "",
    decimals: 7,
  },
  {
    symbol: "XLM",
    id: (import.meta.env.VITE_XLM_ID as string) ?? "",
    decimals: 7,
  },
].filter((t) => t.id);

export function tokenById(id: string): TokenInfo {
  return TOKENS.find((t) => t.id === id) ?? { symbol: "TOKEN", id, decimals: 7 };
}

export const txUrl = (hash: string) => `${CONFIG.explorer}/tx/${hash}`;
export const accountUrl = (addr: string) => `${CONFIG.explorer}/account/${addr}`;
export const contractUrl = (id: string) => `${CONFIG.explorer}/contract/${id}`;
