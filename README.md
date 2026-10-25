# Agora Você — Frontend

React 19 + TypeScript + Vite. Interface operacional para o pronto-socorro da clínica, integrada às **17 operações** do [AV-Backend](https://github.com/AgoraVoce/AV-Backend), versionadas em [OpenAPI](https://github.com/AgoraVoce/AV-Backend/blob/main/src/docs/openapi.yaml). A interface mantém o visual do sistema e a regra de acesso por perfil; não há agendamento de consultas.

## Executar localmente

Requisitos: Node.js >=22.13 e npm. PostgreSQL local só é necessário se você optar por rodar o backend localmente.

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

Se o backend usar outra porta, configure `API_PROXY_TARGET` com a porta do processo atualizado. Confira também `.env.local`, que tem precedência sobre `.env`. Reinicie o Vite após ajustar a configuração.

### Senha de atendimento ausente

A senha é gerada pelo backend ao confirmar a entrada na fila (`POST /api/v1/entries`) e retornada em `queueCode`. Quando esse valor está vazio, a recepção mostra “—”. Cadastrar somente os dados pessoais não gera senha.

Na investigação de 25/10/2026, a interface em `127.0.0.1:5173` apontava para um backend antigo na porta `27366`, enquanto a versão atualizada rodava na `27365`. O ajuste local foi `API_PROXY_TARGET=http://127.0.0.1:27365`. Essas portas são específicas desse ambiente; use a porta configurada no seu backend.

Após o ajuste, um cadastro fictício realizado pela própria interface na porta `5173` retornou HTTP 201 com `queueCode: AV-005`, exibido na fila. A correção não atribui senhas aos atendimentos já existentes. O arquivo `.env` permanece fora do Git.

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


## Navegação operacional por perfil

O modo integrado (`VITE_AV_LOCAL_API=true`) separa listagem, cadastro e atendimento em páginas independentes:

| Perfil | Rota | Conteúdo |
| --- | --- | --- |
| ADMIN | `/admin` ou `/admin/usuarios` | Listagem, pesquisa, filtros e paginação dos funcionários |
| ADMIN | `/admin/novo-funcionario` | Somente o formulário de novo funcionário, com voltar/cancelar |
| RECEPCIONISTA | `/recepcao` | Triagem, fila de espera e detalhes da entrada |
| RECEPCIONISTA | `/pacientes` | Lista de pacientes cadastrados, pesquisa por nome/CPF, paginação |
| RECEPCIONISTA | `/novo-cadastro` | Cadastro direto de um paciente novo, sem etapa de busca |
| RECEPCIONISTA | `/novo-cadastro?patient=<UUID>` | Entrada na fila para um paciente escolhido no diretório |
| MEDICO | `/medico` | Dashboard com resumo da fila, status atual e próxima chamada |
| MEDICO | `/medico/fila` | Fila individual, cada paciente clicável |
| MEDICO | `/medico/fila/<UUID>` | Detalhes de uma entrada aguardando, somente leitura |
| MEDICO | `/medico/atendimento` | Paciente atual, início, prescrição e finalização, sem a lista da fila |

O médico **não pode escolher manualmente o paciente a chamar**: o botão Chamar próximo paciente utiliza o endpoint transacional `POST /queues/me/next`, que respeita a ordem clínica no backend. Os detalhes da fila são consultivos.

Cadastros de pacientes e registros de entrada são duas operações independentes; se o cadastro já existe, comece pelo diretório `/pacientes`. Os estados de sucesso/erro operacionais usam **toasts acessíveis** em vez de banners persistentes. Na área do médico, somente o UUID da entrada ativa pode ser armazenado temporariamente; o detalhe clínico é recuperado da API.

No celular, a fila da recepção e o catálogo de funcionários utilizam cards com informações e ações visíveis, sem exigir deslocamento lateral na tabela.


## API de produção — desenvolvimento local e Vercel

**Backend Render:** https://av-backend-rlc1.onrender.com

### Linux (desenvolvimento local com API real)

```bash
cd ~/projetos/agoravoce/AV-FrontEnd
npm ci
npm run config:api -- https://av-backend-rlc1.onrender.com
npm run dev
```

O script prepara `.env.local` sem segredos e configura o proxy do Vite:

```dotenv
API_PROXY_TARGET=https://av-backend-rlc1.onrender.com
VITE_AV_LOCAL_API=true
```

O navegador chama **`/api/v1/*` na mesma origem**; o Vite encaminha os pedidos ao Render, incluindo login e autenticação Bearer. Não é necessário alterar o CORS do backend nem instalar PostgreSQL localmente. Reinicie o Vite após qualquer mudança de ambiente.

**Atenção:** é o banco de produção real. Não faça seeds, use dados fictícios, rode automações de alteração ou crie prescrições de teste nesse ambiente.

### Deploy público na Vercel

O projeto inclui `.env.production` com `VITE_AV_LOCAL_API=true` e `vercel.json` com os seguintes comportamentos:

- `/api/*` → **proxy HTTPS do servidor Vercel** para `https://av-backend-rlc1.onrender.com/api/*`.
- Demais rotas → fallback `/index.html`, permitindo F5 nas rotas React.
- `npm run build` com Node.js 22.x, saída em `dist/`.

**Não defina `VITE_AV_API_ORIGIN` na Vercel.** É desnecessário porque as chamadas da API já seguem para o Render pelo proxy de mesma origem. Caso essa variável tenha sido definida anteriormente no projeto, remova-a (ou ela forçará chamadas diretas sujeitas à restrição de CORS). `DATABASE_URL` e segredos JWT nunca pertencem ao frontend.

1. Autorize o aplicativo Vercel na organização GitHub **AgoraVoce**, concedendo acesso a `AV-FrontEnd`: [instalações da organização](https://github.com/organizations/AgoraVoce/settings/installations).
2. Vincule `AgoraVoce/AV-FrontEnd` em Vercel (framework Vite, diretório raiz, Node.js 22.x).
3. Para publicar esta versão antes do merge, selecione a branch `feat/workspaces-rotas-toasts-20261019` e faça um **preview**; só direcione o domínio principal após os testes e aprovação.
4. Inspecione login e chamadas GET com uma conta autorizada. Antes de testar prescrição, confirme o estado das migrations de produção no backend.

Ao usar o proxy, `FRONTEND_ORIGIN` do Render **não precisa ser ampliado por domínio preview apenas por causa do CORS**, pois o navegador não faz requisição cross-origin. Se passar a usar API direta em outro domínio, será necessário ajustar a política de CORS conscientemente.

### Diagnóstico

- `404` ao atualizar rotas como `/medico/atendimento`: confira `vercel.json` e o fallback SPA.
- `404` nas chamadas `/api/v1/*`: confirme ordem das regras de `rewrites` e disponibilidade das rotas no backend.
- `502` / `503`: veja o status do serviço Render, conexão com banco e migrations.
- `401` após F5: JWT fica somente em memória, portanto o usuário faz login novamente.
- `POST` ou `PATCH` alteram os dados reais. Use teste somente leitura e contas autorizadas para validar produção.
