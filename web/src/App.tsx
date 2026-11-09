import { BrowserRouter, Route, Routes } from "react-router-dom";
import { WalletProvider } from "./wallet-context";
import { Header } from "./components";
import Home from "./pages/Home";
import NewDeal from "./pages/NewDeal";
import DealPage from "./pages/DealPage";

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
            <Route path="*" element={<p className="muted center">Página no encontrada.</p>} />
          </Routes>
        </main>
        <footer className="footer muted small">
          Trato · Stellar Testnet · Los fondos los custodia un contrato Soroban, no nosotros.
        </footer>
      </BrowserRouter>
    </WalletProvider>
  );
}
