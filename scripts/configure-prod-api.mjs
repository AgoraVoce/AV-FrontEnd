import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const raw = process.argv[2]?.trim();
if (!raw) {
  console.error("Uso: npm run config:api -- https://sua-api-de-producao");
  process.exitCode = 1;
} else {
  let url;
  try { url = new URL(raw); } catch { console.error("URL inválida: informe a origem HTTPS da API."); process.exit(1); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    console.error("Use somente a origem HTTPS pública, sem /api/v1, credenciais, caminhos ou parâmetros.");
    process.exit(1);
  }
  const file = resolve(".env.local");
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  const updates = { API_PROXY_TARGET: url.origin, VITE_AV_LOCAL_API: "true" };
  // Avoid accidentally bypassing the same-origin Vite proxy via an older direct URL.
  const lines = existing.split(/\r?\n/).filter(line => !/^\s*(API_PROXY_TARGET|VITE_AV_LOCAL_API|VITE_AV_API_ORIGIN)\s*=/.test(line));
  for (const [name, value] of Object.entries(updates)) lines.push(name + "=" + value);
  writeFileSync(file, lines.join("\n").trim() + "\n", { encoding: "utf8", mode: 0o600 });
  console.info(".env.local configurado para consumir a API de produção via proxy local.");
  console.info("Origem: " + url.origin);
  console.info("Execute npm run dev; reinicie o Vite se ele já estiver aberto.");
  console.info("ATENÇÃO: criação, alteração e exclusão de dados terão efeito no ambiente de produção.");
}
