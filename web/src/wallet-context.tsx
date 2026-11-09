import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { connectWallet, disconnectWallet, initWallets } from "./lib/wallet";

type WalletState = {
  address: string | null;
  connect: () => Promise<string | null>;
  disconnect: () => Promise<void>;
};

const Ctx = createContext<WalletState | null>(null);
const KEY = "trato:address";

function readSaved(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(readSaved);

  useEffect(() => initWallets(), []);

  const connect = async () => {
    try {
      const addr = await connectWallet();
      setAddress(addr);
      try {
        localStorage.setItem(KEY, addr);
      } catch {
        /* sin storage */
      }
      return addr;
    } catch {
      return null;
    }
  };

  const disconnect = async () => {
    await disconnectWallet().catch(() => {});
    setAddress(null);
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* sin storage */
    }
  };

  return <Ctx.Provider value={{ address, connect, disconnect }}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet fuera de WalletProvider");
  return v;
}
