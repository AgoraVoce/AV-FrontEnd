export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand${compact ? " brand--compact" : ""}`}>
      <img src="/agora-voce-logo.png" width="54" height="54" alt="" />
      <span>
        Agora <span className="brand-accent">Você</span>
      </span>
    </div>
  );
}
