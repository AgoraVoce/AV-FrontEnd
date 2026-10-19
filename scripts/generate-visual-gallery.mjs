import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(process.cwd(), "artifacts/visual-review");
mkdirSync(root, { recursive: true });

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return entry.name.endsWith(".json") ? [absolute] : [];
  });
}
function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

const frames = walk(root).map((file) => JSON.parse(readFileSync(file, "utf8"))).sort((a, b) =>
  (a.mode + "/" + a.viewport + "/" + a.screen).localeCompare(b.mode + "/" + b.viewport + "/" + b.screen, "pt-BR"),
);
const warnings = frames.filter((item) => item.overflowPx > 8 || item.brokenImages.length > 0 || item.pageErrors.length > 0);
const groups = [
  ["api", "Integração com API simulada (sem dados reais)"],
  ["demo", "Prévia de design (dados fictícios)"],
];

const cards = (items) => items.map((item) => {
  const errors = [
    item.overflowPx > 8 ? "Overflow: " + item.overflowPx + "px" : "",
    ...(item.brokenImages || []).map((x) => "Imagem quebrada: " + x),
    ...(item.pageErrors || []).map((x) => "JS: " + x),
  ].filter(Boolean);
  const issue = errors.length ? "<p class='warning'>" + errors.map(escapeHtml).join("<br>") + "</p>" : "<p class='ok'>Sem problemas detectados automaticamente</p>";
  const img = escapeHtml(item.image);
  return "<article class='screen'>" +
    "<div class='screen-info'><div><strong>" + escapeHtml(item.screen) + "</strong>" +
    "<small>" + escapeHtml(item.urlPath) + " · " + escapeHtml(item.viewport) +
    " · largura " + escapeHtml(item.viewportWidth) + "px</small></div>" +
    "<span class='tag " + (errors.length ? "tag-warning" : "") + "'>" + (errors.length ? "REVISAR" : "OK AUTOMÁTICO") + "</span></div>" +
    "<a href='" + img + "' target='_blank' rel='noopener noreferrer' aria-label='Abrir imagem de " + escapeHtml(item.screen) + "'>" +
    "<img src='" + img + "' loading='lazy' alt='Captura integral de " + escapeHtml(item.screen) + " em " + escapeHtml(item.viewport) + "'></a>" +
    issue + "</article>";
}).join("\n");

const sections = groups.map(([mode, label]) => {
  const items = frames.filter((item) => item.mode === mode);
  return "<section id='" + mode + "'><h2>" + escapeHtml(label) + " <span>" + items.length + " telas</span></h2>" +
    "<div class='screens'>" + cards(items) + "</div></section>";
}).join("\n");

const html = "<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" +
  "<title>Agora Você · Revisão visual das telas</title><style>" +
  ":root{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color-scheme:light;background:#f2f6f7;color:#132c38}" +
  "*{box-sizing:border-box}body{margin:0}header{padding:34px clamp(20px,4vw,68px);background:#fff;border-bottom:1px solid #d8e3e6}" +
  "h1{font-size:clamp(23px,3vw,36px);margin:4px 0 12px}p{line-height:1.5}header p{max-width:850px;color:#526977;margin:0}" +
  "nav{display:flex;flex-wrap:wrap;gap:12px;margin-top:18px}nav a{padding:9px 14px;background:#e9f5f3;color:#006d66;border-radius:9px;text-decoration:none;font-weight:700}" +
  "main{max-width:1800px;margin:0 auto;padding:24px clamp(16px,3vw,45px) 70px}section{margin-bottom:45px}" +
  "h2{font-size:21px;margin:0 0 19px;display:flex;align-items:center;gap:14px}h2 span{font-size:12px;color:#526977;font-weight:400}" +
  ".screens{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,470px),1fr));gap:22px;align-items:start}" +
  ".screen{border:1px solid #dbe5e9;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 5px 18px #153f4d0a}" +
  ".screen-info{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:16px}" +
  ".screen strong,.screen small{display:block}.screen strong{font-size:15px;overflow-wrap:anywhere}.screen small{margin-top:5px;font-size:12px;color:#687e89}" +
  ".screen img{display:block;max-width:100%;width:100%;height:auto;border-top:1px solid #e8eeee;cursor:zoom-in}" +
  ".tag{font-size:10px;white-space:nowrap;font-weight:800;color:#166534;background:#dcfce7;padding:6px 9px;border-radius:99px}" +
  ".tag-warning{color:#9a3412;background:#ffedd5}.screen p{margin:0;padding:10px 16px 15px;font-size:12px}" +
  ".ok{color:#376950}.warning{color:#991b1b}.summary{margin-top:12px;font-weight:700;color:#215f5b}" +
  "@media(max-width:540px){header{padding:22px 16px}.screen-info{flex-wrap:wrap}.screens{grid-template-columns:minmax(0,1fr)}}" +
  "</style></head><body><header><p>AGORA VOCÊ · QUALITY ASSURANCE</p><h1>Galeria de revisão visual</h1>" +
  "<p>Capturas integrais geradas após os testes Chromium em cada pull request. Dados são fictícios e as requisições da API são interceptadas no navegador. Clique em qualquer imagem para conferir a tela completa.</p>" +
  "<p class='summary'>" + frames.length + " capturas · " + warnings.length + " telas com alerta automático · Desktop, mobile e TV Full HD</p>" +
  "<nav><a href='#api'>Integração API</a><a href='#demo'>Prévia de design</a></nav></header>" +
  "<main>" + sections + "</main></body></html>";
writeFileSync(join(root, "index.html"), html, "utf8");

const markdown = [
  "# Agora Você — Revisão visual de PR",
  "",
  "Capturas com dados sintéticos, feitas por Chromium após testes automatizados.",
  "Abra `index.html` para comparar as telas por perfil e viewport.",
  "",
  "Total: **" + frames.length + "** | Alertas: **" + warnings.length + "**.",
  "",
  "## Capturas",
  "",
  ...frames.map((item) =>
    "- [" + item.mode + "/" + item.viewport + "/" + item.screen + "](" + item.image + ")" +
    (item.overflowPx > 8 ? " — overflow " + item.overflowPx + "px" : "") +
    (item.pageErrors.length ? " — erro JavaScript" : "") +
    (item.brokenImages.length ? " — imagem quebrada" : ""),
  ),
  "",
  "## Checklist para revisão humana",
  "",
  "- Conferir alinhamentos, espaçamentos e hierarquia tipográfica.",
  "- Confirmar ausência de cortes, sobreposições, textos ilegíveis ou scroll horizontal indevido.",
  "- Conferir botões, formulários, tabelas, modais, estados vazios e de erro em desktop/mobile.",
  "- Confirmar que a TV apresenta somente dados adequados a uma tela pública.",
  "- Revisar explicitamente avisos de módulos indisponíveis no modo API.",
  "",
  "A aprovação dos testes não substitui a inspeção visual humana nem o E2E com PostgreSQL real.",
  "",
].join("\n");
writeFileSync(join(root, "README.md"), markdown, "utf8");

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    "## Capturas de tela — Agora Você\n\n" +
    "**" + frames.length + "** capturas, **" + warnings.length + "** alertas automáticos. " +
    "Veja o artifact **revisao-visual-chromium** e abra o arquivo `index.html`.\n\n" +
    "Os screenshots usam dados fictícios, nunca o banco da clínica.\n\n",
  );
}
console.log("Galeria gerada: " + frames.length + " capturas, " + warnings.length + " alertas em " + root);
