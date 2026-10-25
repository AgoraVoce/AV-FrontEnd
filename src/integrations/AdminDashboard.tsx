import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowUpRight, CalendarClock, ClipboardCheck, ClipboardList, DoorOpen, RefreshCw, ShieldCheck, Stethoscope, UsersRound, HeartPulse, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { usePageTitle } from "../components/usePageTitle";
import { request } from "./client";
import { operations } from "./operational-api";
import "./local.css";
import "./operations.css";
import "./admin-dashboard.css";

type OperationalSnapshot = {
  date: string;
  waiting: number;
  called: number;
  inProgress: number;
  completedToday: number;
  cancelledToday: number;
};
type Snapshot = { operation: OperationalSnapshot | null; employees: number | null };
const shortcuts = [
  { to: "/admin/usuarios", title: "Funcionários", description: "Contas, perfis e acessos", icon: UsersRound },
  { to: "/admin/especialidades", title: "Especialidades", description: "Catálogo de áreas clínicas", icon: HeartPulse },
  { to: "/admin/medicos", title: "Médicos", description: "Cadastro profissional e vínculos", icon: Stethoscope },
  { to: "/admin/plantoes", title: "Plantões", description: "Escalas e disponibilidade", icon: CalendarClock },
  { to: "/admin/salas", title: "Salas", description: "Consultórios e infraestrutura", icon: DoorOpen },
];

export function AdminDashboard() {
  usePageTitle("Painel administrativo");
  const [snapshot, setSnapshot] = useState<Snapshot>({ operation: null, employees: null });
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setPending(true);
      const results = await Promise.allSettled([
        request("/admin/dashboard", "GET", undefined, controller.signal) as Promise<OperationalSnapshot>,
        operations.employees({ page: 1, pageSize: 1 }, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      setSnapshot({
        operation: results[0].status === "fulfilled" ? results[0].value : null,
        employees: results[1].status === "fulfilled" ? results[1].value.total : null,
      });
      setError(results.every((r) => r.status === "fulfilled")
        ? ""
        : "Alguns indicadores não puderam ser carregados. Verifique a conexão com a API e tente novamente.");
      setUpdated(new Date());
      setPending(false);
    }
    void load();
    return () => controller.abort();
  }, [revision]);
  const o = snapshot.operation;
  const cards = [
    { label: "Aguardando", value: o?.waiting, sub: "Na fila neste momento", icon: ClipboardList },
    { label: "Chamados", value: o?.called, sub: "Aguardando início de atendimento", icon: Activity },
    { label: "Em atendimento", value: o?.inProgress, sub: "Pacientes em consulta", icon: Stethoscope },
    { label: "Finalizados hoje", value: o?.completedToday, sub: "Atendimentos concluídos", icon: ClipboardCheck },
    { label: "Desistências hoje", value: o?.cancelledToday, sub: "Registros de saída", icon: ShieldCheck },
    { label: "Funcionários", value: snapshot.employees, sub: "Contas cadastradas", icon: UsersRound },
  ];
  return (
    <AppShell>
      <main className="local-page admin-live-dashboard">
        <header className="local-page-head admin-live-head">
          <div>
            <span className="local-eyebrow">Administração · Visão geral</span>
            <h1>Visão da operação</h1>
            <p>Indicadores reais do atendimento e acesso rápido à gestão clínica.</p>
          </div>
          <div className="admin-live-header-actions">
            <Link className="local-primary" to="/admin/novo-funcionario"><UserPlus size={17} aria-hidden="true" /> Novo funcionário</Link>
            <button className="local-secondary-button" type="button" onClick={refresh} disabled={pending}>
              <RefreshCw size={17} aria-hidden="true" /> {pending ? "Atualizando…" : "Atualizar painel"}
            </button>
          </div>
        </header>
        <section className="admin-live-overview" aria-label="Indicadores operacionais">
          {cards.map(({ label, value, sub, icon: Icon }) => (
            <article className="admin-live-kpi" key={label}>
              <div className="admin-live-kpi-head"><span>{label}</span><Icon size={19} aria-hidden="true" /></div>
              <strong aria-label={value == null ? label + ": indisponível" : label + ": " + value}>
                {value == null ? "—" : value.toLocaleString("pt-BR")}
              </strong>
              <small>{sub}</small>
            </article>
          ))}
        </section>
        {error && <div className="local-message is-error" role="alert">{error} <button type="button" className="local-secondary-button" onClick={refresh}>Tentar novamente</button></div>}
        <section className="admin-live-grid" aria-label="Gestão administrativa">
          <div className="admin-live-panel">
            <div className="admin-live-panel-heading">
              <div><span className="local-eyebrow">Acessos rápidos</span><h2>Gerencie a clínica</h2></div>
              <Link to="/admin/usuarios" className="admin-live-text-link">Ver equipe <ArrowUpRight size={16} aria-hidden="true" /></Link>
            </div>
            <div className="admin-live-links">
              {shortcuts.map(({ to, title, description, icon: Icon }) =>
                <Link key={to} to={to} className="admin-live-link">
                  <span className="admin-live-icon"><Icon size={21} aria-hidden="true" /></span>
                  <span><strong>{title}</strong><small>{description}</small></span>
                  <ArrowUpRight size={18} className="admin-live-arrow" aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
          <div className="admin-live-panel admin-live-today">
            <span className="local-eyebrow">Resumo de hoje</span>
            <h2>Fluxo de atendimentos</h2>
            <p>Dados retornados pelo backend, sem números demonstrativos.</p>
            <dl>
              <div><dt>Pacientes em espera</dt><dd>{o?.waiting ?? "—"}</dd></div>
              <div><dt>Chamados ou em consulta</dt><dd>{o ? o.called + o.inProgress : "—"}</dd></div>
              <div><dt>Atendimentos encerrados</dt><dd>{o?.completedToday ?? "—"}</dd></div>
              <div><dt>Desistências registradas</dt><dd>{o?.cancelledToday ?? "—"}</dd></div>
            </dl>
            <div className="admin-live-summary-note"><Activity size={16} aria-hidden="true" /> A fila e as reavaliações permanecem sob responsabilidade da recepção.</div>
          </div>
        </section>
        <footer className="admin-live-footer">
          <span>{updated ? "Atualizado às " + updated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) + " (Brasília)" : "Consultando API…"}</span>
          <span>{o?.date ? "Referência: " + o.date.split("-").reverse().join("/") : "Os números serão exibidos após resposta da API"}</span>
        </footer>
      </main>
    </AppShell>
  );
}
