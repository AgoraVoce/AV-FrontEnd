import { extended, type ClinicDashboard } from "./extended-api";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { usePageTitle } from "../components/usePageTitle";
import { useToast } from "../components/useToast";
import { useAuth } from "../auth/context";
import { ApiError, getDoctorQueue, type DoctorItem } from "./client";
import { operations, type EntryDetail } from "./operational-api";
import { errorText, formatDate } from "./shared-helpers";
import { RiskPill, StatePill } from "./shared-ui";
import { PrescriptionForm } from "../features/prescriptions/PrescriptionForm";
import {
  clearPrescriptionDraft,
  createDraftMedicationId,
  emptyPrescriptionDraft,
  getEntrySymptomNames,
  getPrescriptionDraft,
  getPrescriptionDraftEtag,
  setEntrySymptomNames,
  setPrescriptionDraft,
  setPrescriptionDraftEtag,
  type PrescriptionDraft,
} from "../features/prescriptions/draft-store";
import { prescriptionFromDraft } from "../features/prescriptions/model";
import "./local.css";
import "./operations.css";

function cacheKey(userId: string) {
  return "av:active-entry:" + userId;
}

export function DoctorWorkspace({
  view = "dashboard",
}: {
  view?: "dashboard" | "queue" | "detail" | "current";
}) {
  const heading =
    view === "dashboard"
      ? "Dashboard médico"
      : view === "queue"
        ? "Minha fila"
        : view === "detail"
          ? "Detalhes do paciente"
          : "Paciente atual";
  usePageTitle(heading);
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { entryId } = useParams<{ entryId: string }>();
  const { state, signOut } = useAuth();
  const doctorName =
    state.status === "authenticated" ? state.user.name : "Médico";
  const userId = state.status === "authenticated" ? state.user.id : "";
  const [queue, setQueue] = useState<DoctorItem[]>([]);
  const [queueError, setQueueError] = useState(false);
  const [profileUnavailable, setProfileUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<
    | ""
    | "calling"
    | "starting"
    | "finishing"
    | "reconciling"
    | "discarding"
    | "signing-out"
  >("");
  const [active, setActive] = useState<EntryDetail | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [dashboard, setDashboard] = useState<ClinicDashboard | null>(null);
  const [detail, setDetail] = useState<EntryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(view === "detail");
  const [detailFailed, setDetailFailed] = useState(false);
  const [detailRevision, setDetailRevision] = useState(0);
  const [draftState, setDraftState] = useState<{
    key: string;
    value: PrescriptionDraft;
  }>({ key: "", value: emptyPrescriptionDraft() });
  const [formErrorsState, setFormErrorsState] = useState<{
    key: string;
    errors: Record<string, string>;
  }>({ key: "", errors: {} });
  const [reviewedDraftKey, setReviewedDraftKey] = useState("");
  const [showFormFor, setShowFormFor] = useState<string | null>(null);
  const [finalizationState, setFinalizationState] = useState<{
    key: string;
    message: string;
    uncertain: boolean;
  }>({ key: "", message: "", uncertain: false });
  const [navigationTarget, setNavigationTarget] = useState<string | null>(null);
  const [draftSync, setDraftSync] = useState<{
    key: string;
    status: "loading" | "saved" | "dirty" | "saving" | "error" | "conflict";
    message: string;
  }>({ key: "", status: "loading", message: "" });
  const continueEditingRef = useRef<HTMLButtonElement>(null);
  const ongoing = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const currentVisit = useRef<{
    pathname: string;
    userId: string;
    entryId: string | null;
  }>({
    pathname: location.pathname,
    userId: "",
    entryId: null,
  });
  const lock = useRef(false);
  const draftSyncRef = useRef<{
    key: string;
    etag: string | null;
    revision: number;
    queue: Promise<void>;
    loadRevision: number;
  }>({
    key: "",
    etag: null,
    revision: 0,
    queue: Promise.resolve(),
    loadRevision: 0,
  });
  const draftKey = active && userId ? JSON.stringify([userId, active.id]) : "";
  const draft =
    draftKey && draftState.key === draftKey
      ? draftState.value
      : active && userId
        ? getPrescriptionDraft(userId, active.id)
        : emptyPrescriptionDraft();
  const formErrors =
    formErrorsState.key === draftKey ? formErrorsState.errors : {};
  const review = Boolean(draftKey && reviewedDraftKey === draftKey);
  const showForm = Boolean(active && showFormFor === active.id);
  const finalization =
    finalizationState.key === draftKey
      ? finalizationState
      : { key: draftKey, message: "", uncertain: false };

  useLayoutEffect(() => {
    currentVisit.current = {
      pathname: location.pathname,
      userId,
      entryId: active?.id ?? null,
    };
  }, [active?.id, location.pathname, userId]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    const onEntryCompleted = (event: Event) => {
      const detail = (
        event as CustomEvent<{ actorId: string; entryId: string }>
      ).detail;
      if (detail?.actorId !== userId || !detail.entryId) return;
      const completedKey = JSON.stringify([userId, detail.entryId]);
      if (active?.id === detail.entryId) setActive(null);
      if (draftState.key === completedKey) {
        setDraftState({ key: completedKey, value: emptyPrescriptionDraft() });
        setFormErrorsState({ key: completedKey, errors: {} });
        setReviewedDraftKey("");
        setShowFormFor(null);
        setFinalizationState({
          key: completedKey,
          message: "",
          uncertain: false,
        });
      }
      if (sessionStorage.getItem(cacheKey(userId)) === detail.entryId)
        sessionStorage.removeItem(cacheKey(userId));
    };
    window.addEventListener("av:entry-completed", onEntryCompleted);
    return () =>
      window.removeEventListener("av:entry-completed", onEntryCompleted);
  }, [active?.id, draftState.key, userId]);

  useEffect(() => {
    const clearDraftFromAuthContext = () => {
      draftSyncRef.current = {
        key: "",
        etag: null,
        revision: draftSyncRef.current.revision + 1,
        queue: Promise.resolve(),
        loadRevision: draftSyncRef.current.loadRevision + 1,
      };
      setDraftState({ key: "", value: emptyPrescriptionDraft() });
      setDraftSync({ key: "", status: "loading", message: "" });
      setFormErrorsState({ key: "", errors: {} });
      setReviewedDraftKey("");
      setShowFormFor(null);
      setFinalizationState({ key: "", message: "", uncertain: false });
      setNavigationTarget(null);
    };
    window.addEventListener(
      "av:auth-context-changed",
      clearDraftFromAuthContext,
    );
    return () =>
      window.removeEventListener(
        "av:auth-context-changed",
        clearDraftFromAuthContext,
      );
  }, []);

  function isCurrentVisit(actorId: string, id: string) {
    const current = currentVisit.current;
    return (
      mounted.current &&
      current.pathname === "/medico/atendimento" &&
      current.userId === actorId &&
      current.entryId === id
    );
  }

  useEffect(() => {
    if (
      !draft.changed &&
      busy !== "finishing" &&
      busy !== "reconciling" &&
      busy !== "discarding"
    )
      return;
    const preventExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventExit);
    return () => window.removeEventListener("beforeunload", preventExit);
  }, [draft.changed, busy]);

  useEffect(() => {
    if (navigationTarget) continueEditingRef.current?.focus();
  }, [navigationTarget]);

  const refresh = useCallback(
    async (initial = false) => {
      ongoing.current?.abort();
      const controller = new AbortController();
      ongoing.current = controller;
      if (initial) setLoading(true);
      try {
        const result = await getDoctorQueue(controller.signal);
        if (!controller.signal.aborted) {
          setQueue(result);
          setQueueError(false);
        }
        if (view === "dashboard") {
          try {
            const data = await extended.doctorDashboard(controller.signal);
            if (!controller.signal.aborted) setDashboard(data);
          } catch {
            if (!controller.signal.aborted) setDashboard(null);
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setQueueError(true);
          if (
            cause instanceof ApiError &&
            cause.code === "DOCTOR_PROFILE_UNAVAILABLE"
          )
            setProfileUnavailable(true);
          else
            toast.error("Não foi possível carregar a fila", errorText(cause));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [toast, view],
  );
  useEffect(() => {
    if (profileUnavailable) return;
    const initial = window.setTimeout(() => void refresh(true), 0);
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      ongoing.current?.abort();
    };
  }, [refresh, profileUnavailable]);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    void extended
      .active(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (
          result &&
          (result.status === "called" || result.status === "in_progress")
        ) {
          setActive(result);
          sessionStorage.setItem(cacheKey(userId), result.id);
        } else {
          setActive(null);
          sessionStorage.removeItem(cacheKey(userId));
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          if (
            cause instanceof ApiError &&
            cause.code === "DOCTOR_PROFILE_UNAVAILABLE"
          )
            setProfileUnavailable(true);
          else
            toast.error(
              "Não foi possível recuperar o atendimento ativo",
              errorText(cause),
            );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setRestoring(false);
      });
    return () => controller.abort();
  }, [userId, toast]);

  useEffect(() => {
    if (view !== "detail" || !entryId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setDetailLoading(true);
      setDetailFailed(false);
      void operations
        .entry(entryId, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          if (result.status === "called" || result.status === "in_progress") {
            if (userId) sessionStorage.setItem(cacheKey(userId), result.id);
            setActive(result);
            navigate("/medico/atendimento", { replace: true });
          } else setDetail(result);
        })
        .catch((cause) => {
          if (!controller.signal.aborted) {
            setDetailFailed(true);
            toast.error(
              "Não foi possível consultar o paciente",
              errorText(cause),
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setDetailLoading(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [view, entryId, detailRevision, userId, navigate, toast]);

  const activeEntryId = active?.id;
  const activeEntryStatus = active?.status;
  // Drafts are loaded only for the authenticated doctor + exact entry. A delayed GET
  // is ignored after any edit, and the API's ETag is kept only in memory.
  useEffect(() => {
    if (!activeEntryId || !userId || activeEntryStatus !== "in_progress")
      return;
    const key = JSON.stringify([userId, activeEntryId]);
    const controller = new AbortController();
    const local = getPrescriptionDraft(userId, activeEntryId);
    const localEtag = getPrescriptionDraftEtag(userId, activeEntryId);
    const generation = ++draftSyncRef.current.loadRevision;
    draftSyncRef.current = {
      key,
      etag: localEtag,
      revision: 0,
      queue: Promise.resolve(),
      loadRevision: generation,
    };
    void operations
      .prescriptionDraft(activeEntryId, controller.signal)
      .then((result) => {
        if (
          controller.signal.aborted ||
          draftSyncRef.current.key !== key ||
          draftSyncRef.current.loadRevision !== generation
        )
          return;
        const currentRevision = draftSyncRef.current.revision;
        const remote = result.draft
          ? {
              description: result.draft.description,
              medications: result.draft.medications.map((item) => ({
                ...item,
                draftId: createDraftMedicationId(),
              })),
              notes: result.draft.notes ?? "",
              changed: false,
            }
          : emptyPrescriptionDraft();
        if (currentRevision > 0) {
          if (result.draft && (!localEtag || localEtag !== result.etag)) {
            setDraftSync({
              key,
              status: "conflict",
              message:
                "O rascunho foi alterado em outra sessão enquanto você digitava. Seus dados locais foram preservados.",
            });
            return;
          }
          draftSyncRef.current.etag = result.etag;
          setPrescriptionDraftEtag(userId, activeEntryId, result.etag);
          setDraftSync({ key, status: "dirty", message: "" });
          return;
        }
        if (local.changed) {
          if (result.draft && (!localEtag || localEtag !== result.etag)) {
            draftSyncRef.current.etag = result.etag;
            setDraftState({ key, value: local });
            setDraftSync({
              key,
              status: "conflict",
              message:
                "O rascunho local e a versão do servidor diferem. Escolha qual versão manter.",
            });
            return;
          }
          draftSyncRef.current.etag = localEtag;
          setDraftState({ key, value: local });
          setDraftSync({ key, status: "dirty", message: "" });
          return;
        }
        if (currentRevision === 0) {
          draftSyncRef.current.etag = result.etag;
          setPrescriptionDraftEtag(userId, activeEntryId, result.etag);
          setPrescriptionDraft(userId, activeEntryId, remote);
          setDraftState({ key, value: remote });
          setDraftSync({ key, status: "saved", message: "" });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && draftSyncRef.current.key === key) {
          setDraftSync({
            key,
            status: "error",
            message:
              "Não foi possível recuperar o rascunho do servidor. O que você digitar continuará em memória.",
          });
          if (local.changed) setDraftState({ key, value: local });
        }
      });
    return () => controller.abort();
  }, [activeEntryId, activeEntryStatus, userId]);

  // Debounce each edit, then serialize writes. A newer edit remains dirty until
  // its own PUT has been confirmed by the server.
  useEffect(() => {
    if (
      !activeEntryId ||
      !userId ||
      !draftKey ||
      draftState.key !== draftKey ||
      !draftState.value.changed
    )
      return;
    if (
      draftSync.key !== draftKey ||
      ["loading", "saving", "conflict", "error"].includes(draftSync.status)
    )
      return;
    const timer = window.setTimeout(() => {
      const snapshot = draftState.value;
      const revision = draftSyncRef.current.revision;
      const id = activeEntryId;
      const actorId = userId;
      setDraftSync({ key: draftKey, status: "saving", message: "" });
      const write = async () => {
        if (draftSyncRef.current.key !== draftKey) return;
        try {
          const payload = {
            description: snapshot.description,
            medications: snapshot.medications.map(
              ({ name, dosage, instructions }) => ({
                name,
                dosage,
                instructions,
              }),
            ),
            notes: snapshot.notes || null,
          };
          const etag = getPrescriptionDraftEtag(actorId, id);
          const saved = await operations.savePrescriptionDraft(
            id,
            payload,
            etag,
          );
          if (draftSyncRef.current.key !== draftKey) return;
          draftSyncRef.current.etag = saved.etag;
          setPrescriptionDraftEtag(actorId, id, saved.etag);
          if (revision === draftSyncRef.current.revision) {
            const confirmed = { ...snapshot, changed: false };
            setPrescriptionDraft(actorId, id, confirmed);
            setDraftState({ key: draftKey, value: confirmed });
            setDraftSync({ key: draftKey, status: "saved", message: "" });
          } else setDraftSync({ key: draftKey, status: "dirty", message: "" });
        } catch (cause) {
          if (draftSyncRef.current.key !== draftKey) return;
          if (cause instanceof ApiError && cause.status === 412) {
            setDraftSync({
              key: draftKey,
              status: "conflict",
              message:
                "O rascunho foi alterado em outra sessão. Compare a versão do servidor antes de salvar novamente.",
            });
          } else if (
            cause instanceof ApiError &&
            (cause.code === "TIMEOUT" || cause.code === "NETWORK_ERROR")
          ) {
            try {
              const current = await operations.prescriptionDraft(id);
              const submitted = JSON.stringify({
                description: snapshot.description,
                medications: snapshot.medications.map(
                  ({ name, dosage, instructions }) => ({
                    name,
                    dosage,
                    instructions,
                  }),
                ),
                notes: snapshot.notes || null,
              });
              const observed =
                current.draft &&
                JSON.stringify({
                  description: current.draft.description,
                  medications: current.draft.medications,
                  notes: current.draft.notes,
                });
              if (observed === submitted) {
                draftSyncRef.current.etag = current.etag;
                setPrescriptionDraftEtag(actorId, id, current.etag);
                if (revision === draftSyncRef.current.revision) {
                  const confirmed = { ...snapshot, changed: false };
                  setPrescriptionDraft(actorId, id, confirmed);
                  setDraftState({ key: draftKey, value: confirmed });
                  setDraftSync({ key: draftKey, status: "saved", message: "" });
                } else
                  setDraftSync({ key: draftKey, status: "dirty", message: "" });
              } else {
                draftSyncRef.current.etag = current.etag;
                setPrescriptionDraftEtag(actorId, id, current.etag);
                setDraftSync({
                  key: draftKey,
                  status: "conflict",
                  message:
                    "Não foi possível confirmar se o salvamento foi aplicado. Consulte a versão do servidor antes de continuar.",
                });
              }
            } catch {
              setDraftSync({
                key: draftKey,
                status: "error",
                message:
                  "O resultado do salvamento é incerto. Seus dados permanecem em memória; confira o servidor antes de repetir.",
              });
            }
          } else
            setDraftSync({
              key: draftKey,
              status: "error",
              message: errorText(cause),
            });
        }
      };
      draftSyncRef.current.queue = draftSyncRef.current.queue.then(
        write,
        write,
      );
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    activeEntryId,
    draftKey,
    draftState.key,
    draftState.value,
    draftSync.key,
    draftSync.status,
    userId,
  ]);

  async function callNext() {
    if (lock.current || active || restoring) return;
    lock.current = true;
    setBusy("calling");
    try {
      const result = await operations.callNext();
      if (result) {
        const queueContext = queue.find((item) => item.entryId === result.id);
        if (userId && queueContext)
          setEntrySymptomNames(
            userId,
            result.id,
            queueContext.symptoms.map((item) => item.name),
          );
        if (userId) sessionStorage.setItem(cacheKey(userId), result.id);
        setActive(result);
        toast.success(
          "Paciente chamado",
          "Confirme a chegada ao consultório antes de iniciar o atendimento.",
        );
        navigate("/medico/atendimento");
      } else
        toast.info("Fila vazia", "Nenhum paciente está aguardando chamada.");
    } catch (cause) {
      toast.error("Não foi possível chamar o paciente", errorText(cause));
    } finally {
      setBusy("");
      lock.current = false;
    }
  }
  async function startCare() {
    if (lock.current || !active || active.status !== "called") return;
    lock.current = true;
    setBusy("starting");
    try {
      const updated = await operations.setStatus(active.id, "in_progress");
      setActive(updated);
      toast.success(
        "Atendimento iniciado",
        "O início foi registrado no servidor.",
      );
    } catch (cause) {
      toast.error("Não foi possível iniciar o atendimento", errorText(cause));
      try {
        setActive(await operations.entry(active.id));
      } catch {
        /* Preserve clinical warning. */
      }
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  function updateDraft(
    update: (current: PrescriptionDraft) => PrescriptionDraft,
  ) {
    if (!active || !userId || active.status !== "in_progress") return;
    const key = JSON.stringify([userId, active.id]);
    const current =
      draftState.key === key
        ? draftState.value
        : getPrescriptionDraft(userId, active.id);
    const next = { ...update(current), changed: true };
    if (draftSyncRef.current.key === key) draftSyncRef.current.revision += 1;
    setPrescriptionDraft(userId, active.id, next);
    setDraftState({ key, value: next });
    setDraftSync({ key, status: "dirty", message: "" });
    setFormErrorsState({ key, errors: {} });
    setReviewedDraftKey("");
    setFinalizationState({ key, message: "", uncertain: false });
    setNavigationTarget(null);
  }
  async function reloadServerDraft() {
    if (!active || !userId || !draftKey) return;
    const id = active.id;
    const actorId = userId;
    setDraftSync({ key: draftKey, status: "loading", message: "" });
    try {
      const result = await operations.prescriptionDraft(id);
      if (draftSyncRef.current.key !== draftKey) return;
      const value: PrescriptionDraft = result.draft
        ? {
            description: result.draft.description,
            medications: result.draft.medications.map((item) => ({
              ...item,
              draftId: createDraftMedicationId(),
            })),
            notes: result.draft.notes ?? "",
            changed: false,
          }
        : emptyPrescriptionDraft();
      draftSyncRef.current.etag = result.etag;
      draftSyncRef.current.revision += 1;
      setPrescriptionDraftEtag(actorId, id, result.etag);
      setPrescriptionDraft(actorId, id, value);
      setDraftState({ key: draftKey, value });
      setDraftSync({
        key: draftKey,
        status: "saved",
        message: "Versão do servidor carregada.",
      });
      setReviewedDraftKey("");
    } catch (cause) {
      setDraftSync({
        key: draftKey,
        status: "conflict",
        message: `Não foi possível consultar a versão atual. ${errorText(cause)}`,
      });
    }
  }
  async function discardRemoteDraft() {
    if (!active || !userId || !draftKey || lock.current) return;
    if (
      !window.confirm(
        "Descartar o rascunho salvo deste atendimento? Esta ação não pode ser desfeita.",
      )
    )
      return;
    lock.current = true;
    setBusy("discarding");
    const id = active.id;
    const actorId = userId;
    const key = draftKey;
    const etag = draftSyncRef.current.etag;
    try {
      await operations.deletePrescriptionDraft(id, etag);
      if (draftSyncRef.current.key !== key) return;
      clearPrescriptionDraft(actorId, id);
      draftSyncRef.current.etag = null;
      draftSyncRef.current.revision += 1;
      setDraftState({ key, value: emptyPrescriptionDraft() });
      setDraftSync({
        key,
        status: "saved",
        message: "Rascunho descartado.",
      });
      setReviewedDraftKey("");
    } catch (cause) {
      if (draftSyncRef.current.key !== key) return;
      if (cause instanceof ApiError && cause.status === 412) {
        setDraftSync({
          key,
          status: "conflict",
          message:
            "O rascunho foi alterado em outra sessão e não foi descartado.",
        });
      } else if (
        cause instanceof ApiError &&
        (cause.code === "TIMEOUT" ||
          cause.code === "NETWORK_ERROR" ||
          cause.status === 503)
      ) {
        try {
          const current = await operations.prescriptionDraft(id);
          if (draftSyncRef.current.key !== key) return;
          if (!current.draft) {
            clearPrescriptionDraft(actorId, id);
            draftSyncRef.current.etag = null;
            draftSyncRef.current.revision += 1;
            setDraftState({ key, value: emptyPrescriptionDraft() });
            setDraftSync({
              key,
              status: "saved",
              message: "Descarte confirmado no servidor.",
            });
            setReviewedDraftKey("");
          } else {
            draftSyncRef.current.etag = current.etag;
            setPrescriptionDraftEtag(actorId, id, current.etag);
            setDraftSync({
              key,
              status: current.etag !== etag ? "conflict" : "error",
              message:
                current.etag !== etag
                  ? "O rascunho foi atualizado em outra sessão e não foi descartado."
                  : "O servidor ainda retorna o rascunho. O descarte não foi confirmado; seus dados continuam preservados.",
            });
          }
        } catch {
          if (draftSyncRef.current.key === key)
            setDraftSync({
              key,
              status: "error",
              message:
                "Não foi possível confirmar o descarte. O conteúdo permanece preservado em memória; consulte o servidor antes de tentar novamente.",
            });
        }
      } else
        setDraftSync({
          key,
          status: "error",
          message: errorText(cause),
        });
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  function validatePrescription(value: PrescriptionDraft) {
    const errors: Record<string, string> = {};
    const description = value.description.trim();
    if (!description)
      errors.description = "Informe a descrição ou conduta clínica.";
    else if (description.length > 5000)
      errors.description = "Use até 5.000 caracteres.";
    if (value.medications.length > 50)
      errors.medications = "Adicione no máximo 50 medicamentos.";
    value.medications.forEach((item) => {
      const fields = [
        ["name", item.name, 150, "Informe o nome do medicamento."],
        ["dosage", item.dosage, 150, "Informe a dosagem."],
        ["instructions", item.instructions, 1000, "Informe as instruções."],
      ] as const;
      for (const [field, raw, max, message] of fields) {
        const key = `med-${item.draftId}-${field}`;
        if (!raw.trim()) errors[key] = message;
        else if (raw.trim().length > max)
          errors[key] = `Use até ${max.toLocaleString("pt-BR")} caracteres.`;
      }
    });
    if (value.notes.length > 4000) errors.notes = "Use até 4.000 caracteres.";
    return errors;
  }
  function focusFirstInvalid(errors: Record<string, string>) {
    const key = Object.keys(errors)[0];
    if (!key) return;
    window.requestAnimationFrame(() =>
      document.getElementById(`prescription-${key}`)?.focus(),
    );
  }
  function navigateToPrescription(id: string, actorId = userId) {
    if (actorId) {
      clearPrescriptionDraft(actorId, id);
      if (sessionStorage.getItem(cacheKey(actorId)) === id)
        sessionStorage.removeItem(cacheKey(actorId));
      window.dispatchEvent(
        new CustomEvent("av:entry-completed", {
          detail: { actorId, entryId: id },
        }),
      );
    }
    if (!isCurrentVisit(actorId, id)) return;
    const key = actorId ? JSON.stringify([actorId, id]) : "";
    setDraftState({ key, value: emptyPrescriptionDraft() });
    setReviewedDraftKey("");
    setShowFormFor(null);
    setNavigationTarget(null);
    toast.clear();
    navigate(`/medico/prescricoes/${encodeURIComponent(id)}`, {
      state: { finalizationConfirmed: true },
    });
  }
  async function reconcileFailedFinalization(
    id: string,
    cause: unknown,
    contextKey: string,
    actorId: string,
  ) {
    try {
      const current = await operations.entry(id);
      if (current.id === id && current.status === "completed") {
        navigateToPrescription(id, actorId);
        return;
      }
      if (!isCurrentVisit(actorId, id)) return;
      if (current.id !== id) {
        setFinalizationState({
          key: contextKey,
          message:
            "A consulta retornou outro atendimento. Não tente finalizar novamente; verifique a situação com a equipe responsável.",
          uncertain: true,
        });
      } else if (current.status === "in_progress") {
        setActive(current);
        setReviewedDraftKey("");
        setFinalizationState({
          key: contextKey,
          message: `A finalização não foi confirmada. Seus dados continuam no rascunho. Revise antes de tentar novamente. ${errorText(cause)}`,
          uncertain: false,
        });
      } else {
        setActive(current);
        setReviewedDraftKey("");
        setFinalizationState({
          key: contextKey,
          message:
            "O estado do atendimento mudou no servidor. A finalização foi bloqueada; verifique o estado antes de continuar.",
          uncertain: true,
        });
      }
    } catch {
      if (isCurrentVisit(actorId, id))
        setFinalizationState({
          key: contextKey,
          message:
            "Resultado da finalização não confirmado. O servidor não pôde ser consultado; não repita o envio até verificar a situação.",
          uncertain: true,
        });
    }
  }
  async function verifyFinalization() {
    if (!active || lock.current || !finalization.uncertain) return;
    const id = active.id;
    const actorId = userId;
    const contextKey = JSON.stringify([userId, id]);
    lock.current = true;
    setBusy("reconciling");
    try {
      const current = await operations.entry(id);
      if (current.id === id && current.status === "completed") {
        navigateToPrescription(id, actorId);
        return;
      }
      if (!isCurrentVisit(actorId, id)) return;
      if (current.id !== id) {
        setFinalizationState({
          key: contextKey,
          message:
            "A consulta retornou outro atendimento. A finalização continua sem confirmação.",
          uncertain: true,
        });
      } else if (current.status === "in_progress") {
        setActive(current);
        setReviewedDraftKey("");
        setFinalizationState({
          key: contextKey,
          message:
            "O servidor confirma que o atendimento continua em andamento. Confira o rascunho e revise novamente antes de uma nova tentativa.",
          uncertain: false,
        });
      } else {
        setActive(current);
        setFinalizationState({
          key: contextKey,
          message:
            "O atendimento mudou de estado. A prescrição não pode ser reenviada nesta situação.",
          uncertain: true,
        });
      }
    } catch {
      if (isCurrentVisit(actorId, id))
        setFinalizationState({
          key: contextKey,
          message:
            "Ainda não foi possível confirmar o resultado. Aguarde a disponibilidade do servidor e verifique novamente.",
          uncertain: true,
        });
    } finally {
      lock.current = false;
      if (isCurrentVisit(actorId, id)) setBusy("");
    }
  }
  async function complete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !active ||
      active.status !== "in_progress" ||
      lock.current ||
      finalization.uncertain
    )
      return;
    const errors = validatePrescription(draft);
    if (Object.keys(errors).length) {
      setFormErrorsState({ key: draftKey, errors });
      focusFirstInvalid(errors);
      return;
    }
    if (!review) {
      if (
        draftSync.key !== draftKey ||
        draftSync.status !== "saved" ||
        draft.changed
      )
        return;
      setFormErrorsState({ key: draftKey, errors: {} });
      setReviewedDraftKey(draftKey);
      return;
    }
    lock.current = true;
    setBusy("finishing");
    const id = active.id;
    const actorId = userId;
    const contextKey = draftKey;
    const prescription = prescriptionFromDraft(draft);
    setFinalizationState({ key: contextKey, message: "", uncertain: false });
    try {
      const result = await operations.complete(
        id,
        prescription,
        draftSyncRef.current.etag,
      );
      try {
        const current = await operations.entry(id);
        if (current.id !== id) {
          if (isCurrentVisit(actorId, id))
            setFinalizationState({
              key: contextKey,
              message:
                "A consulta retornou outro atendimento. A finalização não pôde ser conciliada; verifique a situação com a equipe antes de tentar novamente.",
              uncertain: true,
            });
        } else if (current.status === "completed") {
          navigateToPrescription(id, actorId);
        } else if (result?.id === id && result.status === "completed") {
          navigateToPrescription(id, actorId);
        } else {
          if (!isCurrentVisit(actorId, id)) return;
          setActive(current);
          setFinalizationState({
            key: contextKey,
            message:
              "A operação foi aceita, mas a consulta ainda não confirmou a finalização. Verifique novamente antes de qualquer nova tentativa.",
            uncertain: true,
          });
        }
      } catch {
        navigateToPrescription(id, actorId);
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 412)
        setDraftSync({
          key: contextKey,
          status: "conflict",
          message:
            "A versão do rascunho mudou no servidor. A finalização foi bloqueada; carregue a versão atual para resolver o conflito.",
        });
      await reconcileFailedFinalization(id, cause, contextKey, actorId);
    } finally {
      lock.current = false;
      if (isCurrentVisit(actorId, id)) setBusy("");
    }
  }
  function guardNavigation(target: string) {
    if (
      !draft.changed &&
      busy !== "finishing" &&
      busy !== "reconciling" &&
      busy !== "discarding" &&
      busy !== "signing-out"
    )
      return true;
    setNavigationTarget(target);
    return false;
  }
  async function discardAndNavigate() {
    if (!navigationTarget) return;
    const target = navigationTarget;
    setNavigationTarget(null);
    if (target === "/__sign-out") {
      setBusy("signing-out");
      try {
        await signOut(new AbortController().signal);
        navigate("/login", { replace: true });
      } catch (cause) {
        toast.error("Não foi possível encerrar sua sessão.", errorText(cause));
      } finally {
        setBusy("");
      }
      return;
    }
    navigate(target);
  }

  async function checkProfile() {
    setRestoring(true);
    try {
      const result = await extended.active();
      setActive(result);
      if (result) sessionStorage.setItem(cacheKey(userId), result.id);
      else sessionStorage.removeItem(cacheKey(userId));
      setProfileUnavailable(false);
    } catch (cause) {
      if (!(
        cause instanceof ApiError && cause.code === "DOCTOR_PROFILE_UNAVAILABLE"
      ))
        toast.error("Não foi possível verificar o cadastro", errorText(cause));
    } finally {
      setRestoring(false);
    }
  }
  if (profileUnavailable)
    return (
      <AppShell>
        <div className="local-page operational-page">
          <section className="local-form" role="alert">
            <h1>Cadastro médico indisponível</h1>
            <p>
              O cadastro médico desta conta está ausente ou inativo. Peça à
              administração para vincular sua conta a um perfil clínico ou
              reativar o perfil existente na tela de Médicos.
            </p>
            <p>
              Conta:{" "}
              {state.status === "authenticated" ? state.user.login : doctorName}
            </p>
            <button
              className="local-primary"
              disabled={restoring}
              onClick={() => void checkProfile()}
            >
              {restoring ? "Verificando…" : "Verificar cadastro novamente"}
            </button>
          </section>
        </div>
      </AppShell>
    );
  const canCall =
    !loading && !queueError && !restoring && !active && queue.length > 0;
  return (
    <AppShell
      navigationGuard={guardNavigation}
      navigationPending={navigationTarget !== null}
    >
      <div className="local-page operational-page">
        <header className="local-page-head">
          <div>
            <span className="local-eyebrow">
              Pronto-socorro · Corpo clínico
            </span>
            <h1>{heading}</h1>
            <p>
              {view === "dashboard"
                ? "Olá, " +
                  doctorName +
                  ". Acompanhe sua jornada de atendimento."
                : view === "queue"
                  ? "Pacientes aguardando, ordenados no backend por prioridade e chegada."
                  : view === "detail"
                    ? "Consulte a entrada e as informações de triagem do paciente."
                    : "Atendimento individual. Registre cada etapa com segurança."}
            </p>
          </div>
          {view === "detail" ? (
            <Link className="local-secondary-button" to="/medico/fila">
              <ArrowLeft size={16} aria-hidden="true" /> Voltar à fila
            </Link>
          ) : view === "current" ? (
            <Link className="local-secondary-button" to="/medico">
              <ArrowLeft size={16} aria-hidden="true" /> Dashboard
            </Link>
          ) : (
            <button
              type="button"
              className="local-secondary-button"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw size={16} aria-hidden="true" /> Atualizar fila
            </button>
          )}
        </header>

        {navigationTarget && (
          <section
            className="prescription-navigation-warning"
            role="alert"
            aria-labelledby="prescription-navigation-title"
          >
            <ShieldAlert size={19} aria-hidden="true" />
            <div>
              <h2 id="prescription-navigation-title">
                Este rascunho não foi salvo no servidor
              </h2>
              <p>
                Se sair agora, o conteúdo em memória desta entrada será
                descartado. A finalização em andamento não pode ser
                interrompida.
              </p>
            </div>
            <div className="local-actions">
              <button
                ref={continueEditingRef}
                className="local-secondary-button"
                type="button"
                onClick={() => setNavigationTarget(null)}
              >
                Continuar editando
              </button>
              {busy !== "finishing" &&
                busy !== "reconciling" &&
                busy !== "discarding" && (
                  <button
                    className="local-primary"
                    type="button"
                    onClick={discardAndNavigate}
                  >
                    Sair sem salvar
                  </button>
                )}
            </div>
          </section>
        )}

        {view === "dashboard" && (
          <>
            <p className="local-note">
              Indicadores consultados diretamente no servidor. Atualização a
              cada 30 segundos.
            </p>
            <div className="operational-summary">
              <div className="operational-kpi">
                <span>Pacientes aguardando</span>
                <strong>
                  {loading ? "—" : (dashboard?.waiting ?? queue.length)}
                </strong>
                <small>Pacientes atribuídos a você</small>
              </div>
              <div className="operational-kpi">
                <span>Seu atendimento</span>
                <strong className="operational-time">
                  {restoring
                    ? "Verificando…"
                    : active
                      ? active.status === "called"
                        ? "Paciente chamado"
                        : "Em andamento"
                      : "Disponível"}
                </strong>
                <small>
                  {active
                    ? active.patient.fullName
                    : "Pronto para a próxima chamada"}
                </small>
              </div>
            </div>
            <div className="operational-summary">
              <div className="operational-kpi">
                <span>Finalizados hoje</span>
                <strong>{dashboard?.completedToday ?? "—"}</strong>
              </div>
              <div className="operational-kpi">
                <span>Em atendimento</span>
                <strong>{dashboard?.inProgress ?? "—"}</strong>
              </div>
            </div>
            <div className="operational-dashboard-actions">
              <Link to="/medico/fila" className="operational-dash-link">
                <ClipboardList size={22} aria-hidden="true" />
                <strong>Minha fila</strong>
                <span>
                  Consulte os pacientes, a classificação e os detalhes de cada
                  entrada.
                </span>
                <ArrowRight
                  size={18}
                  aria-hidden="true"
                  className="operational-dash-arrow"
                />
              </Link>
              <Link to="/medico/atendimento" className="operational-dash-link">
                <Stethoscope size={22} aria-hidden="true" />
                <strong>Paciente atual</strong>
                <span>
                  {active
                    ? "Continuar atendimento de " + active.patient.fullName
                    : "Acompanhar chamadas e registrar atendimento."}
                </span>
                <ArrowRight
                  size={18}
                  aria-hidden="true"
                  className="operational-dash-arrow"
                />
              </Link>
            </div>
            <section className="local-form operational-dashboard-next">
              <div>
                <h2>Próxima chamada</h2>
                <p className="local-note">
                  A seleção é feita exclusivamente pelo backend, respeitando a
                  ordem de prioridade.
                </p>
              </div>
              {queueError && (
                <button
                  type="button"
                  className="local-secondary-button"
                  onClick={() => void refresh(true)}
                >
                  Tentar carregar fila novamente
                </button>
              )}
              {active ? (
                <Link to="/medico/atendimento" className="local-primary">
                  Continuar atendimento{" "}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              ) : (
                <button
                  type="button"
                  className="local-primary"
                  disabled={!canCall || busy !== ""}
                  onClick={() => void callNext()}
                >
                  {busy === "calling" ? "Chamando…" : "Chamar próximo paciente"}{" "}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              )}
              {!loading && !queueError && queue.length === 0 && !active && (
                <p className="local-note">
                  Não há pacientes aguardando neste momento.
                </p>
              )}
            </section>
          </>
        )}

        {view === "queue" && (
          <section className="local-form">
            <div className="operational-row">
              <h2>
                <Users size={19} aria-hidden="true" /> Pacientes na fila
              </h2>
              <span className="local-note">
                Atualização automática a cada 30 segundos
              </span>
            </div>
            {loading && (
              <p className="local-note" role="status">
                Carregando fila médica…
              </p>
            )}
            {queueError && (
              <button
                className="local-secondary-button"
                type="button"
                onClick={() => void refresh(true)}
              >
                Tentar novamente
              </button>
            )}
            {!loading && !queueError && queue.length === 0 && (
              <div className="local-empty">
                <Clock3 size={22} aria-hidden="true" />
                <h3>Nenhum paciente aguardando</h3>
                <p>Entradas atribuídas ao seu plantão aparecerão aqui.</p>
              </div>
            )}
            {!loading && !queueError && queue.length > 0 && (
              <div className="operational-patient-list">
                {queue.map((item) => (
                  <Link
                    key={item.entryId}
                    to={"/medico/fila/" + encodeURIComponent(item.entryId)}
                    className="operational-patient-link"
                  >
                    <div className="operational-patient-identity">
                      <strong>{item.fullName}</strong>
                      <small>
                        {item.queueCode || "Sem senha"} · Chegada{" "}
                        {formatDate(item.enteredAt)}
                      </small>
                    </div>
                    <RiskPill value={item.severity} />
                    <span className="operational-patient-complaint">
                      {[...item.symptoms.map((s) => s.name), item.otherSymptoms]
                        .filter(Boolean)
                        .join("; ") || "Queixa não informada"}
                    </span>
                    <span className="operational-open-label">
                      Ver detalhes <ArrowRight size={17} aria-hidden="true" />
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <div className="operational-row">
              <p className="local-note">
                A chamada do próximo paciente respeita a ordem clínica no
                servidor.
              </p>
              {active ? (
                <Link to="/medico/atendimento" className="local-primary">
                  Ir para paciente atual{" "}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              ) : (
                <button
                  type="button"
                  className="local-primary"
                  disabled={!canCall || busy !== ""}
                  onClick={() => void callNext()}
                >
                  {busy === "calling" ? "Chamando…" : "Chamar próximo paciente"}
                </button>
              )}
            </div>
          </section>
        )}

        {view === "detail" && (
          <section className="local-form operational-current">
            {detailLoading && (
              <p className="local-note" role="status">
                Carregando informações do paciente…
              </p>
            )}
            {detailFailed && (
              <button
                type="button"
                className="local-secondary-button"
                onClick={() => setDetailRevision((n) => n + 1)}
              >
                Tentar novamente
              </button>
            )}
            {!detailLoading && !detailFailed && detail && (
              <>
                <div className="operational-row">
                  <h2>{detail.patient.fullName}</h2>
                  <StatePill status={detail.status} />
                </div>
                <div className="operational-patient">
                  <p className="local-note">
                    {detail.queueCode || "Sem senha"} · Chegada{" "}
                    {formatDate(detail.enteredAt)}
                  </p>
                  <RiskPill value={detail.severity} />
                </div>
                <div className="operational-detail-grid">
                  <div>
                    <span>Sintomas registrados</span>
                    <strong>
                      {detail.symptoms
                        ?.map((symptom) => symptom.name)
                        .join(" · ") || "Nenhum sintoma estruturado"}
                    </strong>
                  </div>
                  <div>
                    <span>Queixa relatada</span>
                    <strong>{detail.otherSymptoms || "Não informada"}</strong>
                  </div>
                  <div>
                    <span>Observações de entrada</span>
                    <strong>{detail.shortNote || "Nenhuma observação"}</strong>
                  </div>
                  <div>
                    <span>Posição na fila</span>
                    <strong>{detail.queuePosition ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Médico responsável</span>
                    <strong>{detail.doctor?.name || "Não atribuído"}</strong>
                  </div>
                </div>
                <p className="local-note">
                  Este detalhe é somente para consulta. A chamada é realizada
                  exclusivamente pelo comando "Chamar próximo paciente".
                </p>
                <Link to="/medico/fila" className="local-secondary-button">
                  <ArrowLeft size={16} aria-hidden="true" /> Voltar à fila
                </Link>
              </>
            )}
          </section>
        )}

        {view === "current" && (
          <section
            className="local-form operational-current"
            aria-label="Paciente atual"
          >
            <div className="operational-row">
              <h2>
                <Stethoscope size={19} aria-hidden="true" /> Paciente atual
              </h2>
              {active && <StatePill status={active.status} />}
            </div>
            {restoring && (
              <p role="status" className="local-note">
                Recuperando atendimento ativo no servidor…
              </p>
            )}
            {!restoring && active && (
              <>
                <div className="operational-patient">
                  <div>
                    <span className="local-eyebrow">Paciente</span>
                    <h3>{active.patient.fullName}</h3>
                    <p className="local-note">
                      {active.queueCode || "Sem senha"} · Chegada{" "}
                      {formatDate(active.enteredAt)}
                    </p>
                  </div>
                  <RiskPill value={active.severity} />
                </div>
                <div className="operational-detail-grid">
                  <div>
                    <span>Sintomas registrados</span>
                    <strong>
                      {active.symptoms
                        ?.map((symptom) => symptom.name)
                        .join(" · ") || "Nenhum sintoma estruturado"}
                    </strong>
                  </div>
                  <div>
                    <span>Queixa relatada</span>
                    <strong>{active.otherSymptoms || "Não informada"}</strong>
                  </div>
                  <div>
                    <span>Observações de entrada</span>
                    <strong>{active.shortNote || "Nenhuma observação"}</strong>
                  </div>
                  <div>
                    <span>Sala</span>
                    <strong>{active.room || "Verifique a escala"}</strong>
                  </div>
                  <div>
                    <span>Chamada</span>
                    <strong>{formatDate(active.timestamps.calledAt)}</strong>
                  </div>
                </div>
                {active.status === "called" && (
                  <div className="operational-action-panel">
                    <p className="local-note">
                      Confirme a chegada do paciente ao consultório para iniciar
                      o atendimento.
                    </p>
                    <button
                      type="button"
                      className="local-primary"
                      onClick={() => void startCare()}
                      disabled={busy !== ""}
                    >
                      {busy === "starting"
                        ? "Iniciando…"
                        : "Iniciar atendimento"}{" "}
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
                {active.status === "in_progress" && (
                  <>
                    {!showForm && (
                      <div className="operational-action-panel">
                        <p className="local-note">
                          Ao finalizar, a prescrição e o encerramento são
                          registrados na mesma operação.
                        </p>
                        {draft.changed && (
                          <p className="prescription-draft-note">
                            Rascunho ainda não confirmado no servidor.
                          </p>
                        )}
                        <button
                          type="button"
                          className="local-primary"
                          onClick={() => setShowFormFor(active.id)}
                        >
                          <ClipboardCheck size={17} aria-hidden="true" />{" "}
                          {draft.changed ||
                          getPrescriptionDraftEtag(userId, active.id)
                            ? "Continuar rascunho"
                            : "Prescrever e finalizar"}
                        </button>
                      </div>
                    )}
                    {showForm && (
                      <PrescriptionForm
                        entry={active}
                        draft={draft}
                        errors={formErrors}
                        review={review}
                        busy={busy !== ""}
                        finalizationError={finalization.message}
                        finalizationUncertain={finalization.uncertain}
                        syncStatus={
                          draftSync.key === draftKey
                            ? draftSync.status
                            : "loading"
                        }
                        syncMessage={
                          draftSync.key === draftKey ? draftSync.message : ""
                        }
                        canReview={
                          draftSync.key === draftKey &&
                          draftSync.status === "saved" &&
                          !draft.changed
                        }
                        canDiscard={Boolean(
                          userId &&
                          draftSync.key === draftKey &&
                          !draft.changed &&
                          draftSync.status === "saved" &&
                          getPrescriptionDraftEtag(userId, active.id),
                        )}
                        onRetrySave={() => {
                          if (draftSyncRef.current.key !== draftKey) return;
                          draftSyncRef.current.revision += 1;
                          const retry = { ...draft, changed: true };
                          setPrescriptionDraft(userId, active.id, retry);
                          setDraftState({ key: draftKey, value: retry });
                          setDraftSync({
                            key: draftKey,
                            status: "dirty",
                            message: "",
                          });
                        }}
                        onReloadServer={() => void reloadServerDraft()}
                        onDiscardDraft={() => void discardRemoteDraft()}
                        symptomNames={
                          active.symptoms?.map((symptom) => symptom.name) ??
                          (userId
                            ? getEntrySymptomNames(userId, active.id)
                            : [])
                        }
                        onSubmit={(event) => void complete(event)}
                        onChange={(field, value) =>
                          updateDraft((current) => ({
                            ...current,
                            [field]: value,
                          }))
                        }
                        onMedicationChange={(draftId, field, value) =>
                          updateDraft((current) => ({
                            ...current,
                            medications: current.medications.map((item) =>
                              item.draftId === draftId
                                ? { ...item, [field]: value }
                                : item,
                            ),
                          }))
                        }
                        onAddMedication={(draftId) =>
                          updateDraft((current) =>
                            current.medications.length >= 50
                              ? current
                              : {
                                  ...current,
                                  medications: [
                                    ...current.medications,
                                    {
                                      draftId,
                                      name: "",
                                      dosage: "",
                                      instructions: "",
                                    },
                                  ],
                                },
                          )
                        }
                        onRemoveMedication={(draftId) =>
                          updateDraft((current) => ({
                            ...current,
                            medications: current.medications.filter(
                              (item) => item.draftId !== draftId,
                            ),
                          }))
                        }
                        onEdit={() => setReviewedDraftKey("")}
                        onVerify={() => void verifyFinalization()}
                        onBack={() => {
                          setReviewedDraftKey("");
                          setShowFormFor(null);
                        }}
                      />
                    )}
                  </>
                )}
                {finalization.message &&
                  (!showForm || active.status !== "in_progress") && (
                    <div className="prescription-form-error" role="alert">
                      <ShieldAlert size={18} aria-hidden="true" />
                      <p>{finalization.message}</p>
                      {finalization.uncertain && (
                        <button
                          type="button"
                          className="local-secondary-button"
                          onClick={() => void verifyFinalization()}
                          disabled={busy !== ""}
                        >
                          Verificar situação no servidor
                        </button>
                      )}
                    </div>
                  )}
              </>
            )}
            {!restoring && !active && (
              <div className="operational-ready">
                <div className="operational-ready-icon">
                  <UserRound size={24} aria-hidden="true" />
                </div>
                <div>
                  <h3>Nenhum paciente em atendimento nesta sessão</h3>
                  <p>
                    Quando o próximo paciente for chamado, as informações
                    aparecerão aqui.
                  </p>
                </div>
                <Link className="local-secondary-button" to="/medico/fila">
                  Consultar fila <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
