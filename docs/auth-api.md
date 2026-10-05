# Contrato de integração de autenticação (proposto)

AV-Backend tem somente README na revisão de 05/10/2026. Este contrato descreve as necessidades do frontend, não uma API já implementada. Ref.: AV-Documents #17/#18/#20. A entrega contém apenas frontend.

| Método | Caminho      | Entrada                                 | Resultado esperado                                                                                                  |
| ------ | ------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| POST   | /auth/login  | `{ "login": "...", "password": "..." }` | 200 + `{ "user": { "id": "string", "name": "string", "login": "string", "role": "RECEPCIONISTA\|MEDICO\|ADMIN" } }` |
| GET    | /auth/me     | Nenhum body                             | 200 com o mesmo envelope de usuário; 401/403 quando inválida                                                        |
| POST   | /auth/logout | Nenhum body                             | 204 ou outro 2xx sem necessidade de corpo                                                                           |

A forma sugerida de sessão é cookie HttpOnly enviado com credentials include. Nunca há token ou senha em storage/URL/log no frontend. A arquitetura oficial do backend prevalece: se usar outro envelope ou transporte, adaptar `src/auth/api.ts` e `types.ts`, mantendo o comportamento externo. Não fixar JWT no cliente.

O backend deve validar entradas, usar TLS na publicação, não registrar senhas, bloquear inativos, limitar tentativas e validar perfis em cada ação. Se adotar cookie: definir Secure em produção, HttpOnly, SameSite adequado e defesa CSRF, expiração e revogação no logout. A aplicação deve ser servida na mesma origem da API via proxy; se optar por origens separadas, CORS/CSRF/cookies exigem ajuste conjunto. Este frontend não implementa essas responsabilidades do servidor.

Login 401/403 é sempre genérico, sem distinguir conta inexistente, senha ou inativo. 429 pede espera. Rede/5xx/timeout mostram indisponibilidade. Respostas de sessão incompletas ou perfis desconhecidos bloqueiam acesso. Identificadores são strings; o backend deve serializar IDs numéricos caso os use. Nomes de perfis canônicos foram escolhidos entre os permitidos por #18, incluindo ADMIN.

Não retornar password, passwordHash ou outros dados desnecessários. Nenhuma política operacional é inferida da área escolhida no login; esse seletor não é enviado à API.

Prazo do cliente: 12 segundos. Não há retry automático para credenciais; uma nova tentativa é explícita. Caso o login conclua no servidor após timeout, GET /auth/me no reload/retorno à aba reconcilia a sessão. API e proxy devem ter limites próprios. AbortSignal.timeout/any requer navegador moderno (Chrome/Edge 116+, Firefox 124+, Safari 17.4+); política atual é browsers atualizados.
