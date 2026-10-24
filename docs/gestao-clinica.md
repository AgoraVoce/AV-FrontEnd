# Gestão clínica — entrega de 24/10/2026

Implementada no projeto existente, em modo integrado (`VITE_AV_LOCAL_API=true`). As telas de demonstração continuam separadas. A gestão clínica depende da extensão do AV-Backend descrita abaixo; não usa armazenamento local para simular persistência.

## Levantamento antes das alterações

Frontend: React 19, TypeScript, Vite, React Router 7, Lucide, Plus Jakarta Sans e CSS existente. Componentes PascalCase em `src/components` e `src/pages`; serviços e auxiliares em arquivos como `operational-api.ts`. Backend local: Express 5, TypeScript, Prisma 7/PostgreSQL e Zod, organizado em routes/controllers/services/models/validators.

`src/integrations/client.ts` centraliza fetch, Bearer em memória, timeout, resposta 401 e `ApiError`. `ProtectedArea` protege as áreas por perfil e `AppShell` compartilha header e sidebar com NavLink ativo. Feedback usa toasts. Foram reutilizados layout, formulários, cards, chips, botões e o avatar com iniciais da tabela administrativa. As novas confirmações usam dialog nativo com foco contido, Escape e restauração de foco.

APIs anteriores: GET `/specialties`; GET `/doctors` (somente disponíveis no plantão atual); POST `/doctors` com `{userId,specialtyId,active}`; GET/PATCH `/doctors/:id`; GET/POST `/doctors/:id/shifts` e PATCH `/doctors/:id/shifts/:shiftId`. O médico era vinculado a uma conta e a uma especialidade. Plantões avulsos tinham datas, disponibilidade e sala em texto livre. O servidor já bloqueava sobreposição do mesmo médico.

Não existiam: escrita de especialidades, descrição/contagem de médicos, cadastro de salas, diretório de todos os médicos, CRM/UF/telefone/sala padrão, recorrência, conflito de sala e consulta do próprio perfil com próximo plantão. Essas lacunas foram implementadas explicitamente no backend; não foram presumidas como APIs disponíveis.

## Alterações necessárias no backend

O código correspondente fica em `/home/usuario/AV-Backend`. O patch revisável também está em [backend-clinic-management.patch](backend-clinic-management.patch).

A migration `20261024160000_clinic_management` adiciona descrição às especialidades, tabela de salas, CRM/UF/telefone/sala padrão aos médicos e referência de sala/grupo semanal aos plantões. Campos novos são opcionais no banco para preservar médicos antigos. Salas legadas dos plantões são convertidas em registros, agrupadas pelo nome sem diferença de caixa e espaços externos. Não altera atendimentos, prioridades ou seleção de fila.

**A migration precisa ser aplicada ao banco da instância antes de usar as telas.** Não foi executada em produção. Validação de persistência foi feita exclusivamente em PostgreSQL descartável. Regenerar Prisma e compilar não aplica migrations.

## Endpoints usados e criados

Todos usam `/api/v1`, Bearer e autorização no servidor. ADMIN faz gestão. Rotas `/doctors/me/*` identificam o médico exclusivamente pela sessão.

| Funcionalidade | Método e rota | Situação |
| --- | --- | --- |
| Especialidades | GET `/specialties?page=&pageSize=` | Existente; resposta ampliada com descrição e doctorCount |
| Especialidades | POST `/specialties`, PATCH `/specialties/:id`, DELETE `/specialties/:id` | Criados |
| Salas | GET/POST `/rooms`, PATCH/DELETE `/rooms/:id` | Criados |
| Médicos | GET/POST `/admin/doctors`, PATCH `/admin/doctors/:id` | Criados; diretório administrativo e gravação atômica da conta/perfil |
| Inativação médica | PATCH `/doctors/:id` com `{active:false}` | Existente |
| Escala administrativa | GET `/admin/shifts` | Criado |
| Plantão avulso | POST `/doctors/:id/shifts`, PATCH `/doctors/:id/shifts/:shiftId` | Existentes; agora aceitam roomId e bloqueiam conflito de sala |
| Recorrência | POST `/doctors/:id/shifts/series` | Criado |
| Perfil/dashboard médico | GET `/doctors/me/profile` | Criado |
| Escala pessoal | GET `/doctors/me/shifts` | Criado |
| Fila/chamada | GET `/queues/me`, POST `/queues/me/next` e demais operações de atendimento | Preservadas |

Payloads e respostas:

- Especialidade: `{name,description:null|string,active}`. Gravação retorna `{id,name,description,active}`. GET retorna `{items:[{id,name,description,active,doctorCount}],total,page,pageSize}`. DELETE retorna 204; especialidade vinculada retorna 409 `SPECIALTY_IN_USE`.
- Sala: `{name,type,status}`, com status `ativa|manutencao|inativa`. Gravação retorna esses campos e `id`. GET retorna `{items:[...]}`. DELETE retorna 204 ou 409 `ROOM_IN_USE`; a tela oferece inativar.
- Médico: `{name,email,crmNumber,crmUf,phone:null|string,specialtyId,defaultRoomId:null|string,active}`. POST exige também `password`, cria conta MEDICO e perfil na mesma transação. PATCH envia os campos profissionais completos e preserva senha. Resposta inclui `id,userId`, campos profissionais, `user:{email}`, `specialty`, `defaultRoom`, datas. Nenhum hash é retornado. GET aceita `q` (nome/CRM), `specialtyId`, `active`, `page`, `pageSize` e retorna página `{items,total,page,pageSize}`.
- Plantão: `{startsAt,endsAt,roomId,availabilityStatus}` com timestamps ISO contendo fuso. Disponibilidade `DISPONIVEL|INDISPONIVEL`. Cancelar envia somente `{availabilityStatus:"INDISPONIVEL"}`. Resposta tem `id,doctorId,startsAt,endsAt,roomId,room,availabilityStatus,recurrenceId,createdAt,updatedAt`. Consultas gerais retornam `{items:[...]}` e incluem nome/especialidade do médico.
- Série semanal: payload do plantão mais `until:"YYYY-MM-DD"`; resposta `{items:[ocorrências]}`. Todas são gravadas na mesma transação.
- Perfil próprio: perfil profissional mais `nextShift` (plantão atual ou próximo disponível, ou null). Sala padrão e sala do plantão são exibidas separadamente.

O OpenAPI do backend foi ampliado. Não permanece endpoint necessário não implementado neste escopo. Uma instância antiga ainda precisa receber o código e a migration; erros HTTP não são convertidos em sucesso nem em dados fictícios.

## Regras e escolhas

- Administrador gerencia os quatro cadastros. Médico consulta somente o próprio perfil/sala/escala. As consultas por ID no backend também verificam o vínculo do médico.
- Mantida uma especialidade principal por médico, conforme a relação já usada pela fila. Não foi introduzida associação de múltiplas especialidades.
- Nome de especialidade/sala é único sem diferenciar caixa. CRM usa 1 a 7 dígitos sem zero inicial + uma UF brasileira válida; o par é único. E-mail é normalizado para minúsculas e único. Telefone opcional aceita DDD + 10/11 dígitos.
- Médico nunca é excluído. Inativação com entradas abertas é rejeitada, preservando a regra existente.
- Sala vinculada a médicos **ou a qualquer plantão histórico/futuro** não é excluída: oferece inativar. Essa regra é mais restritiva para preservar referências históricas.
- Confirmação antes de excluir/inativar especialidade, alterar sala ativa para indisponível, inativar médico ou cancelar plantão.
- Intervalos são semiabertos: 08h–12h e 12h–14h são adjacentes e permitidos. Somente plantões DISPONIVEL bloqueiam outros. Cancelados permanecem no histórico.
- Conflitos de médico e sala são validados no front e novamente no servidor; este usa transação serializável com retentativas e bloqueio compartilhado da agenda, inclusive nas rotas avulsas anteriores.
- Recorrência semanal tem data final explícita, limitada a um ano. O dia da semana vem da primeira data; a interface mostra a grade semanal e os horários. Cada ocorrência pode ser editada/cancelada individualmente; isso é informado no formulário e no modal.
- Horários operacionais seguem America/Sao_Paulo (UTC−03), conforme o backend existente. O próximo plantão pode ser o atualmente em andamento.
- Sala/especialidade/escala são informativas no Dashboard médico. Nenhuma escolha manual de paciente foi adicionada. A TV integrada mantém o comportamento anterior do projeto.

## Arquivos do frontend

Todos os caminhos abaixo são relativos ao AV-FrontEnd.

| Arquivo | Alteração |
| --- | --- |
| `src/App.tsx` | Rotas protegidas dos quatro cadastros e consultas pessoais |
| `src/components/AppShell.tsx` | Itens por perfil na única sidebar compartilhada |
| `src/integrations/client.ts` | DELETE, códigos de domínio e erros associados aos campos |
| `src/integrations/DoctorWorkspace.tsx` | Card informativo de perfil e escala no dashboard |
| `src/features/clinic/types.ts` | Contratos das entidades e inputs |
| `src/features/clinic/api.ts` | Validação básica de respostas e leitura de páginas |
| `src/features/clinic/hooks.ts` | Carregamento cancelável, retentativa e gravação com trava |
| `src/features/clinic/shared.tsx` | Layout, estados, erros, ações e confirmação reutilizáveis |
| `src/features/clinic/clinic.css` | Organização responsiva e dialog, mantendo o padrão visual |
| `src/features/specialties/api.ts` | Serviço de especialidades |
| `src/features/specialties/Page.tsx` | Busca, status, contagem, formulário e confirmação |
| `src/features/rooms/api.ts` | Serviço de salas |
| `src/features/rooms/Page.tsx` | Busca, status, formulário e tratamento de vínculos |
| `src/features/doctors/api.ts` | Diretório, cadastro, edição, inativação e perfil próprio |
| `src/features/doctors/validation.ts` | CRM, UF, e-mail, telefone e obrigatórios |
| `src/features/doctors/Page.tsx` | Gestão paginada, avatar com iniciais e consulta pessoal |
| `src/features/doctors/DashboardProfile.tsx` | Sala, especialidade e próximo plantão reais |
| `src/features/shifts/api.ts` | Consulta, gravação, série semanal e cancelamento |
| `src/features/shifts/validation.ts` | Intervalos e conflitos de médico/sala/recorrência |
| `src/features/shifts/format.ts` | Exibição de datas no fuso da clínica |
| `src/features/shifts/Page.tsx` | Grade semanal, lista, filtros e edição de ocorrências |
| `e2e-local/clinic-management.spec.ts` | Validações, CRUD, conflitos, permissões, navegação e celular |
| `playwright.config.ts` | Servidor isolado de demonstração em 5181 |
| `playwright.local-api.config.ts` | Servidor isolado de integração em 5182 |
| `tests/admin-sections.spec.ts` | Sessão anônima explícita no teste de acesso restrito |
| `tests/doctor.spec.ts` | Comparação atômica dos relógios, sem corrida de segundos |
| `tests/reception-priority.spec.ts` | Foco explícito para testar o Ctrl+Z dentro do campo |
| `docs/gestao-clinica.md` | Este levantamento, contratos e roteiro |
| `docs/backend-clinic-management.patch` | Patch revisável da extensão necessária ao backend |

## Arquivos do backend

Caminhos relativos ao AV-Backend. O cliente Prisma é regenerado a partir do schema.

| Arquivo | Alteração |
| --- | --- |
| `src/app.ts` | CORS admite DELETE |
| `src/config/runtime.ts` | Injeta o modelo de gestão clínica |
| `src/controllers/clinic.controller.ts` | Consulta por ID respeita o médico da sessão |
| `src/controllers/management.controller.ts` | Parsing Zod e respostas das novas operações |
| `src/docs/openapi.yaml` | Documenta rotas e payloads novos |
| `src/models/clinic.model.ts` | Conflitos de sala nas rotas de plantão já existentes |
| `src/models/management.model.ts` | Persistência dos cadastros, perfis, consultas e séries |
| `src/routes/index.ts` | Registra as novas rotas antes dos parâmetros genéricos |
| `src/routes/management.routes.ts` | Autenticação e autorização por operação |
| `src/services/management.service.ts` | Hash da senha antes da criação atômica |
| `src/validators/clinic.validator.ts` | Aceita referência persistida de sala no plantão |
| `src/validators/management.validator.ts` | Valida cadastros e recorrência |
| `prisma/schema.prisma` | Campos profissionais, descrição, Room e referências |
| `prisma/migrations/20261024160000_clinic_management/migration.sql` | Migration aditiva e vínculo de salas legadas |
| `tests/docs-contract.test.ts` | Quantidade e unicidade das operações ampliadas |
| `tests/queue-http.test.ts` | Contrato CORS com DELETE |
| `tests/session-list-http.test.ts` | Matriz de autenticação/permissões das novas operações |
| `tests/management.test.ts` | Validações, gravação e conflito nas rotas existentes |
| `tests/integration/management.test.ts` | Persistência real, concorrência e rollback de série |
| `tests/integration/clinic.test.ts` | Salas distintas nas fixtures e snapshot preservado |
| `tests/integration/system.test.ts` | Cobertura explícita das 17 operações do fluxo original |

## Como testar manualmente

Pré-requisito: backend atualizado, migrations aplicadas em banco de desenvolvimento e uma conta ADMIN. Inicie o backend e o frontend com proxy para essa instância local.

1. Entre como ADMIN. Abra **Especialidades**, cadastre e edite uma especialidade; pesquise pelo nome e altere o filtro de status.
2. Abra **Salas e consultórios**, cadastre Consultório 04, altere tipo/status e confira busca. Tente cadastrar o mesmo nome com outra caixa: deve ser rejeitado.
3. Abra **Médicos**, crie um médico com CRM/UF, e-mail, senha inicial, especialidade e sala. Busque por nome/CRM, filtre e edite. Tente repetir CRM/UF e e-mail: erro deve aparecer no campo, preservando o formulário.
4. Tente excluir a especialidade vinculada: deve oferecer inativar e exigir confirmação. Reative se necessário para continuar os cadastros.
5. Abra **Plantões**, crie um avulso de 08h a 12h. Tente outro para o mesmo médico de 10h a 11h; depois outro médico na mesma sala nesse intervalo. Ambos devem ser bloqueados. Um plantão a partir das 12h é permitido.
6. Troque entre grade semanal/lista e use os três filtros. Cadastre recorrência semanal com data final. Edite uma ocorrência. Cancele outra: Escape/Voltar não grava; Confirmar cancela e mantém o histórico.
7. Tente excluir a sala vinculada ao plantão: deve rejeitar a exclusão e oferecer inativar. Confirme a inativação somente se desejar.
8. Inative um médico: modal obrigatório, sem exclusão definitiva. Com entradas abertas, o servidor exige reatribuição/finalização.
9. Entre com a conta médica criada. Confira **Dashboard médico**, **Meu perfil e consultório** e **Meus plantões**. Sala padrão, especialidade e plantão atual/próximo precisam refletir os cadastros. Não há botões administrativos.
10. Navegue de ida e volta por todos os itens da sidebar autorizados, inclusive fila e paciente atual; confira o item ativo. Repita em celular. A chamada do próximo paciente continua passando somente por POST `/queues/me/next`.

## Verificação automatizada

- Frontend: `npm run lint`, `npm run build`, `npm test`, `npm run test:local-api`.
- Backend: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`.
- Persistência: `TEST_DATABASE_URL=<PostgreSQL local descartável> npm run test:integration`. O helper cria bancos isolados, aplica as migrations e os remove ao terminar; recusa hosts remotos.
- Suíte antiga de interface: **134 testes passaram**, incluindo transmissão, filas e navegação.
- Backend: **543 testes passaram**; PostgreSQL real: **109 testes passaram**.
- Suíte integrada: **38 testes passaram**, com navegação, CRUD, estados, conflitos e layout móvel.

Não houve deploy nem alteração do banco de produção. O comportamento em produção depende da publicação conjunta do backend e da aplicação da migration pela operação responsável.
