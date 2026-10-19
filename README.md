# Agora Você — Frontend

React 19 + TypeScript + Vite. Interface operacional para o pronto-socorro da clínica, integrada às **17 operações** do [AV-Backend](https://github.com/AgoraVoce/AV-Backend), versionadas em [OpenAPI](https://github.com/AgoraVoce/AV-Backend/blob/main/src/docs/openapi.yaml). A interface mantém o visual do sistema e a regra de acesso por perfil; não há agendamento de consultas.

## Executar localmente

Requisitos: Node.js >=22.13, npm e PostgreSQL local.

1. No `AV-Backend`, configurar `.env` com `DATABASE_URL`, `AUTH_JWT_SECRET`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`, `FRONTEND_ORIGIN=http://localhost:5173`. Nunca copie segredos para `VITE_*`.
2. Preparar o PostgreSQL **descartável** com migrations aprovadas no backend (`npm run prisma:generate`, `npm run prisma:validate`, `npm run prisma:migrate:deploy` somente com banco novo, após conferir a URL de conexão e histórico). Não use `db push` contra Aiven ou banco compartilhado.
3. Criar usuários de teste pelo comando interativo `npm run user:provision` e preparar médico com registro `Doctor` e plantão válido se quiser testar chamada. `npm run dev` expõe o Swagger em `http://localhost:3000/api-docs`.
4. No frontend:

```bash
npm ci
cp .env.example .env
npm run dev
```

`.env` do frontend:
```dotenv
API_PROXY_TARGET=http://127.0.0.1:3000
VITE_AV_LOCAL_API=true
LEGACY_AUTH_PROXY_TARGET=http://127.0.0.1:3001
```

Abra `http://localhost:5173/login`. O Vite envia `/api/*` para o Express em `localhost:3000`. `VITE_AV_LOCAL_API=false` isola as telas antigas de demonstração para os testes de regressão.

## Fluxos integrados

### Recepção
- Consulta a fila real, com atualização a cada 30 segundos, busca e detalhamento de cada entrada.
- Busca pacientes existentes por **nome ou CPF**, seleciona a ficha, ou cadastra novos pacientes.
- Registra sintomas/gravidade manual e escolhe o médico disponível de plantão. Pacientes sem médico podem ficar em espera até a atribuição.
- Atribui/redefine médico com `PATCH /entries/:id/doctor`; registra desistência com `PATCH /entries/:id/status` e confirmação explícita.
- **Nunca chama o paciente**: a chamada é responsabilidade do médico.

### Médico
- Consulta somente a sua própria fila. O botão `Chamar próximo paciente` usa `POST /queues/me/next`, respeitando prioridade e exclusão de chamadas concorrentes no servidor.
- Confirma entrada em atendimento com `PATCH /entries/:id/status` (`in_progress`).
- Formulário estruturado de prescrição (descrição + medicamentos com nome, dosagem e instruções + orientações opcionais), revisão e **finalização atômica** em `POST /entries/:id/complete`.
- Em caso de timeout ou conflito ao finalizar, verifica `GET /entries/:id` antes de permitir qualquer tentativa: evita duplicar prescrições.
- Salva **apenas o UUID da entrada ativa** no `sessionStorage` por usuário para tentar retomar no mesmo navegador. Nunca armazena dados clínicos ou JWT ali.

### Administração
- `GET /employees` para listar, pesquisar e filtrar funcionários com paginação real; `POST /employees` para criar contas quando autorizado. A recepção não recebe funcionalidades exclusivas do ADMIN.

### Sessões
- `GET /auth/me` verifica a identidade com o Bearer ativo; `POST /auth/logout` revoga o token no servidor antes de atualizar a UI.
- O accessToken permanece **somente em memória** e expira no máximo em 15 minutos; atualizar a página ainda exige login, pois não há refresh token. Resposta 401 invalida a sessão; falhas 503 não são apresentadas como logout confirmado.

## Limitações e dependências do backend
- Falta uma rota autorizada para **descobrir o atendimento ativo do médico** em outro navegador/dispositivo. Um `409 DOCTOR_BUSY` não pode ser resolvido só pela fila `GET /queues/me` (que inclui apenas pacientes aguardando).
- O contrato de `/entries/:id/complete` exige **ao menos um medicamento**. Precisamos discutir atendimentos encerrados sem medicação.
- Não há API pública apropriada para a TV, recuperação de senha, relatórios administrativos ou gerenciamento completo de funcionários; esses módulos não exibem dados falsos como se fossem reais.
- **Prescrições dependem da migration `20261018191000_add_prescriptions`** no banco usado. A equipe informou que não estava aplicada ao Aiven em 18/10/2026. Não execute migrations de produção sem autorização.
- O histórico do backend contém credenciais antigas que precisam ser rotacionadas conforme aviso da PR #3.

## Testes

```bash
npm run lint
npm run build
npm run tokens:check
npm run design:lint
npm test                  # regressão em modo de demonstração isolado
npm run test:local-api    # HTTP interceptado, fluxos novos
```

O Playwright com interceptações verifica contratos e UI, mas **não substitui** um teste manual contra PostgreSQL real, médicos/plantões e as migrations. Nenhum deploy é realizado por este código.

## Revisão visual automática (Chromium)

Toda PR executa testes Chromium e gera, na sequência, capturas integrais de **todas as rotas e principais estados** no desktop, no celular e na TV Full HD. O GitHub Actions publica o artifact `revisao-visual-chromium-<PR>-<execução>` com imagens PNG e galeria `index.html` para inspeção de UI/UX. A pipeline também sinaliza overflow horizontal, imagens quebradas e erros JavaScript. Todos os dados dos screenshots são fictícios; nenhuma credencial real é usada.

Para testar no Linux:

```bash
npm run test:visual:demo
npm run test:visual:api
npm run visual:report
```

Abra `artifacts/visual-review/index.html`. O procedimento, a lista de telas e os critérios de inspeção estão em [docs/revisao-visual.md](docs/revisao-visual.md). **Testes verdes não substituem a revisão humana das capturas.**
