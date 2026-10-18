# Agora Você — Frontend

Interface React 19 + TypeScript + Vite. A aplicação tem **integração local** com [AV-Backend](https://github.com/AgoraVoce/AV-Backend) (Express + Prisma/PostgreSQL) na branch de integração. Não foi feito deploy.

## Iniciar com a API real (localhost)

Requisitos: Node.js 22.13+, npm e PostgreSQL configurado no backend.

**Terminal 1 — AV-Backend**

```bash
npm ci
cp .env.example .env
# Configure DATABASE_URL e AUTH_JWT_SECRET (chave forte) no .env
npm run prisma:generate
npm run prisma:validate
npm run dev
```

O backend escuta **http://localhost:3000** e oferece Swagger em `http://localhost:3000/api-docs`. **Importante:** no commit atual do backend, as migrations iniciais ainda não foram incorporadas. As tabelas do Prisma precisam estar criadas em um **banco local descartável**, de forma controlada, antes de testar login/cadastros; jamais aponte comandos de alteração estrutural para banco compartilhado ou produção. Depois do banco pronto, execute `npm run user:provision` no terminal interativo do backend para criar a primeira conta ADMIN ou RECEPCIONISTA.

O arquivo de ambiente do backend deve ter `FRONTEND_ORIGIN=http://localhost:5173`. As configurações sensíveis **nunca** vão para arquivos `VITE_*`.

**Terminal 2 — AV-FrontEnd**

```bash
npm ci
cp .env.example .env
npm run dev
```

Abra **http://localhost:5173/login**. O Vite encaminha `/api/*` para `http://127.0.0.1:3000` via `API_PROXY_TARGET`, evitando configurar CORS diretamente no navegador.

### O que está integrado

| Perfil | Operação | API |
| --- | --- | --- |
| Todos os perfis internos | Login com e-mail/senha, JWT Bearer | `POST /api/v1/auth/login` |
| Recepção | Fila em espera, atualizada a cada 30 s | `GET /api/v1/queues/waiting` |
| Recepção | Cadastrar paciente | `POST /api/v1/patients` |
| Recepção | Registrar entrada em espera com classificação manual | `POST /api/v1/entries` |
| Médico | Consultar somente a fila atribuída ao próprio médico | `GET /api/v1/queues/me` |
| Administrador | Cadastrar funcionário e definir perfil | `POST /api/v1/employees` |

Erros 400/401/403/409/429/rede têm respostas visíveis; ao receber 401 o frontend encerra a sessão local. Não exibimos pacientes, médicos, indicadores ou relatórios de demonstração nas páginas integradas.

### Limitações atuais do backend

- **Não há `GET /auth/me` nem logout/revogação no servidor.** JWT válido por até 15 minutos, guardado **somente em memória** (não em cookies, localStorage ou sessionStorage). Recarregar a página exige novo login. Logout apaga o token local; não revoga JWT no backend.
- **Não há recuperação de senha**; a tela integrada informa indisponibilidade, sem prometer envio de e-mail.
- **Não há GET de funcionários/pacientes nem busca por CPF.** A listagem administrativa mostra somente as contas criadas naquela aba, não todo o banco. Para adicionar nova entrada a paciente existente, é necessário o UUID dele.
- **Recepcionista não pode cadastrar funcionário:** essa é a regra efetiva da API atual (`POST /employees` exige ADMIN), mesmo que telas anteriores permitissem uma simulação local.
- **Não há chamadas, prescrição ou finalização por API, nem consulta administrativa da fila e relatórios.** Não há persistência simulada desses fluxos.
- Cadastro de entrada atual envia `symptomIds: []` e texto em `otherSymptoms`. A cor é selecionada manualmente e a entrada é criada sem médico e sem senha, como permitido pelo contrato. Para aparecer na fila do médico, é necessário atribuí-lo pelo fluxo/API que ainda será implementado.
- A TV não é pública na API atual; `GET /queues/waiting` exige autenticação de RECEPCIONISTA. O frontend não expõe esses dados sem autorização.

A identidade visual original, os componentes existentes e as telas de demonstração continuam disponíveis para teste isolado com `VITE_AV_LOCAL_API=false`, somente durante desenvolvimento. Nesse modo, as rotas `?dev=recepcionista` e semelhantes permitem testar o layout **sem criar dados reais**. O build normal integra a API local.

## Qualidade

```bash
npm run lint
npm run tokens:check
npm run design:lint
npm run format:check
npm run build
npm test                 # testes legados em modo de demonstração isolado
npm run test:local-api    # smoke HTTP interceptado do modo de integração local
```

Os testes da integração usam respostas HTTP controladas; **não** demonstram uma execução real contra PostgreSQL. Essa validação precisa ser realizada manualmente com as duas aplicações e banco local preparados.

## Arquitetura

- `src/auth/`: login, sessão efêmera e proteção visual de perfis.
- `src/integrations/client.ts`: API tipada, Bearer JWT, erros e timeout.
- `src/integrations/LocalPages.tsx`: filas e formulários integrados.
- `src/components/` e `src/styles/`: design system, tokens e estrutura existentes.
- `e2e-local/`: testes de contrato da interface integrada.
- `DESIGN.md` / `UX-CONTRACT.md`: referências de design e UX.
- `docs/auth-api.md` / `docs/password-recovery-api.md`: contratos históricos, não implementações do backend presente.

Antes de qualquer deploy, negociar endpoints faltantes, revogação/restauração de sessão e estratégia de autenticação segura com o time de backend.
