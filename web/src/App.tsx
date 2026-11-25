import { BrowserRouter, Route, Routes } from "react-router-dom";
import { WalletProvider } from "./wallet-context";
import { Header } from "./components";
import { CONFIG } from "./lib/config";
import Home from "./pages/Home";
import NewDeal from "./pages/NewDeal";
import DealPage from "./pages/DealPage";
import PayPage from "./pages/PayPage";

export default function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <Header />
        <main className="main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/nuevo" element={<NewDeal />} />
            <Route path="/t/:id" element={<DealPage />} />
            <Route path="/pagar" element={<PayPage />} />
            <Route path="*" element={<p className="muted center">Página no encontrada.</p>} />
          </Routes>
        </main>
        <footer className="footer muted small">
          Trato · Stellar {CONFIG.networkLabel} · Los fondos los custodia un contrato Soroban, no nosotros.
        </footer>
      </BrowserRouter>
    </WalletProvider>
  );
}
