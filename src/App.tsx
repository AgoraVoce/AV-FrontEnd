import { AdminDashboard } from "./integrations/AdminDashboard";
import { SpecialtiesPage } from "./features/specialties/Page";
import { DoctorsDirectory, DoctorShiftsAdmin } from "./integrations/ProfessionalWorkspaces";
import { RoomsPage } from "./features/rooms/Page";
import { OwnProfilePage } from "./features/doctors/Page";
import { ShiftsPage } from "./features/shifts/Page";
import { Navigate, Route, Routes, Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { RecoveryPage } from "./auth/RecoveryPage";
import { ApiPasswordResetPage } from "./auth/ApiPasswordResetPage";
import { PublicCallsScreen } from "./integrations/PublicCallsScreen";
import { TicketDesk } from "./integrations/TicketDesk";
import { EntryHistoryPage, ReportsPage } from "./integrations/ClinicDataPages";
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
      onAnimationStart={(event) => {
        // Do not restart the page transition when a nested spinner or toast animates.
        if (event.target === event.currentTarget) setHasNavigated(true);
      }}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/recuperar-senha" element={API_MODE ? <ApiPasswordResetPage /> : <RecoveryPage />} />
        <Route path="/reset-password" element={<ApiPasswordResetPage />} />
        <Route
          path="/transmissao/tv"
          element={API_MODE ? <PublicCallsScreen presentation="tv" /> : <PainelPublicoPage presentation="tv" />}
        />
        <Route
          path="/transmissao"
          element={API_MODE ? <PublicCallsScreen presentation="admin" /> : <PainelPublicoPage presentation="admin" />}
        />
        <Route
          path="/recepcao"
          element={
            <ProtectedArea role="RECEPCIONISTA">
              {API_MODE ? <ReceptionWorkspace /> : <QueuePage />}
            </ProtectedArea>
          }
        />
        {API_MODE && <Route path="/recepcao/senhas" element={<ProtectedArea role="RECEPCIONISTA"><TicketDesk /></ProtectedArea>} />}
        {API_MODE && <Route path="/recepcao/entradas" element={<ProtectedArea role="RECEPCIONISTA"><EntryHistoryPage kind="reception" /></ProtectedArea>} />}
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
          <Route path="/medico/historico" element={<ProtectedArea role="MEDICO"><EntryHistoryPage kind="doctor" /></ProtectedArea>} />
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
                {API_MODE ? (section === "usuarios" ? <StaffWorkspace actor="ADMIN" /> : section === "relatorios" ? <ReportsPage /> : <LocalUnavailablePage title="Fila administrativa sem permissão na API" description="A consulta geral de entradas exige perfil de recepção. Não exibimos dados não autorizados." />) : <AdminPage />}
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
                  <DoctorsDirectory />
                </ProtectedArea>
              }
            />
            <Route
              path="/admin/plantoes"
              element={
                <ProtectedArea role="ADMIN">
                  <DoctorShiftsAdmin />
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
