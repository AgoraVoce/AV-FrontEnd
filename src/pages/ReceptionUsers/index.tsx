import { AppShell } from "../../components/AppShell";
import { usePageTitle } from "../../components/usePageTitle";
import { UsersSection } from "../Admin/sections";
import { STAFF } from "../Admin/team-data";
import "../Admin/admin-sections.css";

export default function ReceptionUsersPage() {
  usePageTitle("Gestão de Usuários | Recepção");
  return (
    <AppShell>
      <main className="admin-dashboard">
        <UsersSection initialUsers={STAFF} actorRole="RECEPCIONISTA" />
      </main>
    </AppShell>
  );
}
