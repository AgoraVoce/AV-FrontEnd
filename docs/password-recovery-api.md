# Recuperação de senha · contrato proposto

Nova solicitação do usuário, posterior à issue #17, somente frontend. O AV-Backend ainda não oferece esses endpoints. Este documento é uma proposta para integração, não uma descrição de API já disponível. Sem API, o aplicativo mostra indisponibilidade; nunca gera códigos, valida credenciais ou confirma alteração localmente.

## Solicitar ou reenviar código

`POST /auth/password/request` com `{ "email": "pessoa@clinica.test" }`.

200 com o mesmo formato para e-mail existente, inexistente ou inativo:

```json
{
  "challengeId": "identificador-opaco",
  "codeLength": 6,
  "expiresInSeconds": 300,
  "resendAfterSeconds": 60,
  "passwordPolicy": { "minLength": 15, "maxLength": 128 }
}
```

Valores acima são exemplos, não configurações fixadas pelo frontend. O servidor define política e duração. O cliente suporta códigos numéricos de 6–12 dígitos, durações de 1–86400 segundos, espera de reenvio de 0–86400 segundos e limites de senha de 1–1024 caracteres Unicode. Respostas incompatíveis bloqueiam avanço. Alinhar esses limites antes da integração; a política de senha deve ser a mesma de cadastro/alteração no backend.

O servidor precisa preservar resposta e tempo comparáveis para todas as contas, inclusive produzindo um challenge opaco para solicitações sem conta elegível. Não retornar `exists`, dados de usuário, código, destino completo ou razões de bloqueio. O cliente exibe apenas “Se houver uma conta…”. Inativos não podem obter autorização de redefinição. Reenvio usa o mesmo endpoint, retorna novo challenge e invalida o código anterior no servidor.

## Verificar código

`POST /auth/password/verify` com `{ "challengeId": "identificador-opaco", "code": "123456" }`.

200: `{ "resetToken": "autorizacao-opaca-limitada", "expiresInSeconds": 300 }`.

400/401/403/410/422: código inválido ou expirado, sem distinguir conta, validade individual ou estado de usuário. O backend limita tentativas por challenge e por origem. Código consumido não pode ser reutilizado. O token concede somente redefinição de senha e nunca acesso às áreas protegidas.

## Redefinir senha

`POST /auth/password/reset` com `{ "resetToken": "autorizacao-opaca-limitada", "password": "nova senha completa" }`.

204 (ou outro 2xx) confirma alteração efetiva. 400/401/403/410 significa autorização inválida/expirada; 422 significa violação da política. 429 pede espera. Rede/5xx/timeout não confirma a alteração: a UI permite nova tentativa ou retorno ao login, pois a operação pode ter ocorrido antes da falha de resposta.

Confirmação de senha é validada localmente e não enviada. Espaços e Unicode não são removidos ou normalizados. Não há truncamento silencioso. O backend verifica política, hashes e autorização em uma operação atômica, consome o token e revoga todas as sessões existentes. Sucesso não autentica automaticamente. O frontend remove o contexto local e notifica outras abas para revalidarem sessão; isso não substitui revogação no servidor.

## Transporte e segurança

`recovery-api.ts` é o único adaptador da proposta; usa o transporte existente de `api.ts`: mesma origem, JSON, credentials include, no-store, timeout de 12 segundos, cancelamento ao sair da tela e nenhuma repetição automática. HTTPS e proteção CSRF/origem conforme padrão oficial são responsabilidades do backend/infraestrutura.

Challenge, código, autorização e senha ficam apenas em memória durante o fluxo. Não vão para URL, histórico, logs, localStorage ou sessionStorage. Refresh inicia nova solicitação. Nenhuma mensagem crua da API é exibida. A tela não comprova existência de conta nem entrega de e-mail.

Pendências backend: envio real, códigos aleatórios seguros, armazenamento protegido, expiração e uso único, rate limiting independente dos controles da UI, hash de senha, notificação de alteração, revogação, testes integrados e definição oficial do contrato. Referência: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). Testes Playwright interceptam HTTP apenas no ambiente de teste e não provam essas garantias de servidor.
