interface IdentificacaoPacienteProps {
  nome: string;
  idade: string;
  cpf: string;
  onChange: (field: "nome" | "idade" | "cpf", value: string) => void;
}

export function IdentificacaoPaciente({ nome, idade, cpf, onChange }: IdentificacaoPacienteProps) {
  return (
    <section className="nc-panel" aria-labelledby="nc-identificacao-title">
      <div className="nc-panel-heading">
        <div>
          <p className="nc-eyebrow">IDENTIFICAÇÃO DO PACIENTE</p>
          <h2 id="nc-identificacao-title">Identificação do Paciente</h2>
        </div>
        <span className="nc-step-badge">ETAPA 1 DE 2</span>
      </div>
      <div className="nc-fields nc-identity-fields">
        <label className="nc-field nc-name-field">
          <span>Nome completo <b>*</b></span>
          <input autoComplete="name" value={nome} onChange={(event) => onChange("nome", event.target.value)} required />
        </label>
        <label className="nc-field">
          <span>Idade <b>*</b></span>
          <div className="nc-input-suffix">
            <input type="number" min="0" max="120" value={idade} onChange={(event) => onChange("idade", event.target.value)} required />
            <span>anos</span>
          </div>
        </label>
        <label className="nc-field">
          <span>CPF</span>
          <input inputMode="numeric" autoComplete="off" value={cpf} onChange={(event) => onChange("cpf", event.target.value)} placeholder="000.000.000-00" />
        </label>
      </div>
    </section>
  );
}