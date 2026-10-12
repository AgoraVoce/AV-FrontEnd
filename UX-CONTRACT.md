# Contrato de UX · Autenticação e Operação

Fonte: [AV-Documents #17](https://github.com/AgoraVoce/AV-Documents/issues/17), dependências [#18](https://github.com/AgoraVoce/AV-Documents/issues/18) e [#20](https://github.com/AgoraVoce/AV-Documents/issues/20), PDF fornecido (RF01/RNF04), README do AV-Documents. Revisado em 05/10/2026. Escopo final: somente frontend, conforme orientação do usuário.

## Fontes de contexto

| Assunto                             | Fonte                                                | Consequência na UI                                                                 |
| ----------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Credenciais e sessão                | #17; `docs/auth-api.md` (proposto, pendente backend) | Login genérico, me no reload e logout confirmado pela API                          |
| Perfis e autorização                | #18/#20                                              | Destino por perfil retornado; servidor é autoridade                                |
| Telas e identidade                  | Anexos e `DESIGN.md`                                 | Login único por e-mail e senha, logo original                                      |
| Dados clínicos e ações operacionais | Estado local da branch `reception`                   | Fila, reclassificação, exclusão, cadastro e transmissão seguem os contratos abaixo |

## Canonical UI Map

| Capability     | Canonical owner                            | Source of truth         | Allowed variants                                        | Verification                      |
| -------------- | ------------------------------------------ | ----------------------- | ------------------------------------------------------- | --------------------------------- |
| Form           | `src/auth/LoginPage.tsx`                   | #17, este contrato      | Único; query string de área ignorada                    | `tests/auth.spec.ts`              |
| Scrollbar      | `src/styles/app.css`                       | DESIGN.md               | Global; forced-colors do sistema                        | Teste de estilo e inspeção visual |
| Feedback       | `src/components/Feedback.tsx`              | #17                     | Inline error + retry                                    | `tests/auth.spec.ts`              |
| Toast          | `src/components/ErrorToast.tsx`            | Solicitação do usuário  | Erro de login/sessão; um aviso persistente, sem retry   | `tests/auth.spec.ts`              |
| Session        | `src/auth/AuthProvider.tsx`                | API proposta + #17      | Checking, anonymous, authenticated, error               | `tests/auth.spec.ts`              |
| Select/Listbox | `src/components/Select.tsx`                | Brief operacional       | Listbox autorado; portal, colisão, teclado e typeahead  | `tests/reception-delete.spec.ts`  |
| Fila           | `src/auth/reception/QueuePage.tsx`         | Estado de `queue-store` | Busca + prioridade + idade + espera; paginação derivada | `tests/queue.spec.ts`             |
| Transmissão    | `src/painel-publico/PainelPublicoPage.tsx` | `queue-store`           | Chamada somente com `status: "called"`; TV sem shell    | `tests/transmission.spec.ts`      |

## Fluxo e estados

Login: Entrar desabilitado enquanto e-mail (após trim) ou senha estiverem vazios → validação defensiva no submit → primeiro inválido recebe foco → zero chamadas se vazio → envio único com indicador → API retorna usuário → rota correspondente ao perfil. Não há seleção de área. O e-mail é enviado no campo `login` do contrato proposto, sem role ou permissão escolhidos pelo cliente. Não armazenar credenciais ou tokens em localStorage/sessionStorage.

401/403 no login: toast genérico, ambos os campos vermelhos com aria-invalid, e-mail preservado, senha limpa e remascarada; Entrar volta a ficar desabilitado. Editar um campo remove sua marcação de erro do servidor. Rede/5xx/timeout: mensagem de indisponibilidade, valores preservados e botão permite nova tentativa. 429: pedir espera. Resposta desconhecida: bloquear acesso e orientar retry/contato com administração. Não mostrar mensagem crua da API.

GET /auth/me ao montar e ao retornar à aba: ocultar conteúdo protegido enquanto verifica. 401/403: login. Falha: retornar ao login sem revelar conteúdo protegido; toast de indisponibilidade, campos vermelhos, sem botão Tentar novamente. Não afirmar logout/expiração. Requests de leitura antigas são canceladas e não sobrescrevem login/logout. No login, a restauração é informativa e não bloqueia digitação; envio depende de campos preenchidos; em rotas protegidas, continua bloqueando conteúdo até confirmar a sessão. Mudanças de sessão são notificadas entre abas com BroadcastChannel, sem transmitir usuário ou segredo.

Logout: aguardar POST /auth/logout. Sucesso ou 401: remover contexto e voltar ao login. 403 ou falha de rede/5xx: manter contexto e mostrar que sessão não pôde ser encerrada. Servidor precisa revogar a sessão para impedir reutilização.

Rotas /recepcao, /medico e /admin: destinos autenticados por perfil. `/recepcao` e `/novo-cadastro` compõem os fluxos operacionais desta branch; `/transmissao` é a entrada administrativa do painel público. Perfil diferente: 403 visual com link para área permitida; usuário sem sessão: login. Nenhum redirecionamento arbitrário a URL recebida do cliente.

## Acessibilidade e layout

Formulário noValidate, labels explícitos, username/current-password, aria-invalid e descrição do campo com erro, botão nativo e foco visível. Paste e gerenciador de senhas liberados. Reveal tem nome Mostrar/Ocultar senha. Erro é role alert, progresso é role status. Ao chegar ao login, título recebe foco programático sem contorno; campos e reveal ficam editáveis durante checking/error; apenas o POST de login bloqueia o formulário; navegação de controles usa focus-visible.

Toda região usa pt-BR. Documento rola naturalmente. WCAG 2.2 AA básico verificado com axe e teclado; não declarar auditoria completa. Motion reduzido remove animações. Nenhum seletor de área é exibido. E-mail usa type=email/inputMode=email e mantém autocomplete=username para gerenciadores de senha.

## Limite de evidência

Testes interceptam HTTP com Playwright e verificam o frontend. Eles não provam validação de usuário inativo, hash de senha, revogação, autorização ou cookies do servidor. A integração real depende do AV-Backend. O cliente de sessão usa transporte por cookie como proposta encapsulada em api.ts; se o contrato oficial for outro, adaptar ali antes da integração.

## Recuperação · nova solicitação

Solicitação posterior do usuário amplia somente o frontend, antes excluído da issue #17. `/recuperar-senha` mantém o mesmo layout, identidade e rolagem. `AuthLayout` é o proprietário da composição; `PasswordField` é o controle canônico de senha/reveal em login e recuperação. `RecoveryPage` é o formulário canônico desse fluxo, verificado em `tests/recovery.spec.ts`. Contrato de integração proposto em `docs/password-recovery-api.md`; não existe API oficial implementada.

E-mail obrigatório/válido → resposta genérica da API → código numérico com autocomplete one-time-code → autorização restrita validada pela API → nova senha + confirmação → reset confirmado → retorno ao login sem autenticar automaticamente. Navegação interna não oferece acesso direto à redefinição. Reenvio tem espera informada pela API, bloqueio de duplicidade e substitui challenge/código apenas após sucesso. Alterar e-mail ou recomeçar descarta segredos. Cancelamento ao sair impede avanço tardio.

Código inválido/expirado tem mensagem única. Contagem é informativa; servidor verifica expiração e tentativas. Nova senha segue limites recebidos, aceita paste, Unicode e espaços sem alteração; confirmação nunca vai à API. Erro de rede preserva valores para tentativa explícita e não afirma sucesso. Erro de autorização limpa segredos e pede reinício. Campos ficam editáveis antes do envio e bloqueiam somente sua requisição ativa.

Etapa atual usa aria-current, mudança recebe foco no título, erro local foca o campo, progresso usa status e falha usa alert. Cada senha possui reveal independente. Sucesso remove contexto autenticado local e solicita revalidação em outras abas; revogação efetiva é do backend. Nenhum código, token ou senha persistido em URL/storage. Refresh volta à primeira etapa.

## Permissões de UI

`src/auth/permissions.ts` é o proprietário canônico das permissões de visualização de área. Cada role possui somente a área já especificada: Recepcionista → recepção, Médico → médico, Admin → administração. Checagens individuais usam `hasPermission`; não há wildcard ou bypass de Admin. Esses identificadores são internos ao frontend e não alteram o contrato HTTP. O backend valida cada ação e é a autoridade; a branch mantém as operações de fila já existentes no `queue-store` e não amplia permissões além delas.

## Operação da fila e feedback

`QueuePage` mantém a busca textual e compõe filtros de prioridade (`Urgente`, `Alerta`, `Tranquilo`), faixa etária e tempo de espera calculado por `arrivedAt`. O botão `Filtrar` é o único ponto de filtros avançados; resumo de risco não oferece filtro duplicado. Busca e filtros exibem limpeza explícita, contador de filtros ativos, estado vazio e recalculam a página.

Reclassificação e exclusão exigem justificativa conforme o domínio. Fechar uma reclassificação com rascunho abre confirmação própria da aplicação, nunca `window.confirm`. Toasts de operação bem-sucedida usam tom de sucesso; falhas usam erro; ações desfeitas usam tom neutro, sem inferir vermelho a partir do tipo destrutivo da operação. O undo permanece limitado ao registro e janela previstos pelo store.

## Cadastro e transmissão pública

`NovoCadastro` preserva título e formulário, remove atalhos de fila e o bloco contextual duplicado. A validação é manual, com `noValidate`, mensagem `role="alert"` e sem `reportValidity`.

`/transmissao` é a entrada administrativa do painel e oferece `Iniciar transmissão`. `/transmissao/tv` é standalone: não renderiza `AppShell`, sidebar ou shell interno, oferece tela cheia por interação explícita e saída segura. A chamada atual deriva exclusivamente de um paciente com `status: "called"`; pacientes `waiting` aparecem como próximos sem estimativas inventadas. Em desenvolvimento, o estado local deve ser identificado visualmente.

## Feedback do login · ajuste solicitado

`ErrorToast` é o proprietário canônico do toast, com um único slot sem empilhamento, portal para body, placement superior direito responsivo, tokens existentes e --z-toast. Erros persistem até fechar ou iniciar nova tentativa. Fechar pelo teclado devolve foco ao formulário e mantém descrição acessível vinculada aos campos; não oferece retry. O login usa toast para erros de sessão/autenticação; recuperação e falhas de logout preservam seus avisos inline. Erros locais de formato continuam associados ao campo. Rede/5xx nunca são apresentados como credenciais inválidas. Nenhuma mensagem inclui dados digitados ou texto cru do servidor.
