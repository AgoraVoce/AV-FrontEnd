# AV-FrontEnd · Agora Você

Frontend React + TypeScript + Vite para a issue [AV-Documents #17](https://github.com/AgoraVoce/AV-Documents/issues/17) (RF01/RNF04). A entrega tem apenas telas e comportamento frontend. O backend ainda não disponibiliza API; os testes usam respostas HTTP simuladas.

## Executar

Requer Node.js 22.13+ e npm.

```bash
npm ci
npm run dev
```

Abra http://localhost:5173/login. O Vite encaminha `/auth/*` para `http://127.0.0.1:3001` por padrão. Copie `.env.example` para `.env` e ajuste API_PROXY_TARGET se necessário. Sem backend, a tela informa em toast que não foi possível verificar a sessão e marca os campos em vermelho; nunca autoriza acesso fictício.

Para visualizar a fila de recepção localmente sem backend, abra http://localhost:5173/recepcao?dev=recepcionista. Esse bypass existe apenas no servidor de desenvolvimento; não é incluído no build de produção.

## Telas

- `/login`: acesso único por e-mail e senha para todos os perfis.
- `/recuperar-senha`: e-mail → código com reenvio/expiração → nova senha e confirmação → retorno ao login. Recuperação adicionada por solicitação posterior à issue original; somente frontend, aguardando API real.
- `/recepcao`, `/medico`, `/admin`: destinos mínimos após login para verificar sessão, perfil e logout. Painéis operacionais não fazem parte desta entrega.

O perfil retornado pela API define o destino. Query strings como `?area=ADMIN` são ignoradas e não alteram apresentação, payload ou permissões. A logo original está em `public/agora-voce-logo.png`.

Os campos ficam editáveis durante GET /auth/me e após falha de restauração. Entrar fica desabilitado enquanto e-mail ou senha estiverem vazios. Erros de login/sessão usam toast e campos vermelhos, sem botão Tentar novamente; ao corrigir um campo, sua marcação é removida. Um novo login cancela a leitura anterior, evitando que uma resposta antiga sobrescreva a sessão. Durante POST /auth/login, o formulário bloqueia duplicidade.

`src/auth/permissions.ts` centraliza permissões de visualização das três áreas, derivadas do role autenticado. Não há acesso automático de Admin às outras áreas. A autorização efetiva continua no backend; permissões por ação operacional dependem do catálogo oficial e das futuras telas.

## Estrutura

- `src/auth/`: API, contrato tipado, contexto/sessão, login e guards visuais.
- `src/components/`: marca, feedback e loading compartilhados.
- `src/styles/`: CSS responsivo e tokens gerados.
- `tests/auth.spec.ts`: testes de navegador com HTTP interceptado e axe.
- `tests/recovery.spec.ts`: recuperação, falhas, duplicidade, expiração, privacidade e acessibilidade com API interceptada.
- `docs/auth-api.md`: contrato proposto para combinar com a equipe de backend.
- `docs/password-recovery-api.md`: contrato proposto de recuperação e pendências de segurança do servidor.
- `DESIGN.md`, `UX-CONTRACT.md`: identidade e comportamento; tokens gerados a partir do DESIGN.

## Validação

```bash
npx playwright install chromium
npm run lint
npm run tokens:check
npm run design:lint
npm run format:check
npm test
npm run build
```

Testes cobrem login por perfil, refresh, logout, inativo/credenciais inválidas simulados, campos vazios, duplicidade, rede/5xx, timeout, 429, resposta malformada, acesso de perfil diferente, teclado/reveal, ausência de senha em console/storage e responsividade 320–1504px. Axe cobre violações detectáveis de WCAG AA no login único, inclusive quando recebe parâmetros antigos de área. Para gerar tokens após atualizar o DESIGN: `npm run tokens:generate`.

## Integração e publicação

A API proposta é POST /auth/login, GET /auth/me e POST /auth/logout. Detalhes e limites em `docs/auth-api.md`. Não há contas, credenciais de demonstração ou mocks incorporados no build. Não colocar segredos em variáveis VITE_*.

A recuperação propõe POST /auth/password/request, /verify e /reset, isolados em `recovery-api.ts`. A UI só avança após respostas válidas e só confirma alteração após 2xx do reset. Código, autorização e senha ficam em memória; refresh recomeça. Política de senha, duração e espera de reenvio vêm da API. O backend ainda precisa implementar envio, verificação, uso único e revogação; veja `docs/password-recovery-api.md`.

`npm run build` gera `dist/`. Hospede com HTTPS; configure fallback de rotas SPA para index.html e encaminhe `/auth/*` para a API da mesma origem antes do fallback. `npm run preview` é somente verificação local de build, não servidor de produção.

O backend deve assegurar autorização, bloqueio de inativos e revogação. Guards no React servem à UX. A integração real e suas evidências são pendências da equipe backend; passar testes simulados não encerra o DoD integrado da issue.
