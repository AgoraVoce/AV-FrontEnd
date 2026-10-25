import { AdminDashboard } from "./integrations/AdminDashboard";
import { SpecialtiesPage } from "./features/specialties/Page";
import { RoomsPage } from "./features/rooms/Page";
import { DoctorsPage, OwnProfilePage } from "./features/doctors/Page";
import { ShiftsPage } from "./features/shifts/Page";
import { Navigate, Route, Routes, Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { RecoveryPage } from "./auth/RecoveryPage";
import { API_MODE } from "./auth/api";
import { LocalUnavailablePage } from "./integrations/LocalPages";
import { ReceptionWorkspace, PatientWorkspace, PatientSearchWorkspace } from "./integrations/ReceptionWorkspace";
import { DoctorWorkspace } from "./integrations/DoctorWorkspace";
import { StaffWorkspace } from "./integrations/StaffWorkspace";
import { LoginPage } from "./auth/LoginPage";
import { ProtectedArea } from "./auth/ProtectedArea";
import { QueuePage } from "./auth/reception/QueuePage";
import { PainelPublicoPage } from "./painel-publico/PainelPublicoPage";
import MedicoPage from "./pages/Medico";
import NovoCadastroPage from "./pages/NovoCadastro";
import AdminPage from "./pages/Admin";
import ReceptionUsersPage from "./pages/ReceptionUsers";
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
        <Route path="/recuperar-senha" element={API_MODE ? <LocalUnavailablePage title="Recuperação indisponível" description="O backend ainda não oferece recuperação de senha. Entre em contato com a administração para recuperar seu acesso." /> : <RecoveryPage />} />
        <Route
          path="/transmissao/tv"
          element={API_MODE ? <LocalUnavailablePage title="TV aguardando API" description="A tela pública exige uma sessão autorizada e uma API de transmissão. Não exibimos dados locais fictícios." /> : <PainelPublicoPage presentation="tv" />}
        />
        <Route
          path="/transmissao"
          element={API_MODE ? <LocalUnavailablePage title="Transmissão em integração" description="A API não oferece um canal público de chamadas. A fila de espera só pode ser consultada com credenciais da recepção." /> : <PainelPublicoPage presentation="admin" />}
        />
        <Route
          path="/recepcao"
          element={
            <ProtectedArea role="RECEPCIONISTA">
              {API_MODE ? <ReceptionWorkspace /> : <QueuePage />}
            </ProtectedArea>
          }
        />
        <Route
          path="/recepcao/usuarios"
          element={
            <ProtectedArea role="RECEPCIONISTA">
              {API_MODE ? <StaffWorkspace actor="RECEPCIONISTA" /> : <ReceptionUsersPage />}
            </ProtectedArea>
          }
        />
        <Route
          path="/novo-cadastro"
          element={
            <ProtectedArea role="RECEPCIONISTA">
              {API_MODE ? <PatientWorkspace /> : <NovoCadastroPage />}
            </ProtectedArea>
          }
        />
        <Route
          path="/pacientes"
          element={<ProtectedArea role="RECEPCIONISTA">{API_MODE ? <PatientSearchWorkspace /> : <Navigate to="/recepcao" replace />}</ProtectedArea>}
        />
        <Route
          path="/medico"
          element={<ProtectedArea role="MEDICO">{API_MODE ? <DoctorWorkspace view="dashboard" /> : <MedicoPage />}</ProtectedArea>}
        />
        {API_MODE && <>
          <Route path="/medico/fila" element={<ProtectedArea role="MEDICO"><DoctorWorkspace view="queue" /></ProtectedArea>} />
          <Route path="/medico/fila/:entryId" element={<ProtectedArea role="MEDICO"><DoctorWorkspace view="detail" /></ProtectedArea>} />
          <Route path="/medico/atendimento" element={<ProtectedArea role="MEDICO"><DoctorWorkspace view="current" /></ProtectedArea>} />
        </>}
        <Route path="/admin/novo-funcionario" element={<ProtectedArea role="ADMIN">{API_MODE ? <StaffWorkspace actor="ADMIN" view="create" /> : <Navigate to="/admin" replace />}</ProtectedArea>} />
        <Route
          path="/admin"
          element={
            <ProtectedArea role="ADMIN">
              {API_MODE ? <AdminDashboard /> : <AdminPage />}
            </ProtectedArea>
          }
        />
        {["usuarios", "fila", "relatorios"].map((section) => (
          <Route
            key={section}
            path={`/admin/${section}`}
            element={
              <ProtectedArea role="ADMIN">
                {API_MODE ? (section === "usuarios" ? <StaffWorkspace actor="ADMIN" /> : <LocalUnavailablePage title={section === "fila" ? "Fila administrativa ainda sem API" : "Relatórios ainda sem API"} description="Este módulo ainda depende de uma rota de consulta autorizada no backend. O painel não apresenta dados simulados como reais." />) : <AdminPage />}
              </ProtectedArea>
            }
          />
        ))}
        {API_MODE && (
          <>
            <Route
              path="/admin/especialidades"
              element={
                <ProtectedArea role="ADMIN">
                  <SpecialtiesPage />
                </ProtectedArea>
              }
            />
            <Route
              path="/admin/salas"
              element={
                <ProtectedArea role="ADMIN">
                  <RoomsPage />
                </ProtectedArea>
              }
            />
            <Route
              path="/admin/medicos"
              element={
                <ProtectedArea role="ADMIN">
                  <DoctorsPage />
                </ProtectedArea>
              }
            />
            <Route
              path="/admin/plantoes"
              element={
                <ProtectedArea role="ADMIN">
                  <ShiftsPage />
                </ProtectedArea>
              }
            />
            <Route
              path="/medico/perfil"
              element={
                <ProtectedArea role="MEDICO">
                  <OwnProfilePage />
                </ProtectedArea>
              }
            />
            <Route
              path="/medico/plantoes"
              element={
                <ProtectedArea role="MEDICO">
                  <ShiftsPage own />
                </ProtectedArea>
              }
            />
          </>
        )}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}
