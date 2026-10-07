import { Navigate, Route, Routes, Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { RecoveryPage } from "./auth/RecoveryPage";
import { LoginPage } from "./auth/LoginPage";
import { ProtectedArea } from "./auth/ProtectedArea";
import { QueuePage } from "./auth/reception/QueuePage";
import { PainelPublicoPage } from "./painel-publico/PainelPublicoPage";
import NovoCadastroPage from "./pages/NovoCadastro";
import { usePageTitle } from "./components/usePageTitle";
function NotFound() {
  usePageTitle("Página não encontrada");
  return (
    <main className="session-page">
      <h1>Página não encontrada.</h1>
      <p>Confira o endereço ou volte para o acesso.</p>
      <Link className="primary-button" to="/login">
        Voltar para o login
      </Link>
    </main>
  );
}
export default function App() {
  const location = useLocation();
  const [initialLocationKey] = useState(location.key);
  const [hasNavigated, setHasNavigated] = useState(false);
  const routeChanged = hasNavigated || location.key !== initialLocationKey;

  return (
    <div
      key={location.pathname}
      className={`route-transition${routeChanged ? " is-entering" : ""}`}
      onAnimationStart={() => setHasNavigated(true)}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/recuperar-senha" element={<RecoveryPage />} />
        <Route path="/transmissao" element={<PainelPublicoPage />} />
        <Route
          path="/recepcao"
          element={<ProtectedArea role="RECEPCIONISTA"><QueuePage /></ProtectedArea>}
        />
        <Route
          path="/novo-cadastro"
          element={<ProtectedArea role="RECEPCIONISTA"><NovoCadastroPage /></ProtectedArea>}
        />
        <Route path="/medico" element={<ProtectedArea role="MEDICO" />} />
        <Route path="/admin" element={<ProtectedArea role="ADMIN" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}
