# Contratos pendentes do back-end — AgoraVocê (29/10/2026)

Este documento foi levantado a partir do código de **AV-Backend/main** e da integração atual no **AV-FrontEnd**. O front-end não deve simular autorização nem operações de persistência.

## Prioridade 0 — Cadastro de salas não existe na API

A UI usa `GET /api/v1/rooms`, `POST /api/v1/rooms`, `PATCH /api/v1/rooms/:id` e `DELETE /api/v1/rooms/:id`, mas **não há rotas `/rooms` registradas** no servidor atual.

Solicitar definição e implementação de modelo, migração, validação, permissões, resposta e endpoints. Proposta de campos para alinhamento: `id`, `name`, `type` (enum documentado), `active` ou `status` (definir transições). Evitar exclusão definitiva quando houver plantões vinculados.

Enquanto isso o front sinaliza indisponibilidade; o campo Tipo passa a usar uma seleção. **O formulário não pode ser considerado funcional sem os endpoints.**

## Prioridade 0 — Permissões da recepcionista

Atualmente `POST /api/v1/employees` e `GET /api/v1/employees` são `ADMIN` apenas; `PATCH /api/v1/employees/:id` também. `GET /api/v1/admin/doctors`, `POST /api/v1/doctors`, `PATCH /api/v1/doctors/:id` e `POST/PATCH /api/v1/doctors/:id/shifts` exigem `ADMIN`.

Requisitos acordados:
- Recepcionista pode cadastrar **MÉDICO** e **RECEPCIONISTA**, nunca **ADMIN**.
- Recepcionista pode cadastrar/editar plantões e consultar profissionais para esse fluxo.
- Administrador mantém ações exclusivas (ex.: criação/promoção de administrador).

Pedir: matriz RBAC por operação; autorização no servidor e não só visibilidade de menu; proteção contra elevação de privilégio via `role: ADMIN` em payloads; testes de 403 e de recursos de outra unidade, se aplicável; consulta de médicos para recepção sem acesso ao dashboard administrativo. Evitar liberar `GET /admin/doctors` ou `GET /employees` indiscriminadamente.

## Prioridade 1 — Médico sem especialidade e edição completa

Hoje `POST /api/v1/doctors` exige `{userId, specialtyId, active}`, e `PATCH /api/v1/doctors/:id` edita somente `specialtyId` e `active`; `PATCH /api/v1/employees/:id` edita os dados da conta.

O front já permite **criar conta MÉDICO sem selecionar especialidade**, deixando o vínculo médico para depois; se a especialidade for escolhida, cria o vínculo após a conta. Essas operações são **duas requisições distintas**, não transacionais, e o front avisa quando só a conta foi criada.

Para permitir um perfil médico com especialidade realmente opcional ou editar outros campos clínicos (CRM/UF, telefone, consultório, etc.), pedir mudança de contrato, regras de ativação para fila, migração e validação. Não adicionar campos de CRM na UI sem suporte real.

## Prioridade 1 — Senhas e painel de transmissão

A criação da entrada clínica em `POST /api/v1/entries` já atribui automaticamente `queueCode = AV-###` dentro do modelo de entrada. O painel público `GET /api/v1/public/calls` já expõe `queueCode`, sala e hora da chamada, sem dados pessoais; o front utiliza esse endpoint com atualização automática a cada 10 segundos.

Por outro lado, `POST /api/v1/tickets` cria um **ticket separado**, e `GET /api/v1/tickets/current` exige perfil de recepcionista. Para integrar recepção + TV num fluxo unificado, decidir se a senha oficial é a da **entrada clínica** (recomendado para não duplicar) ou se a emissão de ticket será incorporada à transação da entrada, com chave de idempotência e garantia de 1 senha por entrada. Se o monitor também precisar mostrar tickets avulsos, fornecer endpoint público somente de códigos/consultórios, sem nomes/CPF, e definir estados de chamada.

## Prioridade 2 — Especialidades

`POST /api/v1/specialties` aceita **apenas** `name` e `active`; `description` causa erro de validação estrita. O front foi alinhado removendo descrição do payload e da edição. Se descrição for requisito, incluir campo opcional no schema e persistência. `DELETE /api/v1/specialties/:id` não existe: manter inativação com `PATCH`.

## Já suportado

- `GET /api/v1/patients?cpf=<CPF>` — busca por CPF validado; permite o fluxo CPF primeiro.
- `GET /api/v1/patients/:id` e `GET /api/v1/patients/:id/entries` — ficha/histórico.
- `POST /api/v1/entries` — nova entrada e geração de `AV-###`.
- `GET /api/v1/public/calls` — atualização do monitor de senhas clínicas.
- `GET /api/v1/admin/doctors` — paginação, filtro por nome, especialidade e situação, para ADMIN.
- `GET /api/v1/doctors/:id`, `PATCH /api/v1/doctors/:id` — leitura/edição limitada de vínculo clínico.
- `GET /api/v1/doctors/:id/shifts`, `POST/PATCH /api/v1/doctors/:id/shifts` — plantões para ADMIN.

**Critérios de aceite back-end:** contratos OpenAPI atualizados, payloads estritos documentados, 400/401/403/404/409 coerentes, testes de autorização por perfil e transações/idempotência em emissão de senhas.
