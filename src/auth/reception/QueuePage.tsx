import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowUpDown,
  AlertTriangle,
  Check,
  CheckCheck,
  Clock3,
  Trash2,
  Filter,
  History,
  Pencil,
  Search,
  ShieldCheck,
  Siren,
  Stethoscope,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { PriorityBadge } from "../../components/PriorityBadge";
import { Select as AuthoredSelect } from "../../components/Select";
import { usePageTitle } from "../../components/usePageTitle";
import { useAuth } from "../context";
import { QUEUE_MOCK } from "./QueueData";
import { getWaitMinutes } from "../../reception/types";
import type { Priority, QueuePatient } from "./Types";
import {
  changePriority,
  deletePatient,
  getDeletionUndoEntry,
  getQueueSnapshot,
  getUndoBlockedReason,
  getUndoEntry,
  subscribeQueue,
  undoPatientDeletion,
  undoPriorityChange,
} from "../../reception/queue-store";

const TOTAL_QUEUE_COUNT = 16;
const PAGE_SIZE = 6;
const SUMMARY_COUNTS: Record<Priority, number> = {
  urgent: 3,
  alert: 5,
  calm: 8,
};
const INITIAL_QUEUE_TIME =
  Date.parse(QUEUE_MOCK[0].arrivedAt) + QUEUE_MOCK[0].waitMinutes * 60_000;

const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  alert: 1,
  calm: 2,
};

const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: "Urgente",
  alert: "Alerta",
  calm: "Tranquilo",
};

type PriorityFilter = Priority | "all";
type AgeFilter = "all" | "minor" | "adult" | "older";
type WaitFilter = "all" | "up-to-15" | "16-to-30" | "31-to-60" | "over-60";

const DELETE_REASON_OPTIONS = [
  { value: "", label: "Selecione o motivo" },
  { value: "Cadastro duplicado", label: "Cadastro duplicado" },
  { value: "Cadastro por engano", label: "Cadastro por engano" },
  { value: "Paciente desistiu / evadiu", label: "Paciente desistiu / evadiu" },
  { value: "Outro", label: "Outro" },
] as const;

const PRIORITY_FILTER_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "urgent", label: "Urgente" },
  { value: "alert", label: "Alerta" },
  { value: "calm", label: "Tranquilo" },
] as const;

const AGE_FILTER_OPTIONS = [
  { value: "all", label: "Todas as idades" },
  { value: "minor", label: "0 a 17 anos" },
  { value: "adult", label: "18 a 59 anos" },
  { value: "older", label: "60 anos ou mais" },
] as const;

const WAIT_FILTER_OPTIONS = [
  { value: "all", label: "Qualquer tempo" },
  { value: "up-to-15", label: "Até 15 minutos" },
  { value: "16-to-30", label: "16 a 30 minutos" },
  { value: "31-to-60", label: "31 a 60 minutos" },
  { value: "over-60", label: "Acima de 60 minutos" },
] as const;

interface LedAnimation {
  id: string;
  ticket: string;
  priority: Priority;
  phase: "pending" | "snake" | "blink" | "static";
}

interface LedBounds {
  top: number;
  left: number;
  width: number;
  height: number;
}

const sortByPriorityAndWait = (patients: QueuePatient[], now: number) =>
  [...patients].sort(
    (left, right) =>
      PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] ||
      getWaitMinutes(right, now) - getWaitMinutes(left, now),
  );

export function QueuePage() {
  usePageTitle("Fila de espera");
  const { state: authState } = useAuth();
  const navigate = useNavigate();
  const responsible =
    authState.status === "authenticated"
      ? authState.user.name
      : "Dra. Mariana Rios";
  const queueSnapshot = useSyncExternalStore(
    subscribeQueue,
    getQueueSnapshot,
    getQueueSnapshot,
  );
  const queue = queueSnapshot.patients;
  const activeQueue = queue.filter((patient) => patient.status !== "deleted");
  const auditEntries = queueSnapshot.auditEntries;
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("all");
  const [waitFilter, setWaitFilter] = useState<WaitFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"priority" | "delete" | null>(
    null,
  );
  const [draftPriority, setDraftPriority] = useState<Priority | null>(null);
  const [reason, setReason] = useState("");
  const [deleteReason, setDeleteReason] = useState<
    | ""
    | "Cadastro duplicado"
    | "Cadastro por engano"
    | "Paciente desistiu / evadiu"
    | "Outro"
  >("");
  const [deletingTicket, setDeletingTicket] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [notification, setNotification] = useState<{
    id: string;
    ticket: string;
    entryId: string;
    kind: "priority" | "deletion";
    tone: "success" | "neutral" | "error" | "warning";
    expiresAt: number;
    message: string;
    undoable: boolean;
  } | null>(null);
  const [ledAnimation, setLedAnimation] = useState<LedAnimation | null>(null);
  const [ledBounds, setLedBounds] = useState<LedBounds | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openedPatientVersion, setOpenedPatientVersion] = useState(0);
  const [undoNow, setUndoNow] = useState(INITIAL_QUEUE_TIME);
  const [clockNow, setClockNow] = useState(INITIAL_QUEUE_TIME);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const discardKeepRef = useRef<HTMLButtonElement>(null);
  const filterControlRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const ledOverlayRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const ledTimerRef = useRef<number | null>(null);
  const currentPriorityRef = useRef<HTMLButtonElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasModalOpenRef = useRef(false);
  const localMutationRef = useRef(false);

  const selectedPatient =
    queue.find((patient) => patient.ticket === selectedTicket) ?? null;
  const canDeletePatients =
    authState.status === "authenticated"
      ? authState.user.role === "RECEPCIONISTA" ||
        authState.user.role === "ADMIN"
      : import.meta.env.DEV &&
        new URLSearchParams(window.location.search)
          .get("dev")
          ?.toUpperCase() === "RECEPCIONISTA";
  const newRegistrationPath =
    import.meta.env.DEV && authState.status !== "authenticated"
      ? "/novo-cadastro?dev=recepcionista"
      : "/novo-cadastro";
  const recentUndoEntry = selectedPatient
    ? getUndoEntry(selectedPatient.ticket, undoNow)
    : null;
  const latestPatientChange = selectedPatient
    ? ([...auditEntries]
        .reverse()
        .find(
          (entry) =>
            entry.ticket === selectedPatient.ticket &&
            entry.type === "priority-change",
        ) ?? null)
    : null;

  const summaryCounts = useMemo(() => {
    const counts = { ...SUMMARY_COUNTS };
    const initialByTicket = new Map(
      QUEUE_MOCK.map((patient) => [patient.ticket, patient]),
    );
    for (const patient of queue) {
      const original = initialByTicket.get(patient.ticket);
      if (original && original.priority !== patient.priority) {
        counts[original.priority] -= 1;
        counts[patient.priority] += 1;
      }
      if (!original && patient.status !== "deleted")
        counts[patient.priority] += 1;
      if (original && patient.status === "deleted")
        counts[patient.priority] -= 1;
    }
    return counts;
  }, [queue]);

  const patients = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = activeQueue.filter((patient) => {
      const matchesSearch =
        !term ||
        [patient.name, patient.ticket, patient.complaint].some((value) =>
          value.toLowerCase().includes(term),
        );
      const matchesPriority =
        priorityFilter === "all" || patient.priority === priorityFilter;
      const matchesAge =
        ageFilter === "all" ||
        (ageFilter === "minor" && patient.age < 18) ||
        (ageFilter === "adult" && patient.age >= 18 && patient.age < 60) ||
        (ageFilter === "older" && patient.age >= 60);
      const waitMinutes = getWaitMinutes(patient, clockNow);
      const matchesWait =
        waitFilter === "all" ||
        (waitFilter === "up-to-15" && waitMinutes <= 15) ||
        (waitFilter === "16-to-30" && waitMinutes >= 16 && waitMinutes <= 30) ||
        (waitFilter === "31-to-60" && waitMinutes >= 31 && waitMinutes <= 60) ||
        (waitFilter === "over-60" && waitMinutes > 60);
      return matchesSearch && matchesPriority && matchesAge && matchesWait;
    });

    return sortByPriorityAndWait(filtered, clockNow);
  }, [activeQueue, ageFilter, clockNow, priorityFilter, search, waitFilter]);

  const totalActive = Math.max(
    0,
    TOTAL_QUEUE_COUNT +
      Math.max(0, queue.length - QUEUE_MOCK.length) -
      queue.filter((patient) => patient.status === "deleted").length,
  );
  const totalPages = Math.max(1, Math.ceil(patients.length / PAGE_SIZE));
  const currentPage = Math.min(pageNumber, totalPages);
  const pagePatients = patients.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const activeFilterCount = [
    priorityFilter !== "all",
    ageFilter !== "all",
    waitFilter !== "all",
  ].filter(Boolean).length;
  const hasListCriteria = Boolean(search.trim()) || activeFilterCount > 0;
  const listedTotal = hasListCriteria ? patients.length : totalActive;

  const highlightPatient = useCallback(
    (ticket: string, priority: Priority, sourcePatients: QueuePatient[]) => {
      const active = sourcePatients.filter(
        (patient) => patient.status !== "deleted",
      );
      const ordered = sortByPriorityAndWait(active, Date.now());
      const target = ordered.find((patient) => patient.ticket === ticket);
      if (!target) return;
      const query = search.trim().toLowerCase();
      if (
        query &&
        ![target.name, target.ticket, target.complaint].some((value) =>
          value.toLowerCase().includes(query),
        )
      ) {
        setSearch("");
      }
      const index = ordered.findIndex((patient) => patient.ticket === ticket);
      setPageNumber(Math.floor(index / PAGE_SIZE) + 1);
      setLedBounds(null);
      setLedAnimation({
        id: crypto.randomUUID(),
        ticket,
        priority,
        phase: "pending",
      });
    },
    [search],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!filtersOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !filterControlRef.current?.contains(target) &&
        !(target instanceof Element && target.closest(".select-popover"))
      )
        setFiltersOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const target = event.target;
        if (
          target instanceof Element &&
          (target.closest(".select-trigger") ||
            target.closest(".select-popover"))
        )
          return;
        event.preventDefault();
        setFiltersOpen(false);
        filterButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filtersOpen]);

  useEffect(() => {
    if (selectedPatient) {
      wasModalOpenRef.current = true;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      if (modalMode === "delete") deleteCancelRef.current?.focus();
      else currentPriorityRef.current?.focus();
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
    if (wasModalOpenRef.current) {
      wasModalOpenRef.current = false;
      triggerRef.current?.focus();
    }
    return undefined;
  }, [selectedPatient, modalMode]);

  useEffect(() => {
    if (showDiscardDialog) discardKeepRef.current?.focus();
  }, [showDiscardDialog]);

  useEffect(() => {
    const patientVersion = selectedTicket
      ? (queueSnapshot.patientVersions[selectedTicket] ?? 0)
      : 0;
    if (
      !selectedPatient ||
      saving ||
      localMutationRef.current ||
      patientVersion === openedPatientVersion
    )
      return;
    setDraftPriority(selectedPatient.priority);
    setOpenedPatientVersion(patientVersion);
    setOperationError(
      "Este paciente foi atualizado por outra pessoa. Os dados foram recarregados.",
    );
  }, [
    queueSnapshot.patientVersions,
    selectedPatient,
    selectedTicket,
    openedPatientVersion,
    saving,
  ]);

  useEffect(() => {
    if (!notification) return;
    const update = () => setUndoNow(Date.now());
    const timer = window.setInterval(update, 125);
    const timeout = window.setTimeout(
      () => setNotification(null),
      Math.max(0, notification.expiresAt - Date.now()),
    );
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(timeout);
    };
  }, [notification]);

  useLayoutEffect(() => {
    if (!notification) return;
    const table = document
      .querySelector(".table-wrapper")
      ?.getBoundingClientRect();
    const registerButton = document
      .querySelector(".toolbar-primary-button")
      ?.getBoundingClientRect();
    const toast = document
      .querySelector(".reevaluation-notifications")
      ?.getBoundingClientRect();
    if (!table || !registerButton || !toast) return;
    const obstructionBottom = Math.max(
      table.bottom > toast.top && table.top < toast.bottom ? table.bottom : 0,
      registerButton.bottom > toast.top && registerButton.top < toast.bottom
        ? registerButton.bottom
        : 0,
    );
    if (obstructionBottom > 0)
      window.scrollBy({
        top: obstructionBottom - toast.top + 16,
        behavior: "instant",
      });
  }, [notification]);

  const ledId = ledAnimation?.id;
  const ledTicket = ledAnimation?.ticket;
  useLayoutEffect(() => {
    if (!ledId || !ledTicket) return;
    let cancelled = false;
    let scrollTimeout: number | null = null;
    let frame = 0;
    const row = rowRefs.current.get(ledTicket);
    if (!row) {
      setLedAnimation((current) => (current?.id === ledId ? null : current));
      return;
    }

    const updateBounds = () => {
      if (cancelled) return;
      const rect = row.getBoundingClientRect();
      setLedBounds({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };
    const begin = () => {
      if (cancelled) return;
      updateBounds();
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      setLedAnimation((current) =>
        current?.id === ledId
          ? { ...current, phase: reducedMotion ? "static" : "snake" }
          : current,
      );
    };
    const rect = row.getBoundingClientRect();
    const needsScroll = rect.top < 100 || rect.bottom > window.innerHeight - 24;
    if (needsScroll) {
      row.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "center",
      });
      const onScrollEnd = () => {
        window.removeEventListener("scrollend", onScrollEnd);
        if (scrollTimeout !== null) window.clearTimeout(scrollTimeout);
        begin();
      };
      window.addEventListener("scrollend", onScrollEnd, { once: true });
      scrollTimeout = window.setTimeout(onScrollEnd, 900);
    } else {
      frame = window.requestAnimationFrame(begin);
    }

    const followRow = () => {
      if (cancelled) return;
      const currentRect = row.getBoundingClientRect();
      if (ledOverlayRef.current) {
        ledOverlayRef.current.style.transform = `translate3d(${currentRect.left}px, ${currentRect.top}px, 0)`;
        ledOverlayRef.current.style.width = `${currentRect.width}px`;
        ledOverlayRef.current.style.height = `${currentRect.height}px`;
      }
      frame = window.requestAnimationFrame(followRow);
    };
    frame = window.requestAnimationFrame(followRow);
    window.addEventListener("scroll", updateBounds, { passive: true });
    window.addEventListener("resize", updateBounds);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      if (scrollTimeout !== null) window.clearTimeout(scrollTimeout);
      window.removeEventListener("scroll", updateBounds);
      window.removeEventListener("resize", updateBounds);
    };
  }, [ledId, ledTicket]);

  useEffect(() => {
    if (!ledAnimation || ledAnimation.phase === "pending") return;
    if (ledTimerRef.current !== null) window.clearTimeout(ledTimerRef.current);
    if (ledAnimation.phase === "static") {
      ledTimerRef.current = window.setTimeout(
        () =>
          setLedAnimation((current) =>
            current?.id === ledAnimation.id ? null : current,
          ),
        1500,
      );
    }
    return () => {
      if (ledTimerRef.current !== null)
        window.clearTimeout(ledTimerRef.current);
      ledTimerRef.current = null;
    };
  }, [ledAnimation]);

  const openReevaluation = (
    patient: QueuePatient,
    button: HTMLButtonElement,
  ) => {
    triggerRef.current = button;
    setShowDiscardDialog(false);
    setModalMode("priority");
    setDraftPriority(patient.priority);
    setReason("");
    setOperationError(null);
    setOpenedPatientVersion(queueSnapshot.patientVersions[patient.ticket] ?? 0);
    setSelectedTicket(patient.ticket);
  };

  const openDeleteConfirmation = (
    patient: QueuePatient,
    button: HTMLButtonElement,
  ) => {
    triggerRef.current = button;
    setShowDiscardDialog(false);
    setModalMode("delete");
    setDraftPriority(patient.priority);
    setReason("");
    setDeleteReason("");
    setOperationError(null);
    setOpenedPatientVersion(queueSnapshot.patientVersions[patient.ticket] ?? 0);
    setSelectedTicket(patient.ticket);
  };

  const closeReevaluation = (force = false) => {
    if (modalMode === "priority" && reason.trim().length > 0 && !force) {
      setShowDiscardDialog(true);
      return;
    }
    setShowDiscardDialog(false);
    setSelectedTicket(null);
    setModalMode(null);
    setDraftPriority(null);
    setReason("");
    setDeleteReason("");
    setOperationError(null);
  };

  const showUndoToast = (ticket: string, entryId: string, message: string) => {
    const expiresAt = Date.now() + 15_000;
    setNotification({
      id: entryId,
      ticket,
      entryId,
      kind: "priority",
      tone: "success",
      expiresAt,
      message,
      undoable: true,
    });
  };

  const saveReevaluation = async () => {
    if (
      !selectedPatient ||
      !draftPriority ||
      saving ||
      localMutationRef.current
    )
      return;
    localMutationRef.current = true;
    setSaving(true);
    setOperationError(null);
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    let result;
    try {
      result = changePriority(
        selectedPatient.ticket,
        draftPriority,
        {
          patient: selectedPatient.name,
          previousPriority: selectedPatient.priority,
          newPriority: draftPriority,
          reason: reason.trim(),
          responsible,
          occurredAt: new Date().toISOString(),
        },
        authState.status === "authenticated"
          ? authState.user.role
          : "RECEPCIONISTA",
        openedPatientVersion,
      );
    } catch {
      localMutationRef.current = false;
      setSaving(false);
      setOperationError(
        "Não foi possível salvar a alteração. Tente novamente.",
      );
      return;
    }
    localMutationRef.current = false;
    setSaving(false);
    if (!result.ok || !result.entry) {
      setOperationError(
        result.reason === "stale"
          ? "Este paciente foi atualizado por outra pessoa. Os dados foram recarregados."
          : result.reason === "unauthorized"
            ? "Seu perfil não tem permissão para alterar prioridades."
            : result.reason === "patient-unavailable"
              ? "Este paciente não está mais aguardando atendimento."
              : result.reason === "unchanged-priority"
                ? "Escolha um nível diferente do atual."
                : "Informe um motivo com pelo menos 10 caracteres.",
      );
      setOpenedPatientVersion(
        result.snapshot.patientVersions[selectedPatient.ticket] ?? 0,
      );
      return;
    }
    if (draftPriority === "urgent") {
      window.dispatchEvent(
        new CustomEvent("clinical-alert", {
          detail: {
            ticket: selectedPatient.ticket,
            patient: selectedPatient.name,
          },
        }),
      );
    }
    highlightPatient(
      selectedPatient.ticket,
      draftPriority,
      result.snapshot.patients,
    );
    showUndoToast(
      selectedPatient.ticket,
      result.entry.id,
      `Prioridade de ${selectedPatient.name} alterada para ${PRIORITY_LABEL[draftPriority]}${draftPriority === "urgent" ? ". Corpo clínico alertado." : ""}`,
    );
    closeReevaluation(true);
  };

  const confirmDeletion = async () => {
    if (
      !selectedPatient ||
      !deleteReason ||
      deletingTicket ||
      localMutationRef.current
    )
      return;
    localMutationRef.current = true;
    setDeletingTicket(selectedPatient.ticket);
    setOperationError(null);
    if (selectedPatient.status !== "waiting") {
      setDeletingTicket(null);
      localMutationRef.current = false;
      setOperationError("Este paciente não está mais aguardando atendimento.");
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    let result;
    try {
      result = deletePatient(
        selectedPatient.ticket,
        deleteReason,
        reason.trim(),
        responsible,
        authState.status === "authenticated"
          ? authState.user.role
          : "RECEPCIONISTA",
        openedPatientVersion,
      );
    } catch {
      localMutationRef.current = false;
      setDeletingTicket(null);
      setOperationError(
        "Não foi possível excluir o paciente. Tente novamente.",
      );
      return;
    }
    localMutationRef.current = false;
    setDeletingTicket(null);
    if (!result.ok || !result.entry) {
      setOperationError(
        result.reason === "stale"
          ? "Este paciente foi atualizado por outra pessoa. Os dados foram recarregados."
          : result.reason === "unauthorized"
            ? "Seu perfil não tem permissão para excluir pacientes."
            : result.reason === "invalid-deletion-reason"
              ? "Descreva o motivo da exclusão com pelo menos 10 caracteres."
              : "Este paciente não está mais aguardando atendimento.",
      );
      setOpenedPatientVersion(
        result.snapshot.patientVersions[selectedPatient.ticket] ?? 0,
      );
      return;
    }
    const activeUrgentAlert = result.entry.alertStatus === "active";
    const correction = activeUrgentAlert
      ? `Alerta de ${selectedPatient.name} cancelado: paciente removido da fila.`
      : "";
    if (correction)
      window.dispatchEvent(
        new CustomEvent("clinical-alert-cancelled", {
          detail: { ticket: selectedPatient.ticket, message: correction },
        }),
      );
    const expiresAt = Date.now() + 15_000;
    setNotification({
      id: result.entry.id,
      ticket: selectedPatient.ticket,
      entryId: result.entry.id,
      kind: "deletion",
      tone: "success",
      expiresAt,
      message: `${selectedPatient.name} removido da fila.${correction ? ` ${correction}` : ""}`,
      undoable: true,
    });
    if (patients.length - 1 <= (currentPage - 1) * PAGE_SIZE && currentPage > 1)
      setPageNumber(currentPage - 1);
    closeReevaluation(true);
  };

  const undoDeletion = useCallback(
    (ticket: string, entryId: string) => {
      if (localMutationRef.current) return;
      localMutationRef.current = true;
      const patient = queue.find((item) => item.ticket === ticket);
      const result = undoPatientDeletion(
        ticket,
        entryId,
        responsible,
        authState.status === "authenticated"
          ? authState.user.role
          : "RECEPCIONISTA",
        queueSnapshot.patientVersions[ticket] ?? 0,
      );
      localMutationRef.current = false;
      if (!result.ok || !patient) {
        const message =
          result.reason === "stale"
            ? "Este paciente foi atualizado por outra pessoa. Os dados foram recarregados."
            : "Não foi possível desfazer a exclusão. O prazo expirou ou o registro mudou.";
        setNotification({
          id: crypto.randomUUID(),
          ticket,
          entryId,
          kind: "deletion",
          tone: "error",
          expiresAt: Date.now() + 5500,
          message,
          undoable: false,
        });
        return;
      }
      setPageNumber(1);
      setNotification({
        id: result.entry?.id ?? crypto.randomUUID(),
        ticket,
        entryId: result.entry?.id ?? "",
        kind: "deletion",
        tone: "neutral",
        expiresAt: Date.now() + 5500,
        message: `Exclusão desfeita. ${patient.name} voltou para a fila com a senha ${patient.ticket}.`,
        undoable: false,
      });
    },
    [authState, queue, queueSnapshot.patientVersions, responsible],
  );

  const undoChange = useCallback(
    (ticket: string, entryId: string) => {
      if (localMutationRef.current) return;
      localMutationRef.current = true;
      const patient = queue.find((item) => item.ticket === ticket);
      if (!patient) {
        localMutationRef.current = false;
        return;
      }
      const originalEntry = getUndoEntry(ticket);
      const result = undoPriorityChange(
        ticket,
        responsible,
        authState.status === "authenticated"
          ? authState.user.role
          : "RECEPCIONISTA",
        entryId,
        queueSnapshot.patientVersions[ticket] ?? 0,
      );
      localMutationRef.current = false;
      if (!result.ok || !originalEntry) {
        const message =
          result.reason === "stale"
            ? "Este paciente foi atualizado por outra pessoa. Os dados foram recarregados."
            : getUndoBlockedReason(ticket, Date.now(), entryId);
        setNotification({
          id: crypto.randomUUID(),
          ticket,
          entryId,
          kind: "priority",
          tone: "error",
          expiresAt: Date.now() + 5500,
          message,
          undoable: false,
        });
        setOperationError(message);
        return;
      }
      const correction =
        originalEntry.alertStatus === "active"
          ? `Alerta de ${patient.name} cancelado: alteração desfeita.`
          : null;
      highlightPatient(
        ticket,
        originalEntry.previousPriority,
        result.snapshot.patients,
      );
      setNotification(null);
      setOperationError(null);
      window.dispatchEvent(
        new CustomEvent("clinical-alert-cancelled", {
          detail: { ticket, message: correction },
        }),
      );
      setNotification({
        id: result.entry?.id ?? crypto.randomUUID(),
        ticket,
        entryId: result.entry?.id ?? "",
        kind: "priority",
        tone: "neutral",
        expiresAt: Date.now() + 5500,
        message: `Alteração desfeita. ${patient.name} voltou para ${PRIORITY_LABEL[originalEntry.previousPriority]}.${correction ? ` ${correction}` : ""}`,
        undoable: false,
      });
    },
    [
      authState,
      highlightPatient,
      queue,
      queueSnapshot.patientVersions,
      responsible,
    ],
  );

  const undoFromModal = (ticket: string, entryId: string) => {
    closeReevaluation(true);
    undoChange(ticket, entryId);
  };

  useEffect(() => {
    if (!notification?.undoable || notification.expiresAt <= Date.now()) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z" &&
        !(
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLElement && target.isContentEditable)
        )
      ) {
        event.preventDefault();
        if (notification.kind === "deletion")
          undoDeletion(notification.ticket, notification.entryId);
        else undoChange(notification.ticket, notification.entryId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [notification, undoChange, undoDeletion]);

  const handleModalKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeReevaluation();
      return;
    }
    if (event.key !== "Tab" || !modalRef.current) return;
    const focusable = [
      ...modalRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      ),
    ];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const handleDiscardDialogKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setShowDiscardDialog(false);
      currentPriorityRef.current?.focus();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = event.currentTarget;
    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>("button:not(:disabled)"),
    ];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const undoBlockedReason = selectedPatient
    ? getUndoBlockedReason(selectedPatient.ticket, undoNow)
    : "";
  const undoAgeMinutes = latestPatientChange
    ? Math.max(
        0,
        Math.floor(
          (undoNow - Date.parse(latestPatientChange.occurredAt)) / 60_000,
        ),
      )
    : 0;
  const unmetRequirements = [
    draftPriority === selectedPatient?.priority
      ? "Escolha um nível diferente do atual"
      : null,
    reason.trim().length < 10 ? "Descreva o motivo (mín. 10 caracteres)" : null,
  ].filter(Boolean);
  const toastProgress = notification
    ? Math.max(
        0,
        Math.min(
          100,
          ((notification.expiresAt - undoNow) /
            (notification.undoable ? 15_000 : 5500)) *
            100,
        ),
      )
    : 0;
  const canUndoToast =
    notification?.undoable &&
    (notification.kind === "deletion"
      ? getDeletionUndoEntry(notification.ticket, undoNow)?.id ===
        notification.entryId
      : getUndoEntry(notification.ticket, undoNow)?.id ===
        notification.entryId);

  const totalDisplayed = pagePatients.length;
  const totalProportion = {
    urgent: (summaryCounts.urgent / TOTAL_QUEUE_COUNT) * 100,
    alert: (summaryCounts.alert / TOTAL_QUEUE_COUNT) * 100,
    calm: (summaryCounts.calm / TOTAL_QUEUE_COUNT) * 100,
  };

  return (
    <AppShell>
      <div className="reception-page" data-audit-count={auditEntries.length}>
        <header className="reception-header">
          <div className="reception-header-copy">
            <p className="breadcrumb">
              TRIAGEM &amp; RECEPÇÃO <span>›</span> GESTÃO DE FILA
            </p>
            <h1>Fila de Espera e Gestão de Prioridades</h1>
            <p className="reception-subtitle">
              Acompanhamento em tempo real dos pacientes aguardando atendimento
              clínico e emergencial.
            </p>
          </div>
        </header>

        <section className="stats-panel" aria-label="Resumo da fila">
          <article className="total-card" aria-label="Total em espera">
            <div className="total-header-row">
              <div>
                <span className="tiny-label">TOTAL EM ESPERA</span>
                <div className="total-main-line">
                  <strong>{totalActive}</strong>
                  <span className="total-subline">
                    pacientes no fluxo ativo
                  </span>
                </div>
              </div>
              <div className="total-icon" aria-hidden="true">
                <Users size={18} />
              </div>
            </div>
            <div className="proportion-bar" aria-hidden="true">
              <span
                className="proportion urgent"
                style={{ width: `${totalProportion.urgent}%` }}
              />
              <span
                className="proportion alert"
                style={{ width: `${totalProportion.alert}%` }}
              />
              <span
                className="proportion calm"
                style={{ width: `${totalProportion.calm}%` }}
              />
            </div>
          </article>

          <article className="risk-summary">
            <div className="risk-summary-header">
              <p>CLASSIFICAÇÃO DE RISCO (MANCHESTER MODIFICADO)</p>
            </div>

            <div className="risk-grid">
              <div className="mini-stat urgent">
                <div className="mini-stat-head">
                  <strong>{summaryCounts.urgent} Urgentes</strong>
                  <span className="mini-icon urgent-icon" aria-hidden="true">
                    !
                  </span>
                </div>
                <small>Meta: &lt; 15 min</small>
              </div>

              <div className="mini-stat alert">
                <div className="mini-stat-head">
                  <strong>{summaryCounts.alert} Alertas</strong>
                  <span className="mini-icon alert-icon" aria-hidden="true">
                    <AlertTriangle size={14} />
                  </span>
                </div>
                <small>Meta: &lt; 30 min</small>
              </div>

              <div className="mini-stat calm">
                <div className="mini-stat-head">
                  <strong>{summaryCounts.calm} Tranquilos</strong>
                  <span className="mini-icon calm-icon" aria-hidden="true">
                    <CheckCheck size={14} />
                  </span>
                </div>
                <small>Meta: &lt; 60 min</small>
              </div>
            </div>
          </article>
        </section>

        <div className="toolbar" aria-label="Ferramentas da fila">
          <div className="search-box">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={search}
              aria-label="Filtrar por nome, senha ou queixa"
              placeholder="Filtrar por nome, senha ou queixa..."
              onChange={(event) => {
                setSearch(event.target.value);
                setPageNumber(1);
              }}
            />
            {search && (
              <button
                type="button"
                className="search-clear"
                aria-label="Limpar pesquisa"
                onClick={() => {
                  setSearch("");
                  setPageNumber(1);
                }}
              >
                <X size={15} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="filter-control" ref={filterControlRef}>
            <button
              ref={filterButtonRef}
              type="button"
              className="secondary-button toolbar-button"
              aria-expanded={filtersOpen}
              aria-controls="queue-filter-popover"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Filter size={14} aria-hidden="true" />
              Filtrar
              {activeFilterCount > 0 && (
                <span
                  className="filter-count"
                  aria-label={`${activeFilterCount} filtros ativos`}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>
            {filtersOpen && (
              <div
                id="queue-filter-popover"
                className="filter-popover"
                role="dialog"
                aria-label="Filtros avançados da fila"
              >
                <div className="filter-popover-header">
                  <strong>Filtros avançados</strong>
                  <button
                    type="button"
                    className="filter-clear-button"
                    disabled={activeFilterCount === 0}
                    onClick={() => {
                      setPriorityFilter("all");
                      setAgeFilter("all");
                      setWaitFilter("all");
                      setPageNumber(1);
                    }}
                  >
                    Limpar filtros
                  </button>
                </div>
                <div className="filter-fields">
                  <AuthoredSelect
                    id="queue-filter-priority"
                    label="Prioridade"
                    value={priorityFilter}
                    options={PRIORITY_FILTER_OPTIONS}
                    onChange={(value) => {
                      setPriorityFilter(value as PriorityFilter);
                      setPageNumber(1);
                    }}
                  />
                  <AuthoredSelect
                    id="queue-filter-age"
                    label="Faixa etária"
                    value={ageFilter}
                    options={AGE_FILTER_OPTIONS}
                    onChange={(value) => {
                      setAgeFilter(value as AgeFilter);
                      setPageNumber(1);
                    }}
                  />
                  <AuthoredSelect
                    id="queue-filter-wait"
                    label="Tempo de espera"
                    value={waitFilter}
                    options={WAIT_FILTER_OPTIONS}
                    onChange={(value) => {
                      setWaitFilter(value as WaitFilter);
                      setPageNumber(1);
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="primary-button toolbar-primary-button"
            onClick={() => navigate(newRegistrationPath)}
          >
            <UserPlus size={14} aria-hidden="true" />
            Cadastrar Paciente
          </button>
        </div>

        {patients.length === 0 ? (
          <div className="empty-state">
            <strong>Nenhum paciente encontrado.</strong>
            <span>Revise a pesquisa ou os filtros aplicados.</span>
            {hasListCriteria && (
              <button
                type="button"
                className="secondary-button tiny-button"
                onClick={() => {
                  setSearch("");
                  setPriorityFilter("all");
                  setAgeFilter("all");
                  setWaitFilter("all");
                  setPageNumber(1);
                }}
              >
                Limpar pesquisa e filtros
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="queue-table">
                <colgroup>
                  <col className="queue-col-ticket" />
                  <col className="queue-col-name" />
                  <col className="queue-col-age" />
                  <col className="queue-col-complaint" />
                  <col className="queue-col-priority" />
                  <col className="queue-col-wait" />
                  <col className="queue-col-action" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Senha</th>
                    <th scope="col">Nome do paciente</th>
                    <th scope="col">Idade</th>
                    <th scope="col">Queixa principal</th>
                    <th scope="col">Classificação / Prioridade</th>
                    <th scope="col">Tempo de espera</th>
                    <th scope="col" className="queue-action-heading">
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagePatients.map((patient) => {
                    const priorityClass = patient.priority;
                    const prefix = `${patient.ticket.split("-")[0]}-`;
                    const number = patient.ticket.split("-")[1];
                    const isSelected = patient.ticket === selectedTicket;
                    return (
                      <tr
                        key={patient.ticket}
                        data-patient-ticket={patient.ticket}
                        ref={(element) => {
                          if (element)
                            rowRefs.current.set(patient.ticket, element);
                          else rowRefs.current.delete(patient.ticket);
                        }}
                        className={
                          `${isSelected ? `is-reassessing ${patient.priority}` : ""}${deletingTicket === patient.ticket ? " is-removing" : ""}`.trim() ||
                          undefined
                        }
                      >
                        <td className={`ticket-cell ${priorityClass}`}>
                          <span className="ticket-prefix">{prefix}</span>
                          <span className="ticket-number">{number}</span>
                        </td>
                        <td>
                          <div className="patient-name-cell">
                            <span
                              className={`patient-avatar ${priorityClass}`}
                              aria-hidden="true"
                            >
                              {patient.name
                                .split(" ")
                                .slice(0, 2)
                                .map((part) => part[0])
                                .join("")
                                .toUpperCase()}
                            </span>
                            {patient.name}
                          </div>
                        </td>
                        <td>{patient.age} anos</td>
                        <td>{patient.complaint}</td>
                        <td>
                          <PriorityBadge priority={patient.priority} />
                        </td>
                        <td>
                          <span
                            className={`wait-cell wait-${patient.priority}`}
                            aria-label={`${getWaitMinutes(patient, clockNow)} minutos de espera`}
                          >
                            <Clock3 size={14} aria-hidden="true" />
                            {String(getWaitMinutes(patient, clockNow)).padStart(
                              2,
                              "0",
                            )}{" "}
                            min
                          </span>
                        </td>
                        <td className="queue-action-cell">
                          <div className="queue-row-actions">
                            <button
                              type="button"
                              className={`inline-action${isSelected ? ` is-editing ${patient.priority}` : ""}`}
                              style={
                                isSelected
                                  ? {
                                      backgroundColor: `var(--nivel-${priorityClass === "urgent" ? "urgente" : priorityClass === "alert" ? "alerta" : "tranquilo"}-acao)`,
                                      borderColor: `var(--nivel-${priorityClass === "urgent" ? "urgente" : priorityClass === "alert" ? "alerta" : "tranquilo"}-borda)`,
                                      color: `var(--nivel-${priorityClass === "alert" ? "alerta" : priorityClass === "urgent" ? "urgente" : "tranquilo"}-texto)`,
                                      transition: "none",
                                    }
                                  : undefined
                              }
                              onClick={(event) => {
                                setUndoNow(Date.now());
                                openReevaluation(patient, event.currentTarget);
                              }}
                            >
                              {isSelected ? (
                                <Pencil size={13} aria-hidden="true" />
                              ) : (
                                <ArrowUpDown size={13} aria-hidden="true" />
                              )}
                              {isSelected
                                ? "Alterando..."
                                : "Alterar prioridade"}
                            </button>
                            {canDeletePatients && (
                              <button
                                type="button"
                                className="inline-delete"
                                aria-label={`Excluir paciente ${patient.name}`}
                                title={
                                  patient.status !== "waiting"
                                    ? "Paciente já foi chamado ou está em atendimento"
                                    : "Excluir paciente"
                                }
                                disabled={
                                  patient.status !== "waiting" ||
                                  selectedTicket !== null
                                }
                                onClick={(event) =>
                                  openDeleteConfirmation(
                                    patient,
                                    event.currentTarget,
                                  )
                                }
                              >
                                <Trash2 size={15} aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="table-footer-bar">
              <span>
                Mostrando{" "}
                <strong>
                  {totalDisplayed ? (currentPage - 1) * PAGE_SIZE + 1 : 0}-
                  {(currentPage - 1) * PAGE_SIZE + totalDisplayed}
                </strong>{" "}
                de <strong>{listedTotal}</strong> pacientes aguardando
                atendimento
              </span>
              <div className="pagination" aria-label="Paginação da fila">
                <button
                  type="button"
                  className="secondary-button tiny-button"
                  disabled={currentPage <= 1}
                  onClick={() => setPageNumber((page) => Math.max(1, page - 1))}
                >
                  ‹ Anterior
                </button>
                <span className="pagination-copy">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  type="button"
                  className="secondary-button tiny-button"
                  disabled={currentPage >= totalPages}
                  onClick={() =>
                    setPageNumber((page) => Math.min(totalPages, page + 1))
                  }
                >
                  Próxima ›
                </button>
              </div>
            </div>
          </>
        )}

        <section className="info-grid" aria-label="Informações operacionais">
          <article className="info-card">
            <div className="info-icon" aria-hidden="true">
              <ShieldCheck size={16} />
            </div>
            <div>
              <h3>Protocolo Institucional</h3>
              <p>
                Alterações manuais de prioridade ficam registradas com carimbo
                de CRM/COREN e justificativa clínica obrigatória.
              </p>
            </div>
          </article>

          <article className="info-card">
            <div className="info-icon" aria-hidden="true">
              <ArrowUpDown size={16} />
            </div>
            <div>
              <h3>Sincronização com Painel TV</h3>
              <p>
                A mudança de categoria reordena imediatamente a exibição no
                monitor de chamadas do saguão.
              </p>
            </div>
          </article>

          <article className="info-card">
            <div className="info-icon" aria-hidden="true">
              <Siren size={16} />
            </div>
            <div>
              <h3>Alerta ao Corpo Clínico</h3>
              <p>
                Pacientes reclassificados para Vermelho emitem aviso sonoro no
                posto médico de plantão.
              </p>
            </div>
          </article>
        </section>
      </div>
      {selectedPatient &&
        draftPriority &&
        createPortal(
          <div
            className="reevaluation-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeReevaluation();
            }}
          >
            <div
              ref={modalRef}
              className={`reevaluation-modal${modalMode === "delete" ? " deletion-modal" : ""}`}
              role={modalMode === "delete" ? "alertdialog" : "dialog"}
              aria-modal="true"
              aria-labelledby={
                modalMode === "delete" ? "deletion-title" : "reevaluation-title"
              }
              onKeyDown={handleModalKeyDown}
            >
              {modalMode === "delete" ? (
                <>
                  <header className="reevaluation-header">
                    <div>
                      <p className="reevaluation-eyebrow deletion-eyebrow">
                        <Trash2 size={14} aria-hidden="true" /> EXCLUSÃO DE
                        REGISTRO
                      </p>
                      <h2 id="deletion-title">Excluir paciente da fila?</h2>
                    </div>
                    <button
                      type="button"
                      className="reevaluation-close"
                      aria-label="Fechar modal"
                      disabled={deletingTicket !== null}
                      onClick={() => closeReevaluation()}
                    >
                      <X size={18} aria-hidden="true" />
                    </button>
                  </header>

                  <div className="deletion-patient-card">
                    <div className="deletion-patient-heading">
                      <strong>{selectedPatient.name}</strong>
                      <span
                        className={`reevaluation-ticket priority-${selectedPatient.priority}`}
                      >
                        {selectedPatient.ticket}
                      </span>
                    </div>
                    <p>
                      {selectedPatient.age} anos · {selectedPatient.complaint}
                    </p>
                  </div>

                  <p className="deletion-warning">
                    Esta ação remove o paciente da fila de espera e do Painel
                    Público. O registro fica guardado na auditoria.
                  </p>

                  <AuthoredSelect
                    id="deletion-reason-select"
                    className="deletion-reason-field"
                    label="Motivo da exclusão"
                    value={deleteReason}
                    options={DELETE_REASON_OPTIONS}
                    required
                    onChange={(value) => {
                      setDeleteReason(value as typeof deleteReason);
                      setReason("");
                    }}
                  />

                  {deleteReason === "Outro" && (
                    <>
                      <label
                        className="reevaluation-reason-label deletion-other-label"
                        htmlFor="deletion-reason-other"
                      >
                        <span>
                          Descreva o motivo <strong>*</strong>
                        </span>
                        <span className="reason-counter">
                          {reason.length}/300 caracteres
                        </span>
                      </label>
                      <textarea
                        id="deletion-reason-other"
                        className="reevaluation-reason resize-none"
                        value={reason}
                        maxLength={300}
                        required
                        placeholder="Descreva o motivo da exclusão..."
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </>
                  )}

                  <div className="reevaluation-responsible">
                    <Stethoscope size={15} aria-hidden="true" />
                    <span>
                      Responsável: <strong>{responsible}</strong> (CRM/COREN
                      123456)
                    </span>
                  </div>

                  {operationError && (
                    <p className="reevaluation-operation-error" role="alert">
                      {operationError}
                    </p>
                  )}
                  {(!deleteReason ||
                    (deleteReason === "Outro" &&
                      reason.trim().length < 10)) && (
                    <p className="reevaluation-requirements" aria-live="polite">
                      {!deleteReason
                        ? "Selecione o motivo da exclusão"
                        : "Descreva o motivo (mín. 10 caracteres)"}
                    </p>
                  )}

                  <footer className="reevaluation-footer deletion-footer">
                    <button
                      ref={deleteCancelRef}
                      type="button"
                      className="secondary-button"
                      disabled={deletingTicket !== null}
                      onClick={() => closeReevaluation()}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="primary-button deletion-confirm"
                      disabled={
                        deletingTicket !== null ||
                        !deleteReason ||
                        (deleteReason === "Outro" && reason.trim().length < 10)
                      }
                      onClick={() => void confirmDeletion()}
                    >
                      <Trash2 size={15} aria-hidden="true" />{" "}
                      {deletingTicket ? "Excluindo..." : "Excluir paciente"}
                    </button>
                  </footer>
                </>
              ) : (
                <>
                  <header className="reevaluation-header">
                    <div>
                      <p className="reevaluation-eyebrow">
                        <Activity size={14} aria-hidden="true" /> REAVALIAÇÃO
                        CLÍNICA
                      </p>
                      <h2 id="reevaluation-title">
                        Alterar Prioridade do Paciente
                      </h2>
                    </div>
                    <button
                      type="button"
                      className="reevaluation-close"
                      aria-label="Fechar modal"
                      disabled={saving}
                      onClick={() => closeReevaluation()}
                    >
                      <X size={18} aria-hidden="true" />
                    </button>
                  </header>

                  <div className="reevaluation-patient-line">
                    <span>
                      Paciente: <strong>{selectedPatient.name}</strong>
                    </span>
                    <span
                      className={`reevaluation-ticket ${selectedPatient.priority}`}
                    >
                      {selectedPatient.ticket}
                    </span>
                  </div>

                  <fieldset className="priority-choice-group">
                    <legend>Selecione o Novo Nível de Gravidade</legend>
                    <div className="priority-choice-grid">
                      {(["calm", "alert", "urgent"] as const).map(
                        (priority, index) => (
                          <button
                            key={priority}
                            ref={
                              index === 0 || draftPriority === priority
                                ? currentPriorityRef
                                : undefined
                            }
                            type="button"
                            className={`priority-choice ${priority}${draftPriority === priority ? " is-selected" : ""}`}
                            aria-pressed={draftPriority === priority}
                            onClick={() => setDraftPriority(priority)}
                          >
                            <span
                              className="priority-choice-dot"
                              aria-hidden="true"
                            />
                            {PRIORITY_LABEL[priority]}
                            {draftPriority === priority && (
                              <Check size={15} aria-hidden="true" />
                            )}
                          </button>
                        ),
                      )}
                    </div>
                  </fieldset>

                  <div
                    className="reevaluation-vitals"
                    aria-label="Sinais vitais, somente leitura"
                  >
                    <strong>Sinais vitais</strong>
                    <span>
                      PA: {selectedPatient.vitals.bloodPressure} mmHg · FC:{" "}
                      {selectedPatient.vitals.heartRate} bpm · SpO2:{" "}
                      {selectedPatient.vitals.oxygenSaturation}% · Temp:{" "}
                      {selectedPatient.vitals.temperature.toFixed(1)}°C
                    </span>
                  </div>

                  <label
                    className="reevaluation-reason-label"
                    htmlFor="reevaluation-reason"
                  >
                    <span>
                      Motivo da alteração de prioridade <strong>*</strong>
                    </span>
                    <span className="reason-counter">
                      {reason.length}/300 caracteres
                    </span>
                  </label>
                  <textarea
                    id="reevaluation-reason"
                    className="reevaluation-reason resize-none"
                    value={reason}
                    maxLength={300}
                    required
                    placeholder="Descreva o motivo da reclassificação..."
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <p className="reason-validation" aria-live="polite">
                    {reason.length > 0 && reason.trim().length < 10
                      ? "Informe pelo menos 10 caracteres."
                      : " "}
                  </p>

                  <div className="reevaluation-responsible">
                    <Stethoscope size={15} aria-hidden="true" />
                    <span>
                      Responsável: <strong>{responsible}</strong> (CRM/SP
                      123456)
                    </span>
                  </div>

                  {operationError && (
                    <p className="reevaluation-operation-error" role="alert">
                      {operationError}
                    </p>
                  )}

                  {unmetRequirements.length > 0 && (
                    <p className="reevaluation-requirements" aria-live="polite">
                      {unmetRequirements.join(" · ")}
                    </p>
                  )}

                  {latestPatientChange && (
                    <div className="reevaluation-undo-row">
                      <button
                        type="button"
                        className="reevaluation-inline-undo"
                        disabled={!recentUndoEntry || saving}
                        title={
                          !recentUndoEntry
                            ? undoBlockedReason
                            : `Desfazer última alteração para ${PRIORITY_LABEL[latestPatientChange.previousPriority]}`
                        }
                        onClick={() =>
                          undoFromModal(
                            selectedPatient.ticket,
                            latestPatientChange.id,
                          )
                        }
                      >
                        <History size={14} aria-hidden="true" />
                        Desfazer última alteração (voltar para{" "}
                        {PRIORITY_LABEL[latestPatientChange.previousPriority]})
                      </button>
                      <small>
                        Alterado por {latestPatientChange.responsible} há{" "}
                        {undoAgeMinutes} min
                      </small>
                    </div>
                  )}

                  <footer className="reevaluation-footer">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={saving}
                      onClick={() => closeReevaluation()}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="primary-button reevaluation-save"
                      disabled={
                        saving ||
                        draftPriority === selectedPatient.priority ||
                        reason.trim().length < 10
                      }
                      onClick={() => void saveReevaluation()}
                    >
                      <Check size={16} aria-hidden="true" />{" "}
                      {saving ? "Salvando..." : "Salvar Alteração"}
                    </button>
                  </footer>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
      {showDiscardDialog &&
        createPortal(
          <div className="reevaluation-overlay reevaluation-discard-overlay">
            <div
              className="discard-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="discard-dialog-title"
              aria-describedby="discard-dialog-copy"
              tabIndex={-1}
              onKeyDown={handleDiscardDialogKeyDown}
            >
              <p className="reevaluation-eyebrow">ALTERAÇÕES NÃO SALVAS</p>
              <h2 id="discard-dialog-title">Descartar alterações?</h2>
              <p id="discard-dialog-copy">
                O motivo preenchido será perdido se você sair desta reavaliação.
              </p>
              <footer className="reevaluation-footer">
                <button
                  ref={discardKeepRef}
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setShowDiscardDialog(false);
                    currentPriorityRef.current?.focus();
                  }}
                >
                  Manter edição
                </button>
                <button
                  type="button"
                  className="primary-button discard-confirm"
                  onClick={() => closeReevaluation(true)}
                >
                  Descartar alterações
                </button>
              </footer>
            </div>
          </div>,
          document.body,
        )}
      {ledAnimation &&
        ledAnimation.phase !== "pending" &&
        ledBounds &&
        createPortal(
          <div
            ref={ledOverlayRef}
            className={`queue-led-overlay led-${ledAnimation.priority} led-phase-${ledAnimation.phase}`}
            data-led-phase={ledAnimation.phase}
            data-patient-ticket={ledAnimation.ticket}
            data-priority={ledAnimation.priority}
            style={{
              top: 0,
              left: 0,
              width: ledBounds.width,
              height: ledBounds.height,
              transform: `translate3d(${ledBounds.left}px, ${ledBounds.top}px, 0)`,
            }}
            aria-hidden="true"
          >
            <svg
              className="queue-led-svg"
              width="100%"
              height="100%"
              viewBox={`0 0 ${ledBounds.width} ${ledBounds.height}`}
              preserveAspectRatio="none"
            >
              {ledAnimation.phase === "snake" &&
                [0, 1, 2, 3].map((segment) => (
                  <rect
                    key={`${ledAnimation.id}-${segment}`}
                    className={`queue-led-path queue-led-snake queue-led-snake-${segment}`}
                    x="1"
                    y="1"
                    width={Math.max(0, ledBounds.width - 2)}
                    height={Math.max(0, ledBounds.height - 2)}
                    rx="8"
                    pathLength="100"
                    strokeDasharray="6 94"
                    style={{ strokeDashoffset: -segment * 6 }}
                    onAnimationEnd={
                      segment === 0
                        ? (event) => {
                            if (event.animationName === "led-snake-0") {
                              setLedAnimation((current) =>
                                current?.id === ledAnimation.id
                                  ? { ...current, phase: "blink" }
                                  : current,
                              );
                            }
                          }
                        : undefined
                    }
                  />
                ))}
              {ledAnimation.phase === "blink" && (
                <rect
                  className="queue-led-path queue-led-blink"
                  x="1"
                  y="1"
                  width={Math.max(0, ledBounds.width - 2)}
                  height={Math.max(0, ledBounds.height - 2)}
                  rx="8"
                  pathLength="100"
                  strokeDasharray="100"
                  style={{
                    animationIterationCount:
                      ledAnimation.priority === "calm" ? 1 : 2,
                  }}
                  onAnimationEnd={(event) => {
                    if (event.animationName === "led-blink") {
                      setLedAnimation((current) =>
                        current?.id === ledAnimation.id ? null : current,
                      );
                      setLedBounds(null);
                    }
                  }}
                />
              )}
              {ledAnimation.phase === "static" && (
                <rect
                  className="queue-led-path queue-led-static"
                  x="1"
                  y="1"
                  width={Math.max(0, ledBounds.width - 2)}
                  height={Math.max(0, ledBounds.height - 2)}
                  rx="8"
                  pathLength="100"
                  strokeDasharray="100"
                />
              )}
            </svg>
          </div>,
          document.body,
        )}
      {notification &&
        createPortal(
          <div
            key={notification.id}
            className={`reevaluation-notifications tone-${notification.tone}`}
            role="status"
            aria-live="polite"
          >
            <p>{notification.message}</p>
            {notification.undoable && (
              <button
                type="button"
                className="reevaluation-toast-undo"
                disabled={!canUndoToast}
                title={
                  !canUndoToast
                    ? notification.kind === "deletion"
                      ? "Não foi possível desfazer a exclusão: prazo expirado ou registro alterado."
                      : getUndoBlockedReason(
                          notification.ticket,
                          undoNow,
                          notification.entryId,
                        )
                    : "Desfazer alteração"
                }
                onClick={() =>
                  notification.kind === "deletion"
                    ? undoDeletion(notification.ticket, notification.entryId)
                    : undoChange(notification.ticket, notification.entryId)
                }
              >
                <History size={14} aria-hidden="true" /> Desfazer
              </button>
            )}
            <span
              className="reevaluation-toast-progress"
              style={{ transform: `scaleX(${toastProgress / 100})` }}
              aria-hidden="true"
            />
          </div>,
          document.body,
        )}
    </AppShell>
  );
}
