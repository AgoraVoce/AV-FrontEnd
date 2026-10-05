import { Navigate, Route, Routes, Link } from "react-router-dom";
import { LoginPage } from "./auth/LoginPage";
import { ProtectedArea } from "./auth/ProtectedArea";
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
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/recepcao"
        element={<ProtectedArea role="RECEPCIONISTA" />}
      />
      <Route path="/medico" element={<ProtectedArea role="MEDICO" />} />
      <Route path="/admin" element={<ProtectedArea role="ADMIN" />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
