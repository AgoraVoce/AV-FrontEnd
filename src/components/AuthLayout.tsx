import type { ReactNode } from "react";
import { Brand } from "./Brand";
import { LOGIN_PRESENTATION } from "../auth/role-presentation";

export function AuthLayout({
  children,
  titleId,
  presentation = LOGIN_PRESENTATION,
}: {
  children: ReactNode;
  titleId: string;
  presentation?: typeof LOGIN_PRESENTATION;
}) {
  return (
    <main className="login-page">
      <div className="login-card">
        <aside className="brand-panel">
          <Brand />
          <div className="brand-story">
            <h2>
              {presentation.headline.map((line, index) => (
                <span key={line}>
                  {index > 0 ? " " : ""}
                  {line}
                </span>
              ))}
              <span className="brand-accent"> {presentation.accent}</span>
            </h2>
            <p>{presentation.description}</p>
          </div>
          <div className="brand-bottom">
            <svg
              className="pulse-line"
              viewBox="0 0 560 88"
              fill="none"
              aria-hidden="true"
              preserveAspectRatio="none"
            >
              <path d="M0 57H128c11 0 13-13 20-13s11 17 17 13l18-52c2-6 5-6 7 0l17 66c2 7 6 6 8-1l11-36c3-9 7-9 11 0l5 10H560" />
            </svg>
            <p>Recepção e atendimento, juntos.</p>
          </div>
        </aside>
        <section className="form-panel" aria-labelledby={titleId}>
          <div className="form-content">{children}</div>
        </section>
      </div>
      <footer className="page-footer">Agora Você</footer>
    </main>
  );
}
