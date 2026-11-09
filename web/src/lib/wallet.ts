import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { CONFIG } from "./config";

let initialized = false;

export function initWallets() {
  if (initialized) return;
  StellarWalletsKit.init({
    modules: defaultModules(),
    network: Networks.TESTNET,
  });
  initialized = true;
}

export async function connectWallet(): Promise<string> {
  initWallets();
  const { address } = await StellarWalletsKit.authModal();
  return address;
}

export async function disconnectWallet() {
  await StellarWalletsKit.disconnect();
}

/** Firma usada por contract.Client de stellar-sdk. */
export async function signTx(
  xdr: string,
  opts?: { networkPassphrase?: string; address?: string },
): Promise<{ signedTxXdr: string; signerAddress?: string }> {
  initWallets();
  return StellarWalletsKit.signTransaction(xdr, {
    networkPassphrase: opts?.networkPassphrase ?? CONFIG.networkPassphrase,
    address: opts?.address,
  });
}
