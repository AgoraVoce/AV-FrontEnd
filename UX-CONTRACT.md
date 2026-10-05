# Contrato de UX · Autenticação

Fonte: [AV-Documents #17](https://github.com/AgoraVoce/AV-Documents/issues/17), dependências [#18](https://github.com/AgoraVoce/AV-Documents/issues/18) e [#20](https://github.com/AgoraVoce/AV-Documents/issues/20), PDF fornecido (RF01/RNF04), README do AV-Documents. Revisado em 05/10/2026. Escopo final: somente frontend, conforme orientação do usuário.

## Fontes de contexto

| Assunto                             | Fonte                                                | Consequência na UI                                             |
| ----------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| Credenciais e sessão                | #17; `docs/auth-api.md` (proposto, pendente backend) | Login genérico, me no reload e logout confirmado pela API      |
| Perfis e autorização                | #18/#20                                              | Destino por perfil retornado; servidor é autoridade            |
| Telas e identidade                  | Anexos e `DESIGN.md`                                 | Três apresentações, um formulário compartilhado, logo original |
| Dados clínicos e ações operacionais | Fora desta issue                                     | Nenhum paciente, fila, diagnóstico ou CRUD nesta entrega       |

## Canonical UI Map

| Capability | Canonical owner               | Source of truth    | Allowed variants                          | Verification                      |
| ---------- | ----------------------------- | ------------------ | ----------------------------------------- | --------------------------------- |
| Form       | `src/auth/LoginPage.tsx`      | #17, este contrato | Recepção, Médico, Admin por PRESENTATION  | `tests/auth.spec.ts`              |
| Scrollbar  | `src/styles/app.css`          | DESIGN.md          | Global; forced-colors do sistema          | Teste de estilo e inspeção visual |
| Feedback   | `src/components/Feedback.tsx` | #17                | Inline error + retry                      | `tests/auth.spec.ts`              |
| Session    | `src/auth/AuthProvider.tsx`   | API proposta + #17 | Checking, anonymous, authenticated, error | `tests/auth.spec.ts`              |

## Fluxo e estados

Login: campos obrigatórios → primeiro inválido recebe foco → zero chamadas se vazio → envio único com indicador → API retorna usuário → rota correspondente ao perfil. A área escolhida é somente apresentação, nunca faz parte do payload nem concede permissão. Não armazenar credenciais ou tokens em localStorage/sessionStorage.

401/403 no login: mensagem genérica, identificador preservado, senha limpa e remascarada. Rede/5xx/timeout: mensagem de indisponibilidade, valores preservados e botão permite nova tentativa. 429: pedir espera. Resposta desconhecida: bloquear acesso e orientar retry/contato com administração. Não mostrar mensagem crua da API.

GET /auth/me ao montar e ao retornar à aba: ocultar conteúdo protegido enquanto verifica. 401/403: login. Falha: tela de retry; não afirmar logout/expiração. Requests de leitura antigas são canceladas e não sobrescrevem login/logout. Mudanças de sessão são notificadas entre abas com BroadcastChannel, sem transmitir usuário ou segredo.

Logout: aguardar POST /auth/logout. Sucesso ou 401: remover contexto e voltar ao login. 403 ou falha de rede/5xx: manter contexto e mostrar que sessão não pôde ser encerrada. Servidor precisa revogar a sessão para impedir reutilização.

Rotas /recepcao, /medico e /admin: destinos mínimos de confirmação do login. Não representam painéis operacionais implementados. Perfil diferente: 403 visual com link para área permitida; usuário sem sessão: login. Nenhum redirecionamento arbitrário a URL recebida do cliente.

## Acessibilidade e layout

Formulário noValidate, labels explícitos, username/current-password, aria-invalid e descrição do campo com erro, botão nativo e foco visível. Paste e gerenciador de senhas liberados. Reveal tem nome Mostrar/Ocultar senha. Erro é role alert, progresso é role status. Ao chegar ao login, título recebe foco programático sem contorno; navegação de controles usa focus-visible.

Toda região usa pt-BR. Documento rola naturalmente. WCAG 2.2 AA básico verificado com axe e teclado; não declarar auditoria completa. Motion reduzido remove animações. Seletor de área usa três botões pressionáveis; Tab/Enter padrão nativo, sem fingir ser tabs ARIA.

## Limite de evidência

Testes interceptam HTTP com Playwright e verificam o frontend. Eles não provam validação de usuário inativo, hash de senha, revogação, autorização ou cookies do servidor. A integração real depende do AV-Backend. O cliente de sessão usa transporte por cookie como proposta encapsulada em api.ts; se o contrato oficial for outro, adaptar ali antes da integração.
