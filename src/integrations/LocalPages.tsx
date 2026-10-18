import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, RefreshCw, ShieldAlert, UserPlus } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { Brand } from "../components/Brand";
import { usePageTitle } from "../components/usePageTitle";
import {
  ApiError, createEmployee, createEntry, createPatient, getDoctorQueue, getWaitingQueue,
  type DoctorItem, type EmployeeRecord, type WaitingItem,
} from "./client";
import "./local.css";

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : "Não foi possível concluir a operação. Tente novamente.";
}
export function LocalUnavailablePage({ title, description }: { title: string; description: string }) {
  usePageTitle(title);
  return (
    <main className="session-page local-unavailable">
      <Brand />
      <ShieldAlert size={30} aria-hidden="true" />
      <h1>{title}</h1>
      <p>{description}</p>
      <Link className="primary-button" to="/login">Voltar ao acesso <ArrowRight size={16} aria-hidden="true" /></Link>
    </main>
  );
}
export function LocalQueuePage({ kind }: { kind: "reception" | "doctor" }) {
  usePageTitle(kind === "reception" ? "Fila de espera" : "Minha fila médica");
  const [items, setItems] = useState<Array<WaitingItem | DoctorItem>>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const load = useCallback(async (initial = false) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    if (initial) setLoading(true);
    else setRefreshing(true);
    try {
      const data = kind === "reception"
        ? await getWaitingQueue(controller.signal)
        : await getDoctorQueue(controller.signal);
      if (controller.signal.aborted) return;
      setItems(data);
      setError("");
      setUpdatedAt(new Date());
    } catch (cause) {
      if (controller.signal.aborted) return;
      setItems([]);
      setError(errorText(cause));
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [kind]);
  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => void load(), 30000);
    return () => { window.clearInterval(timer); activeRequest.current?.abort(); };
  }, [load]);
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return items.filter((item) =>
      !term || [item.fullName, item.queueCode ?? ""].some((value) =>
        value.toLocaleLowerCase("pt-BR").includes(term)
      )
    );
  }, [items, query]);
  const isDoctor = kind === "doctor";
  return (
    <AppShell>
      <div className="local-page">
        <header className="local-page-head">
          <div>
            <span className="local-eyebrow">Agora Você · Dados do backend</span>
            <h1>{isDoctor ? "Pacientes aguardando você" : "Fila de espera"}</h1>
            <p>{isDoctor
              ? "Somente entradas atribuídas ao seu cadastro médico, conforme autorização da API."
              : "Pacientes em espera registrados no servidor. A classificação clínica não é exposta neste endpoint."}</p>
          </div>
          <button type="button" className="local-primary" onClick={() => void load()} disabled={loading || refreshing}>
            <RefreshCw size={17} aria-hidden="true" /> {refreshing ? "Atualizando…" : "Atualizar fila"}
          </button>
        </header>
        <div className="local-toolbar">
          <div className="local-counter"><strong>{error || loading ? "—" : items.length}</strong><span>aguardando</span></div>
          <label className="local-search">Buscar por nome ou senha
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Digite para filtrar" />
          </label>
          <p className="local-updated" role="status">{updatedAt && !error
            ? "Sincronizado às " + updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
            : "Atualização automática a cada 30 segundos"}</p>
        </div>
        {error && <div className="local-message is-error" role="alert">{error}</div>}
        {loading ? <p className="local-message" role="status">Carregando dados da fila…</p>
          : !error && visible.length === 0 ? <div className="local-empty">
            <h2>{query ? "Nenhum resultado encontrado" : "Nenhum paciente aguardando"}</h2>
            <p>{query ? "Tente outro nome ou senha." : "Novas entradas registradas aparecerão aqui na próxima atualização."}</p>
          </div>
          : !error && (
            <div className="local-table-wrap">
              <table className="local-table">
                <thead><tr>
                  <th scope="col">Paciente</th><th scope="col">Senha</th>
                  {isDoctor && <><th scope="col">Classificação</th><th scope="col">Entrada</th><th scope="col">Sintomas</th></>}
                </tr></thead>
                <tbody>{visible.map((item) => (
                  <tr key={item.entryId}>
                    <td><strong>{item.fullName}</strong></td>
                    <td><span className="local-code">{item.queueCode || "Sem senha"}</span></td>
                    {"severity" in item && <>
                      <td><span className={"local-severity is-" + item.severity.toLowerCase()}>{item.severity}</span></td>
                      <td>{new Date(item.enteredAt).toLocaleString("pt-BR")}</td>
                      <td>{[...item.symptoms.map((s) => s.name), item.otherSymptoms].filter(Boolean).join("; ") || "Não informado"}
                        {item.shortNote && <small className="local-secondary">{item.shortNote}</small>}</td>
                    </>}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        {isDoctor
          ? <p className="local-note">A API atual permite consultar sua fila, mas ainda não permite chamar ou finalizar atendimentos. Nenhuma mudança de status é simulada.</p>
          : <div className="local-bottom"><Link className="local-primary" to="/novo-cadastro"><UserPlus size={17} aria-hidden="true" /> Cadastrar paciente</Link><p className="local-note">A inclusão na fila depende de uma entrada criada e confirmada na API.</p></div>}
      </div>
    </AppShell>
  );
}

type NewPatient = { fullName: string; cpf: string; birthDate: string; email: string; phone: string };
const EMPTY_PATIENT: NewPatient = { fullName: "", cpf: "", birthDate: "", email: "", phone: "" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function LocalPatientPage() {
  usePageTitle("Cadastro e entrada de paciente");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [patient, setPatient] = useState<NewPatient>(EMPTY_PATIENT);
  const [existingId, setExistingId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [registeredName, setRegisteredName] = useState("");
  const [severity, setSeverity] = useState<DoctorItem["severity"]>("VERDE");
  const [symptoms, setSymptoms] = useState("");
  const [note, setNote] = useState("");
  const [entryId, setEntryId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    setError("");
    if (mode === "existing") {
      if (!UUID.test(existingId.trim())) { setError("Informe um UUID válido do paciente cadastrado."); return; }
      setPatientId(existingId.trim());
      setRegisteredName("Paciente cadastrado");
      return;
    }
    if (!patient.fullName.trim() || !/^\d{11}$/.test(patient.cpf.replace(/\D/g, ""))) {
      setError("Preencha o nome e um CPF com 11 dígitos. O servidor validará os dígitos verificadores.");
      return;
    }
    locked.current = true;
    setBusy(true);
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const saved = await createPatient({
        fullName: patient.fullName.trim(), cpf: patient.cpf,
        ...(patient.birthDate ? { birthDate: patient.birthDate } : {}),
        ...(patient.email.trim() ? { email: patient.email.trim() } : {}),
        ...(patient.phone.trim() ? { phone: patient.phone.trim() } : {}),
      }, controller.signal);
      setPatientId(saved.id);
      setRegisteredName(saved.fullName);
      setError("");
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorText(cause));
    } finally {
      locked.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function registerEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || !patientId || !symptoms.trim()) return;
    locked.current = true;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const saved = await createEntry({
        patientId, severity, symptomIds: [], otherSymptoms: symptoms.trim(),
        ...(note.trim() ? { shortNote: note.trim() } : {}),
      }, controller.signal);
      setEntryId(saved.id);
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorText(cause));
    } finally {
      locked.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function startAgain() {
    setPatient(EMPTY_PATIENT); setExistingId(""); setPatientId(""); setRegisteredName("");
    setSymptoms(""); setNote(""); setSeverity("VERDE"); setEntryId(""); setError(""); setMode("new");
  }
  return (
    <AppShell>
      <div className="local-page">
        <header className="local-page-head">
          <div><span className="local-eyebrow">Recepção · PostgreSQL</span><h1>Cadastro e entrada</h1>
            <p>Cadastre a pessoa e, em seguida, confirme a entrada na fila. São duas operações reais e independentes.</p></div>
        </header>
        <div className="local-steps" aria-label="Etapas do atendimento">
          <span className={patientId ? "is-done" : "is-current"}>1. Identificação</span>
          <span className={entryId ? "is-done" : patientId ? "is-current" : ""}>2. Entrada na fila</span>
        </div>
        {error && <p className="local-message is-error" role="alert">{error}</p>}
        {!patientId && <form className="local-form" onSubmit={(event) => void register(event)}>
          <h2>Identificação do paciente</h2>
          <fieldset className="local-choice"><legend>Tipo de cadastro</legend>
            <label><input type="radio" checked={mode === "new"} onChange={() => { setMode("new"); setError(""); }} /> Novo paciente</label>
            <label><input type="radio" checked={mode === "existing"} onChange={() => { setMode("existing"); setError(""); }} /> Já cadastrado</label>
          </fieldset>
          {mode === "new" ? <div className="local-fields">
            <label>Nome completo *<input required maxLength={150} autoComplete="name" value={patient.fullName} onChange={(e) => setPatient((old) => ({ ...old, fullName: e.target.value }))} /></label>
            <label>CPF *<input required maxLength={14} inputMode="numeric" placeholder="000.000.000-00" value={patient.cpf} onChange={(e) => setPatient((old) => ({ ...old, cpf: e.target.value }))} /></label>
            <label>Data de nascimento<input type="date" value={patient.birthDate} onChange={(e) => setPatient((old) => ({ ...old, birthDate: e.target.value }))} /></label>
            <label>E-mail<input type="email" maxLength={255} value={patient.email} onChange={(e) => setPatient((old) => ({ ...old, email: e.target.value }))} /></label>
            <label>Telefone<input type="tel" maxLength={20} value={patient.phone} onChange={(e) => setPatient((old) => ({ ...old, phone: e.target.value }))} /></label>
          </div> : <div className="local-fields"><label>ID do paciente (UUID) *<input required value={existingId} onChange={(e) => setExistingId(e.target.value)} placeholder="UUID fornecido pelo cadastro" /></label>
            <p className="local-note">O backend ainda não oferece busca de pacientes por nome/CPF. Use somente o ID de um cadastro existente e confirmado.</p>
          </div>}
          <div className="local-actions"><button className="local-primary" type="submit" disabled={busy}>{busy ? "Salvando…" : "Continuar para entrada"} <ArrowRight size={16} aria-hidden="true" /></button></div>
        </form>}
        {patientId && !entryId && <form className="local-form" onSubmit={(event) => void registerEntry(event)}>
          <h2>Registrar entrada</h2>
          <div className="local-message is-success">Paciente: <strong>{registeredName}</strong><span className="local-secondary">ID: {patientId}</span></div>
          <div className="local-fields">
            <label>Classificação informada pela recepção *
              <select required value={severity} onChange={(e) => setSeverity(e.target.value as DoctorItem["severity"])}>
                <option value="VERDE">Verde</option><option value="AMARELO">Amarelo</option><option value="VERMELHO">Vermelho</option>
              </select>
            </label>
            <label className="local-wide">Sintomas / queixa relatada *<textarea required maxLength={2000} rows={4} value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="Descreva os sintomas relatados" /></label>
            <label className="local-wide">Observação opcional<textarea maxLength={500} rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          </div>
          <p className="local-note">A cor é informada manualmente: este formulário não realiza classificação clínica automática. A entrada fica sem médico e sem senha até que APIs para essas operações estejam disponíveis.</p>
          <div className="local-actions"><button className="local-primary" type="submit" disabled={busy || !symptoms.trim()}>{busy ? "Registrando…" : "Confirmar entrada no servidor"}</button></div>
        </form>}
        {entryId && <div className="local-form local-complete" role="status">
          <CheckCircle2 size={35} aria-hidden="true" /><h2>Entrada registrada com sucesso</h2>
          <p>O paciente está em espera. As alterações foram gravadas pelo backend.</p>
          <p className="local-secondary">Entrada: {entryId}</p>
          <div className="local-actions"><Link className="local-primary" to="/recepcao">Consultar fila</Link><button type="button" className="local-secondary-button" onClick={startAgain}>Novo atendimento</button></div>
        </div>}
      </div>
    </AppShell>
  );
}
export function LocalStaffPage({ actor }: { actor: "ADMIN" | "RECEPCIONISTA" }) {
  usePageTitle("Gestão de funcionários");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<EmployeeRecord["role"]>("MEDICO");
  const [created, setCreated] = useState<EmployeeRecord[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || actor !== "ADMIN") return;
    locked.current = true; setBusy(true); setError("");
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const record = await createEmployee({ name: name.trim(), email: email.trim(), password, role }, controller.signal);
      setCreated((old) => [record, ...old]); setName(""); setEmail(""); setPassword("");
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorText(cause));
    } finally {
      locked.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <AppShell>
      <div className="local-page">
        <header className="local-page-head"><div><span className="local-eyebrow">Gestão de acessos · API local</span><h1>Funcionários</h1>
          <p>Cadastros enviados ao backend de verdade, respeitando o perfil autenticado.</p></div></header>
        {actor !== "ADMIN" ? <div className="local-empty">
          <ShieldAlert size={28} aria-hidden="true" /><h2>Cadastro restrito ao administrador</h2>
          <p>O backend autoriza POST /employees exclusivamente para ADMIN. A recepção não pode cadastrar ou consultar funcionários nesta versão da API.</p>
          <Link className="local-primary" to="/recepcao">Voltar à recepção</Link>
        </div> : <>
          {error && <p className="local-message is-error" role="alert">{error}</p>}
          <form className="local-form" onSubmit={(event) => void save(event)}>
            <h2>Novo funcionário</h2>
            <div className="local-fields">
              <label>Nome completo *<input required maxLength={150} minLength={2} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label>E-mail corporativo *<input required type="email" maxLength={150} autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label>Senha inicial *<input required type="password" minLength={8} maxLength={1024} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
              <label>Perfil *<select required value={role} onChange={(e) => setRole(e.target.value as EmployeeRecord["role"])}>
                <option value="MEDICO">Médico</option><option value="RECEPCIONISTA">Recepcionista</option><option value="ADMIN">Administrador</option>
              </select></label>
            </div>
            <div className="local-actions"><button className="local-primary" type="submit" disabled={busy || !name.trim() || !email.trim() || password.length < 8}>{busy ? "Cadastrando…" : "Criar conta no backend"} <UserPlus size={17} aria-hidden="true" /></button></div>
          </form>
          <section className="local-form" aria-labelledby="local-new-staff"><h2 id="local-new-staff">Cadastros desta sessão</h2>
            <p className="local-note">A API ainda não possui GET /employees; por isso esta lista contém somente cadastros confirmados nesta aba. Não é uma lista completa do banco.</p>
            {created.length === 0 ? <p className="local-secondary">Nenhuma conta criada nesta sessão.</p> :
              <div className="local-table-wrap"><table className="local-table"><thead><tr><th scope="col">Nome</th><th scope="col">E-mail</th><th scope="col">Perfil</th></tr></thead>
                <tbody>{created.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td>{user.role}</td></tr>)}</tbody></table></div>}
          </section>
        </>}
      </div>
    </AppShell>
  );
}
