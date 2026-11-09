import { Networks } from "@stellar/stellar-sdk";

export const CONFIG = {
  contractId: import.meta.env.VITE_CONTRACT_ID as string,
  rpcUrl: (import.meta.env.VITE_RPC_URL as string) ?? "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  explorer: "https://stellar.expert/explorer/testnet",
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
