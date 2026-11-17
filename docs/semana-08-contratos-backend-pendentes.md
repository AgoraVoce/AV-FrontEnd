# Semana 08 — contratos backend pendentes

> Especificação técnica para AV-Backend. Inspeção local somente para leitura: frontend no commit `e42b6b2` e backend no commit `ae07a00`, hashes re-confirmados em 16/11/2026. A análise de código foi feita contra essas cópias locais; não comprova o deploy.
>
> **Escopo:** documentar os contratos backend para as issues #47–#51. Nenhum endpoint, migration ou código de aplicação foi implementado nesta tarefa.

## Convenções de evidência

- **EXISTENTE E CONFIRMADO**: encontrado em rota/service/model e OpenAPI.
- **EXISTENTE, EXIGE ALTERAÇÃO**: rota real que precisa de extensão.
- **NOVO, PROPOSTO**: não existe no backend inspecionado.
- **DECISÃO PENDENTE**: o código não permite concluir uma política institucional.
- Todas as rotas externas estão sob `/api/v1`. JSONs e UUIDs deste documento são sintéticos. Preservar `Cache-Control: no-store` nos contratos clínicos.

## A. Resumo executivo

O frontend da Semana 08 implementa em `/medico/atendimento` formulário estruturado, descrição obrigatória, 0–50 medicamentos, orientações opcionais, revisão e finalização existente. O rascunho fica somente em memória por usuário/entrada e pode se perder após reload/fim da sessão. A rota protegida `/medico/prescricoes/:entryId` carrega documento confirmado, imprime via navegador e preserva download de PDF autenticado. O histórico aponta para a entrada exata. Envio por e-mail está indisponível e não faz request.

A operação clínica mais importante **já existe**: `POST /api/v1/entries/{id}/complete` grava Prescription, finaliza a EmergencyEntry e grava Attendance.finishedAt na mesma transação. Também existem fila própria, chamada transacional, início, consulta de entrada autorizada, histórico médico e PDF autenticado. Essas operações não devem ser duplicadas nem alteradas de modo a enfraquecer atomicidade, fila ou RBAC.

Faltam no backend: persistência/reabertura concorrente de draft (#47); nomes estruturados de sintomas no detalhe após chamada (#48); envio assíncrono via Resend com destinatário permitido, dedupe, status e auditoria (#51). HTML A4/print e impressão nativa (#49/#50) são frontend e não precisam de endpoint novo.

Essas lacunas exigem servidor: browser não pode manter clínica durável com segurança, decidir ownership, enriquecer a visita com catálogo sem contrato, proteger segredo Resend, garantir idempotência nem registrar estado confiável do provedor.

| Funcionalidade                                | Issue | Estado frontend                                        | Dependência backend                                       | Prioridade                   |
| --------------------------------------------- | ----: | ------------------------------------------------------ | --------------------------------------------------------- | ---------------------------- |
| Formulário, review e finalização transacional |   #47 | Parcial; draft é só memória                            | Finalização já existe; persistência de draft proposta     | P1                           |
| Sintomas e queixas                            |   #48 | Parcial; usa campos reais e nomes transitórios da fila | Estender detail com nomes relacionados à entrada          | P1                           |
| Relatório A4                                  |   #49 | Implementado no frontend                               | Detail e Prescription já existentes                       | P2                           |
| Imprimir                                      |   #50 | Implementado para documento confirmado; PDF existente  | Nenhum endpoint novo                                      | P2                           |
| Email/Resend                                  |   #51 | Indisponível, sem sucesso fictício                     | Novos contratos, delivery/outbox, worker e status/webhook | P2 após decisões de política |

**Ordem:** manter contratos transacionais existentes; estender detail; decidir retenção e implantar draft versionado; decidir elegibilidade/destinatário/canal de email; construir outbox/Resend; atualizar OpenAPI/testes; integrar frontend e homologar. Email não bloqueia finalização ou impressão.

### Arquivos examinados

Frontend: `README.md`, `DESIGN.md`, `UX-CONTRACT.md`, `premium-ui.json`, `src/App.tsx`, `src/integrations/DoctorWorkspace.tsx`, `ClinicDataPages.tsx`, `operational-api.ts`, `extended-api.ts`, `client.ts`, `src/auth/AuthProvider.tsx`, `src/auth/context.ts`, módulos de `src/features/prescriptions`, `e2e-local/prescription-week8.spec.ts` e `docs/semana-08-prescricao-frontend.md`. O arquivo de contexto real é `context.ts`, não `context.tsx`.

Backend: schema Prisma, rotas/controllers/services/models/validators, OpenAPI e testes locais. Referências em `../AV-Backend/src` são para a cópia inspecionada, não escrita.

## B. Inventário de endpoints existentes

O middleware de erro atual retorna envelope seguro, por exemplo:

```json
{
  "error": {
    "code": "ENTRY_STATE_CONFLICT",
    "message": "Entry state conflict"
  }
}
```

Para erros de validação, o envelope pode incluir details com campos genéricos. Não retornar stack, payload clínico ou valores do paciente em mensagens.

### B.1 GET `/api/v1/queues/me` — EXISTENTE E CONFIRMADO

- **Finalidade/frontend:** fila própria e sintomas antes da chamada; consumido por `DoctorWorkspace.tsx`.
- **Auth/RBAC:** Bearer; MEDICO ativo e Doctor ativo vinculado ao user do token. Backend determina identidade; sem doctorId externo.
- **Params/body:** nenhum; query desconhecida rejeitada.
- **Resposta:** 200 com items contendo entryId, dados mínimos do paciente, queueCode, severity, enteredAt, symptoms [{id,name}], otherSymptoms e shortNote; fila vazia é items [].
- **Regra confirmada:** somente AGUARDANDO atribuído ao médico; prioridade VERMELHO > AMARELO > VERDE, depois enteredAt ascendente e id ascendente. Leitura não altera status e inclui sintomas mesmo desativados depois.
- **Erros:** 400 query inválida, 401 sessão, 403 role/perfil, 500, 503. OpenAPI define no-store.
- **Limite:** os nomes são reusados em memória pelo frontend somente para o mesmo entryId/usuário. Não são fonte durável pós-chamada.
- **Decisão:** manter inalterado.

### B.2 POST `/api/v1/queues/me/next` — EXISTENTE E CONFIRMADO

- **Finalidade/frontend:** pedir seleção ao servidor; `operations.callNext()` em `operational-api.ts`.
- **Auth:** Bearer MEDICO; o médico deriva da sessão.
- **Params/body:** nenhum; body vazio ou omitido.
- **Resposta:** 200 com EntryDetailsResponse quando chama; 204 quando a fila está vazia.
- **Regra confirmada:** seleção ordenada por severidade/entrada/id, lock transacional, plantão validado, uma chamada/atendimento ativo por médico. Atualiza para CHAMADO e cria Attendance.
- **Erros:** 400/401/403/409/500/503; 409 inclui médico ocupado ou plantão indisponível.
- **Decisão:** manter. Retry cego pode chamar outro paciente; nenhuma ação de prescrição chama endpoint de fila.

### B.3 GET `/api/v1/entries/{id}` — EXISTENTE, EXIGE ALTERAÇÃO PARA #48

- **Finalidade/frontend:** consulta autorizada para conciliação e documento; `operations.entry(id,signal)`.
- **Tipo frontend:** `EntryDetail` em `operational-api.ts`, hoje com symptomIds opcional, sem nomes estruturados.
- **Auth/RBAC:** Bearer; RECEPCIONISTA dentro das regras atuais ou MEDICO responsável. Médico alheio recebe 404. GET /patients/{id} é RECEPCIONISTA-only; médico não pode usá-lo para obter email.
- **Params/body:** id UUID; sem query/body.
- **Resposta atual:** 200 EntryDetailsResponse com entry, paciente nome/data de nascimento, médico atribuído, timestamps, symptomIds, otherSymptoms, shortNote, sala e prescription ou null. Não retorna email.
- **Erros:** 400/401/403/404/500/503; no-store.
- **Limite confirmado:** `readEntryDetails()` seleciona apenas symptomId. GET /queues/me já faz join id/nome. Doctor deriva do médico atribuído; Attendance.doctorId é o vínculo do atendimento executado e deve continuar consistente.
- **Decisão:** preservar campos/autorização e acrescentar symptoms[] (seção D).

### B.4 PATCH `/api/v1/entries/{id}/status` — EXISTENTE E CONFIRMADO

- **Finalidade/frontend:** médico inicia; recepção cancela sob transição permitida; `operations.setStatus`.
- **Auth:** Bearer; rota aceita MEDICO e RECEPCIONISTA, service restringe as transições por role/recurso.
- **Body:** estrito, status in_progress para médico da entrada chamada; cancelled no fluxo permitido à recepção.
- **Resposta:** 200 EntryDetailsResponse.
- **Regra:** início muda CHAMADO para EM_ATENDIMENTO e registra Attendance.startedAt via transação.
- **Erros:** 400/401/403/404/409/500/503.
- **Decisão:** manter; complete continua sendo única transição de conclusão.

### B.5 POST `/api/v1/entries/{id}/complete` — EXISTENTE E CONFIRMADO

- **Finalidade/frontend:** persiste prescrição e conclusão atômicas; `operations.complete` e `DoctorWorkspace.complete`.
- **Auth:** Bearer MEDICO; service valida Doctor ativo, médico atribuído, Attendance.doctorId e EM_ATENDIMENTO; entrada alheia oculta com 404.
- **Body real:** objeto estrito {prescription:{description,medications,notes?}}. Description trim 1–5000; medications 0–50; cada item name 1–150, dosage 1–150, instructions 1–1000; notes opcional/nulo até 4000. Lista vazia é válida.

```json
{
  "prescription": {
    "description": "Conduta sintética deste atendimento.",
    "medications": [],
    "notes": "Orientação sintética opcional."
  }
}
```

- **Sucesso real:** 200 EntryCompletionResponse com status completed e Prescription {id,description,medications,notes,createdAt}. Controller usa JSON; 204 não é resposta de sucesso do backend.
- **Transação real:** cria Prescription, atualiza EmergencyEntry para FINALIZADO e Attendance.finishedAt na mesma transação. Unique por attendance e locks evitam duplicidade; rollback cobre falha em write posterior.
- **Erros:** 400/401/403/404/409/500/503.
- **Limites:** sem autosave de draft. Frontend consulta GET após erro/timeout. Teste de integração confirma prescriptionEmailStatus permanece null depois de complete.
- **Decisão:** manter body/atomicidade. If-Match para versão de draft é proposta em C.5.

### B.6 GET `/api/v1/entries/{id}/prescription.pdf` — EXISTENTE E CONFIRMADO

- **Finalidade/frontend:** PDF persistido autenticado via `openPrescriptionPdf` em `extended-api.ts` e histórico.
- **Auth:** Bearer; MEDICO responsável ou RECEPCIONISTA sob autorização atual.
- **Resposta:** 200 application/pdf; inline/nosniff. Erros 400/401/403/404/409/429/500/503.
- **Conteúdo observado:** PDFKit A4 com paciente, médico da Attendance, data em America/Sao_Paulo, conduta, meds inclusive lista vazia e notes; sem sintomas/sala, assinatura digital ou CRM.
- **Decisão:** preservar; não criar endpoint duplicado de print/PDF.

### B.7 GET `/api/v1/doctors/me/entries` — EXISTENTE E CONFIRMADO

- **Frontend/tipo:** `extended.doctorEntries`, `EntryHistory`, `EntryHistoryPage` em `ClinicDataPages.tsx`.
- **Auth:** MEDICO, profissional resolvido pela sessão.
- **Query:** page/pageSize; filtros também declarados no OpenAPI; frontend envia pageSize 10.
- **Resposta:** 200 ClinicEntryPage; não inclui prescrição completa.
- **Decisão:** manter; preview consulta detail pelo entryId exato e backend revalida acesso.

### B.8 GET `/api/v1/doctors/me/active` — EXISTENTE E CONFIRMADO

- **Finalidade/frontend:** restaurar atendimento ativo; `extended.active`.
- **Auth:** Bearer MEDICO, escopo próprio.
- **Resposta:** detalhe ou null conforme o estado.
- **Limite/decisão:** não recupera draft; manter como recurso separado.

## C. Persistência de draft (#47)

### C.1 Modelo comum

O `draft-store.ts` guarda conteúdo apenas em memória por usuário+entryId; reload/fim da sessão perde rascunho. Não há rota de draft. Complete exige payload final e encerra atendimento; não usar `Attendance.prescriptionText` (coluna legada) como autosave.

**Modelo proposto:** PrescriptionDraft com id UUID, attendanceId UUID UNIQUE/FK, description TEXT default "", medications JSONB default [], notes TEXT nullable, version INT, createdAt, updatedAt e updatedByUserId FK User. Migration necessária. Owner deriva de Attendance.doctorId; não aceitar patientId/doctorId/attendanceId no body.

**Regras comuns:** só MEDICO responsável/ativo e estado EM_ATENDIMENTO; draft pode ser parcial, mas respeita máximos (description 5000; até 50 meds; name/dosage 150, instructions 1000, notes 4000). Complete mantém validação rígida já existente. Validar JSONB ao ler/escrever. Preservar texto Unicode/linhas/literais HTML. Locks da EmergencyEntry/Attendance coordenam draft com complete. ETag de versão, por ex. `"draft-v7"`: create If-None-Match *, update/delete If-Match. Stale retorna 412 sem write. Timeout de PUT reconcilia com GET e comparação de conteúdo/version. Após finalização, Prescription/status/finishedAt/delete draft são uma única transação. Expurgar drafts abandonados por TTL configurável; prazo de retenção e cancelamento são decisões institucionais. No-store; nenhum conteúdo clínico em logs, URL, analytics ou storage browser.

### C.2 D1 — GET draft — NOVO, PROPOSTO

1. **ID/prioridade:** D1/P1. **Issue:** #47. **Finalidade:** retomar draft após reload. **Situação:** inexistente; detail não contém draft.
2. **Método/path:** GET `/api/v1/entries/{id}/prescription-draft`. Leitura do recurso filho singular.
3. **Autenticação/RBAC:** Bearer JWT; somente MEDICO dono da Attendance/entrada; recepção/Admin 403.
4. **Pré-condição:** Doctor ativo, Attendance própria e EM_ATENDIMENTO.
5. **Params/query:** id UUID; sem query.
6. **Headers:** Authorization/Accept; response ETag se houver e no-store.
7. **Request body:** nenhum.
8. **Sucesso:** 200; ausência é draft:null, não 404. JSON:

```json
{
  "entryId": "10000000-0000-4000-8000-000000000001",
  "draft": {
    "description": "Conduta sintética parcial.",
    "medications": [],
    "notes": null,
    "version": 7,
    "createdAt": "2026-11-12T12:00:00.000Z",
    "updatedAt": "2026-11-12T12:02:00.000Z"
  }
}
```

9. **Erros:** 400 UUID; 401 auth/revogado; 403 role/profile; 404 entrada ausente/alheia; 409 estado; 500/503.
10. **Zod/schema:** params UUID estrito, query vazia, output do modelo validado; não serializar FK interna.
11. **Regras:** não revelar draft de outra pessoa nem draft finalizado; nenhum email/CPF/outros atendimentos.
12. **Prisma:** read por Attendance; depende de PrescriptionDraft.
13. **Transação/concorrência:** leitura consistente de entry/attendance/draft; ETag identifica versão.
14. **Idempotência:** GET é naturalmente idempotente.
15. **Auditoria:** sem conteúdo clínico em log.
16. **Frontend:** restaurar valores/version; “salvo” somente após confirmação.
17. **Testes/aceite:** owner com/sem draft, outro médico 404, roles, estado, sessão, no-store; relogin recupera apenas mesmo entry e nada concluído.
18. **Referências:** `draft-store.ts`, `DoctorWorkspace.tsx`, schema Prisma e EntryDetailsResponse.

### C.3 D2 — PUT draft — NOVO, PROPOSTO

1. **ID/prioridade:** D2/P1. **Issue:** #47. **Finalidade:** persistir edição sem concluir. **Situação:** inexistente.
2. **Método/path:** PUT `/api/v1/entries/{id}/prescription-draft`; substitui recurso único.
3. **Autenticação/RBAC:** Bearer MEDICO responsável, perfil ativo; sem IDs de proprietário enviados.
4. **Pré-condição:** EM_ATENDIMENTO, Attendance.doctorId igual ao médico autenticado.
5. **Params/query:** id UUID; sem query.
6. **Headers:** Content-Type JSON; create exige If-None-Match: *; update exige If-Match "draft-vN"; response ETag/no-store.
7. **Request body completo; parcial permitido:**

```json
{
  "description": "Conduta em edição.\nLinha sintética.",
  "medications": [
    {
      "name": "Medicamento fictício",
      "dosage": "",
      "instructions": ""
    }
  ],
  "notes": ""
}
```

8. **Resposta:** 201 ao criar, 200 ao atualizar; retorna recurso canônico e version incrementada:

```json
{
  "entryId": "10000000-0000-4000-8000-000000000001",
  "draft": {
    "description": "Conduta em edição.\nLinha sintética.",
    "medications": [
      {
        "name": "Medicamento fictício",
        "dosage": "",
        "instructions": ""
      }
    ],
    "notes": "",
    "version": 8,
    "createdAt": "2026-11-12T12:00:00.000Z",
    "updatedAt": "2026-11-12T12:03:00.000Z"
  }
}
```

9. **Erros:** 400 validação; 401; 403; 404; 409 estado não editável; 412 PRESCRIPTION_DRAFT_STALE; 428 precondição ausente; 429 autosave; 500/503.
10. **Zod sugerido:** strict object; description string max5000 sem min; medications array max50 de strict objects com name max150, dosage max150, instructions max1000 sem min; notes string max4000/nulo. Não usar trim/min da prescrição final durante edição.
11. **Regras:** aceitar lista vazia, campos incompletos e texto vazio; não criar Prescription ou alterar status; rejeitar extras.
12. **Prisma:** migration PrescriptionDraft; unique attendanceId e FK.
13. **Transação/concorrência:** lock entry/attendance, confirmar owner/status/ETag, write e version++ atomicamente. Proibido last-write-wins.
14. **Idempotência:** substitutivo; após timeout GET reconcilia. Opcional Idempotency-Key para mesma operação/body.
15. **Auditoria:** ator/entry/versão/resultado; nunca body clínico; rate limit autosave.
16. **Frontend:** debounce; status salvando/salvo/falha/conflito; revisão espera versão salva.
17. **Testes/aceite:** limites, parcial, Unicode/HTML literal, timeout+GET, stale, concorrência, sessão, status final; PUT nunca conclui e draft velho nunca sobrescreve outro.
18. **Referências:** DoctorWorkspace, draft-store e validator atual de complete.

### C.4 D3 — DELETE draft — NOVO, PROPOSTO

1. **ID/prioridade:** D3/P1. **Issue:** #47. **Finalidade:** descarte remoto explícito. **Situação:** hoje limpa só memória.
2. **Método/path:** DELETE `/api/v1/entries/{id}/prescription-draft`.
3. **Autenticação/RBAC:** Bearer, MEDICO dono.
4. **Pré-condição:** EM_ATENDIMENTO; versão obrigatória se draft existe.
5. **Params/query:** id UUID, sem query.
6. **Headers/body:** If-Match quando há draft; sem body; no-store.
7. **Sucesso:** 204; se ausente e ainda editável, repetição também 204.
8. **Erros:** 400/401/403/404/409 concluído/412 stale/500/503.
9. **Zod:** UUID estrito, query/body vazios, validar ETag.
10. **Prisma/transação:** delete por Attendance sob mesmo lock de PUT/complete; sem cascade para Prescription.
11. **Regras:** não muda estado clínico; navegação não descarta draft remoto sem escolha explícita; complete remove draft atomicamente.
12. **Idempotência/concorrrência:** 204 para ausente em estado editável; corrida com complete serializada; completed retorna conflito e cliente consulta detail.
13. **Auditoria:** ator/entry/version/time, sem corpo.
14. **Frontend/testes/aceite:** limpar memória após confirmação; testar owner, stale, outro médico, ausência, corrida e Prescription intacta.
15. **Referências:** guardas de saída em DoctorWorkspace e draft-store.

### C.5 D4 — POST complete com If-Match — EXISTENTE, EXIGE ALTERAÇÃO

1. **ID/prioridade:** D4/P1 após D2. **Issue:** #47. **Motivo:** revisão deve corresponder à versão remota atual.
2. **Método/path:** manter POST `/api/v1/entries/{id}/complete`; não criar finalize paralelo.
3. **Auth/RBAC/pré-condição:** Bearer MEDICO dono/ativo, EM_ATENDIMENTO e payload válido, como hoje.
4. **Params/query:** id UUID, sem query. Body mantém exatamente contrato atual.
5. **Header:** nova UI envia If-Match "draft-vN"; ausente permitido durante rollout; só exigir após todos os clientes migrarem.
6. **Resposta:** manter 200 EntryCompletionResponse; stale retorna 412 sem alteração. O JSON é a mesma estrutura completa de D.3, com status completed e prescription não nula; D.3 serve como exemplo de resposta 200.
7. **Erros:** atuais 400/401/403/404/409/500/503; adicionar 412 PRESCRIPTION_DRAFT_STALE; considerar 428 somente depois da fase compatível.
8. **Zod:** completeEntrySchema atual inalterado; validar sintaxe do header.
9. **Regra/transação:** checar versão dentro da transação; criar Prescription, finalizar status, finishedAt e apagar draft juntos.
10. **Concorrência/Prisma:** manter locks atuais e unique Prescription por attendance; version check antes de writes.
11. **Idempotência:** manter no máximo uma Prescription; timeout conciliado por GET; payload diferente nunca recebe sucesso falso.
12. **Auditoria:** ator/entry/versão consumida, sem conteúdo em logs.
13. **Frontend:** review da versão salva, invalida após edição, envia If-Match.
14. **Testes/aceite:** stale 412 sem writes, corrida PUT/complete, duplo complete, rollback e compatibilidade sem header durante rollout; permanece uma prescrição.
15. **Referências:** completeEntryController, entry.model/service/validator, tests/integration/attendance.test.ts e operations.complete.

## D. Sintomas e dados da entrada (#48)

`EmergencyEntry.symptoms` relaciona `EntrySymptom(entryId,symptomId)` a `Symptom(id,name,active)`. Entry creation registra IDs; fila já faz join id/name. `readEntryDetails()` hoje seleciona somente symptomId. Estender detail é melhor que criar catálogo ou consultar paciente.

Campos atuais do detail: paciente id/fullName/birthDate; doctor id/name; entry id/queueCode/enteredAt/status/severity; symptomIds; otherSymptoms; shortNote; room; timestamps; prescription. Não há email. Texto livre e observação são valores registrados, não nomes inferidos. Severity vem da triagem externa; não recalcular.

### D5 — GET detail com nomes — EXISTENTE, EXIGE ALTERAÇÃO

1. **ID/prioridade/issue:** D5/P1/#48; nomes estruturados pós-chamada.
2. **Situação:** rota existe mas só retorna IDs; schema OpenAPI é strict/additionalProperties false.
3. **Método/path:** manter GET `/api/v1/entries/{id}`.
4. **REST:** enriquecer representação atual, sem endpoint novo.
5. **Auth/RBAC:** Bearer; RECEPCIONISTA no escopo atual ou MEDICO responsável; médico alheio 404.
6. **Pré-condições/params:** UUID, autorização; nenhuma query.
7. **Headers/body:** no-store; sem body.
8. **Resposta:** preservar symptomIds e adicionar symptoms: [{id,name}], [] se vazio. Mesmo join EntrySymptom.
9. **Erros:** os atuais 400/401/403/404/500/503.
10. **Zod/OpenAPI:** atualizar response schema e DTO juntos; id UUID/name max120; preservar symptomIds por compatibilidade.
11. **Prisma:** incluir symptom.id/name no select da relação já existente; migration desnecessária se rótulo corrente serve.
12. **Regras:** incluir sintomas ligados à mesma entrada, mesmo inativos; nunca inferir por texto, gravidade, idade ou visita distinta.
13. **Transação:** join na mesma leitura consistente.
14. **Idempotência/cache:** GET sem efeito, no-store.
15. **Auditoria:** não logar texto clínico/nome.
16. **Frontend:** consumir somente quando entryId retornado corresponde.
17. **Testes/aceite:** duas entradas sintéticas não cruzam nomes; inativo permanece; vazio é []; médico alheio 404; OpenAPI/testes atualizados.
18. **Referências:** schema EntrySymptom/Symptom, readEntryDetails, entryDetailDto e EntryDetailsResponse.

Como o contrato rejeita propriedades extras, atualizar OpenAPI e testes ao mesmo tempo. Manter symptomIds na transição. **Decisão pendente:** Symptom.name é imutável? Se renomeável e precisa preservar histórico, snapshot nameSnapshot exige migration/backfill; se imutável, não.

### Exemplo de resposta completa (sintética)

```json
{
  "id": "10000000-0000-4000-8000-000000000001",
  "patientId": "20000000-0000-4000-8000-000000000002",
  "enteredByUserId": "30000000-0000-4000-8000-000000000003",
  "enteredAt": "2026-11-12T11:00:00.000Z",
  "severity": "AMARELO",
  "symptomIds": ["40000000-0000-4000-8000-000000000004"],
  "symptoms": [
    {
      "id": "40000000-0000-4000-8000-000000000004",
      "name": "Sintoma fictício"
    }
  ],
  "otherSymptoms": "Queixa sintética registrada.",
  "shortNote": "Observação sintética.",
  "status": "completed",
  "assignedDoctorId": "50000000-0000-4000-8000-000000000005",
  "queueCode": "AV-987",
  "createdAt": "2026-11-12T11:00:00.000Z",
  "updatedAt": "2026-11-12T12:00:00.000Z",
  "patient": {
    "id": "20000000-0000-4000-8000-000000000002",
    "fullName": "Paciente Fictício",
    "birthDate": null
  },
  "doctor": {
    "id": "50000000-0000-4000-8000-000000000005",
    "name": "Dra. Médica Fictícia"
  },
  "queuePosition": null,
  "room": "Sala sintética",
  "timestamps": {
    "enteredAt": "2026-11-12T11:00:00.000Z",
    "calledAt": "2026-11-12T11:20:00.000Z",
    "startedAt": "2026-11-12T11:30:00.000Z",
    "finishedAt": "2026-11-12T12:00:00.000Z"
  },
  "prescription": {
    "id": "60000000-0000-4000-8000-000000000006",
    "description": "Conduta sintética <script>literal</script>.",
    "medications": [],
    "notes": null,
    "createdAt": "2026-11-12T12:00:00.000Z"
  }
}
```

Datas são timestamps ISO-8601 inequívocos (Z/offset); frontend formata em pt-BR/America-Sao_Paulo. Valores desconhecidos permanecem null/[]; não adicionar email, CPF ou informação de outro atendimento.

## E. Email/Resend (#51)

### E.1 Evidência e arquitetura

Não existe rota de email clínico ou webhook. Prisma possui Attendance.prescriptionEmailStatus e enum PENDENTE/ENVIADO/FALHOU, mas isso não é feature operacional: finalização deixa null e teste de integração confirma. Não representa processing, accepted, delivered ou unknown. Resend em `password-reset.service.ts` é exclusivamente para recuperação de senha.

Recomenda-se **outbox assíncrono**: API autoriza e grava pedido, responde 202 queued, worker envia fora da transação clínica, webhook reconcilia estado. Fonte do documento é somente Prescription persistida. Falha de email jamais reverte finalização.

Patient.email existe nullable, mas schema não tem consentimento/verificação. Destinatário deve ser resolvido pelo servidor; nunca aceitar to no body. RESEND_API_KEY/segredo webhook somente em backend/secret manager.

Estados propostos: queued, processing, accepted, delivery_delayed, delivered, failed, unknown. Accepted = provedor aceitou request; delivered = servidor destino aceitou, não que paciente leu. Documentação oficial: [Idempotency Keys Resend](https://resend.com/changelog/idempotency-keys), [webhooks](https://resend.com/docs/dashboard/webhooks/introduction), [significado de delivered](https://resend.com/guides/email/users-never-got-login-code). A chave do provider tem janela limitada; dedupe local deve durar conforme retenção.

### E.2 E1 — GET capability/status — NOVO, PROPOSTO

1. **ID/prioridade/issue:** E1/P2/#51. **Finalidade:** consultar suporte, elegibilidade e último status. **Situação:** inexistente.
2. **Método/path:** GET `/api/v1/entries/{id}/prescription-email`.
3. **Auth/RBAC:** Bearer; somente MEDICO responsável por Attendance; admin/recepção sem nova permissão.
4. **Pré-condição:** entry autorizada; eligible requer completed, Prescription e destinatário/política válida.
5. **Params/query:** id UUID, sem query. **Headers:** no-store. **Body:** nenhum.
6. **200 response:**

```json
{
  "supported": true,
  "eligible": false,
  "reasonCode": "RECIPIENT_NOT_ELIGIBLE",
  "latestDelivery": null
}
```

7. latestDelivery, se presente, contém deliveryId/status/requestedAt/updatedAt/acceptedAt/deliveredAt/failureCode seguro; nunca endereço, conteúdo ou provider payload.
8. **Erros:** 400/401/403/404/500/503. **Zod:** enums fechados, response sem PII.
9. **Regras:** supported false se integração não ativa; status read-only, não envia; não revela email.
10. **Prisma/transação:** leitura consistente Entry/Attendance/Prescription/delivery; email somente interno; sem write.
11. **Idempotência/auditoria:** GET natural; métricas sem PII.
12. **Frontend:** habilitar somente supported+eligible e refletir status real.
13. **Testes/aceite:** integração ausente, email ausente, owner/alheio, prescription ausente, response sem email; UI conhece status sem destinatário.
14. **Referências:** PreviewPage, Patient.email e clinic.routes.

### E.3 E2 — POST solicitar envio — NOVO, PROPOSTO

1. **ID/prioridade/issue:** E2/P2/#51. **Finalidade:** criar pedido de envio persistido. **Situação:** não existe.
2. **Método/path:** POST `/api/v1/entries/{id}/prescription-email`.
3. **Auth/RBAC:** Bearer; somente MEDICO responsável por entrada concluída.
4. **Pré-condições:** completed, Prescription válida, destinatário aprovado por policy, serviço ativo.
5. **Params/query:** id UUID, sem query. **Headers:** Authorization, Content-Type, Idempotency-Key opaca/UUID, rate limit, no-store.
6. **Body:** objeto estrito vazio {}. Proibidos email/to, prescrição, HTML, PDF, URL.
7. **202 response:**

```json
{
  "deliveryId": "70000000-0000-4000-8000-000000000007",
  "entryId": "10000000-0000-4000-8000-000000000001",
  "status": "queued",
  "requestedAt": "2026-11-12T12:05:00.000Z"
}
```

8. **Erros:** 400 body/header; 401/403/404; 409 não concluído/sem prescription/não elegível/entrega ativa/já delivered; 429 Retry-After; 500/503 integração.
9. **Zod:** strictObject vazio; validar chave/tamanho; rejeitar propriedades extras.
10. **Regras:** destinatário e documento resolvidos do banco; nunca arbitrário; active delivery reutiliza estado; retry manual só após falha terminal aprovada.
11. **Prisma:** Delivery/outbox ligada a Prescription/Attendance, idempotency key unique, status/attempts/timestamps/providerMessageId unique/errorCode sanitizado; snapshot email cifrado somente se necessário para worker e com retenção.
12. **Transação:** autorizar/elegibilidade/dedupe e inserir outbox atomicamente; chamada Resend fora da transação.
13. **Idempotência:** mesma key/body devolve mesma operação; key distinta não cria duplicata ativa; em timeout reutilizar a key; provider key não substitui unique local.
14. **Auditoria:** ator/entry/delivery/status/código técnico; sem email, bearer, secret, PDF, body ou conteúdo.
15. **Frontend:** 202 significa “solicitação registrada”, não “entregue”.
16. **Testes/aceite:** double click/keys concorrentes, owner/role, email ausente, timeout antes/depois de aceitação, 429/5xx; nenhum duplicate e falha não reverte completed.
17. **Referências:** Prisma Patient.email/Attendance, reset service e PreviewPage.

### E.4 E3 — webhook Resend — NOVO, PROPOSTO

1. **ID/prioridade/issue:** E3/P2/#51, depende de E2. **Finalidade:** conciliar eventos do provider. **Situação:** inexistente.
2. **Método/path:** POST proposto `/api/v1/webhooks/resend`; confirmar padrão do deployment.
3. **Autenticação/autorização:** sem JWT de usuário; assinatura Resend/Svix verificada no backend, timestamp/replay window e limite de body.
4. **Params/query:** nenhum. **Headers:** svix-id, svix-timestamp, svix-signature; usar raw body para validar.
5. **Exemplo mínimo ilustrativo:**

```json
{
  "type": "email.delivered",
  "created_at": "2026-11-12T12:06:00.000Z",
  "data": {
    "email_id": "resend-message-synthetic-001"
  }
}
```

6. **Sucesso:** 204 após evento persistido. **Erros:** 400 assinatura/payload; 413 body; 429; 5xx/503 para retry; evento válido desconhecido é decisão pendente.
7. **Validação:** validar assinatura sobre bytes originais antes do parse; timestamp e allowlist de eventos/IDs.
8. **Regras:** duplicate não muda duas vezes; eventos não regridem status terminal; accepted não equivale delivered.
9. **Prisma:** inbox providerEventId UNIQUE, delivery FK e metadados mínimos; migration se não existe tabela equivalente.
10. **Transação/concorrência:** inserir event e atualizar delivery atomicamente; tratar eventos fora de ordem ou anteriores ao providerMessageId.
11. **Idempotência/auditoria:** unique event ID; guardar metadados mínimos, nunca body bruto/email/clínica.
12. **Frontend:** não chama webhook; consulta E1.
13. **Testes/aceite:** assinatura válida/inválida, replay, antigo/fora de ordem, desconhecido, DB indisponível, logs sem PII; delivered só com evento validado e não significa leitura.
14. **Referências:** ausência em clinic.routes, enum atual e docs Resend.

### E.5 Decisões pendentes antes de ativar

- Patient.email basta ou exige email verificado/consentimento/responsável legal? Código atual não responde.
- Conteúdo aprovado: PDF anexo ou outra forma/canal; sem URL pública/token bearer.
- Snapshot de destinatário cifrado e expurgo para worker assíncrono, para alteração cadastral não redirecionar pedido pendente.
- Worker durable suportado no deployment, pois inspeção local não encontrou outbox clínico.
- Regras de retry, backoff, rate limit, tentativa manual, status unknown e retenção.
- Não usar enum atual como prova de entrega; não duplicar status legado sem estratégia de compatibilidade.

## F. Relatório e impressão (#49/#50)

Frontend tem documento semântico, CSS A4 e rota protegida; consulta detail pelo ID e exige completed+Prescription válida antes de habilitar window.print(). Print/cancelar não chama mutation. Backend já oferece detail autorizado e PDF autenticado gerado da Prescription persistida.

**Não há endpoint adicional necessário.** HTML é impresso pelo browser; PDF atual é alternativa para download. Não criar rota /print, PDF duplicado ou estado “impresso”: navegador não confirma impressão física. Prescrição ausente/inválida não deve virar documento. Sem assinatura digital/CRM/carimbo inventado. Falha de PDF/print não desfaz finalização.

## G. Matriz consolidada

| Prioridade |       Issue | Método | Endpoint                         | Mudança                   | Quem acessa       | Estado                  | Frontend            |
| ---------- | ----------: | ------ | -------------------------------- | ------------------------- | ----------------- | ----------------------- | ------------------- |
| Existente  |     #47/#48 | GET    | /queues/me                       | manter                    | MEDICO próprio    | aguardando              | workspace           |
| Existente  |       Fluxo | POST   | /queues/me/next                  | manter                    | MEDICO próprio    | elegível                | workspace           |
| P1         |         #48 | GET    | /entries/{id}                    | estender symptoms[]       | RECP/MEDICO dono  | autorizado              | operations.entry    |
| P1         |         #47 | GET    | /entries/{id}/prescription-draft | novo                      | MEDICO dono       | EM_ATENDIMENTO          | workspace           |
| P1         |         #47 | PUT    | /entries/{id}/prescription-draft | novo                      | MEDICO dono       | EM_ATENDIMENTO          | workspace           |
| P1         |         #47 | DELETE | /entries/{id}/prescription-draft | novo                      | MEDICO dono       | EM_ATENDIMENTO          | workspace           |
| P1         |         #47 | POST   | /entries/{id}/complete           | If-Match, body inalterado | MEDICO dono       | EM_ATENDIMENTO          | operations.complete |
| Existente  |       Fluxo | PATCH  | /entries/{id}/status             | manter                    | por transição     | chamado/cancelável      | workspace           |
| Existente  |   Histórico | GET    | /doctors/me/entries              | manter                    | MEDICO próprio    | histórico               | ClinicDataPages     |
| Existente  | Restauração | GET    | /doctors/me/active               | manter                    | MEDICO próprio    | ativo/null              | workspace           |
| Existente  |     #49/#50 | GET    | /entries/{id}/prescription.pdf   | manter                    | escopo atual      | Prescription persistida | extended-api        |
| P2         |         #51 | GET    | /entries/{id}/prescription-email | novo                      | MEDICO dono       | completed               | preview futuro      |
| P2         |         #51 | POST   | /entries/{id}/prescription-email | novo async                | MEDICO dono       | completed/elegível      | preview futuro      |
| P2         |         #51 | POST   | /webhooks/resend                 | webhook                   | provider assinado | delivery                | nenhum              |

Contratos completos das rotas novas/alteradas: C.2–C.5, D.2 e E.2–E.4. Rotas propostas não são contratos existentes.

## H. Segurança e RBAC

| Operação       | ADMIN | RECEPCIONISTA          | MEDICO                    | Público    | Controle                 |
| -------------- | ----- | ---------------------- | ------------------------- | ---------- | ------------------------ |
| queue/me, next | 403   | 403                    | fila própria              | 401/403    | JWT e locks              |
| detail         | 403   | acesso atual           | responsável               | 401        | outro médico 404         |
| status         | 403   | cancelamento permitido | inicia própria entrada    | 401        | transição no service     |
| complete       | 403   | 403                    | responsável/Attendance    | 401        | transação                |
| draft proposto | 403   | 403                    | dono, EM_ATENDIMENTO      | 401        | owner, versão, no-store  |
| history/active | 403   | 403                    | próprio médico            | 401        | sem doctorId do cliente  |
| PDF            | 403   | permissão atual        | próprio atendimento       | 401        | acesso por recurso       |
| email proposto | 403   | 403                    | dono da entrada concluída | 401        | destinatário server-side |
| webhook        | N/A   | N/A                    | N/A                       | sem sessão | assinatura provider      |

401 para token ausente/inválido/expirado/revogado/sessão invalidada/usuário inativo; middleware atual já valida revogação. 403 para papel sem permissão; ADMIN não é wildcard. 404 para recurso ausente/alheio no escopo médico, reduz enumeração. Para draft/email, role MEDICO não basta: validar Attendance.doctorId, vínculo da entrada e estado. Não usar GET /patients/{id} para email. No-store e logs sem token/CPF/email/PDF/conteúdo/secret. Nenhum erro de email/print reverte conclusão clínica.

## I. Impacto Prisma/PostgreSQL

| Mudança            | Entidade/constraint                                                                              |                                     Migration |
| ------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------: |
| Draft durável      | PrescriptionDraft; attendanceId unique/FK, version, text/JSONB, timestamps, updatedByUserId      |                                           Sim |
| Delivery/outbox    | relação Prescription/Attendance, idempotencyKey unique, status/attempts/providerMessageId unique |                                           Sim |
| Inbox webhook      | providerEventId unique, delivery FK e metadata mínimo                                            |      Sim se não houver estrutura reutilizável |
| Nomes de sintomas  | join EntrySymptom → Symptom                                                                      |                       Não se nome atual basta |
| Snapshot histórico | nameSnapshot no vínculo                                                                          | Sim se catálogo puder mudar e política exigir |

Reutilizar Attendance.entryId unique, Attendance.doctorId, Prescription.attendanceId unique, description TEXT, medications JSONB, notes, createdAt. Patient.email nullable. O enum PrescriptionEmailStatus já existe com PENDENTE/ENVIADO/FALHOU, mas fluxo não existe e complete mantém null. Não o tratar como envio nem como entrega comprovada.

Delivery deve ter índice de worker por status/nextAttemptAt, unique idempotency key, providerMessageId unique nullable, referência da Prescription e ator. Garantir apenas uma entrega ativa por prescrição por constraint parcial ou lock transacional. Não cascade-delete Prescription. Para worker, snapshot de email, se aprovado, cifrado e com retenção. Auditar metadados, não duplicar texto clínico. Expurgo de draft/email segundo política institucional. Migration deve ser versionada e testada em DB descartável; nenhuma migration foi executada nesta tarefa.

## J. Casos extremos

Códigos indicados como proposta precisam ser publicados em OpenAPI.

| Cenário                       | Operação                        |                     HTTP esperado | Backend                 | Frontend                     |
| ----------------------------- | ------------------------------- | --------------------------------: | ----------------------- | ---------------------------- |
| Entrada inexistente           | detail/draft/email/PDF          |                               404 | ENTRY_NOT_FOUND         | indisponível                 |
| Entrada de outro médico       | detail/draft/complete/email/PDF |                               404 | ocultar existência      | mensagem genérica            |
| Não iniciou                   | draft/complete                  |                               409 | sem write               | bloquear                     |
| Já concluiu                   | draft write                     |                      409 proposta | locked/removido         | abrir documento              |
| Sem Prescription              | PDF/email                       | PDF atual 404; email 409 proposto | não fabricar            | sem print/envio              |
| Draft stale                   | PUT/DELETE/complete             |                      412 proposto | sem mutação             | GET/conflito/review          |
| Dois médicos                  | draft/email                     |                               404 | owner Attendance        | sem vazamento                |
| Duas tabs mesma versão        | PUT                             |                  1 sucesso, 1 412 | lock/version            | atualizar sem sobrescrever   |
| Complete duplicado            | POST                            |           200 primeiro, 409 atual | uma Prescription        | GET concilia                 |
| Timeout após PUT commit       | PUT/GET                         |                           GET 200 | retorna versão          | comparar conteúdo            |
| Timeout pós-complete commit   | complete/detail                 |                           GET 200 | completed               | não reenviar                 |
| Complete e GET falham         | detail                          |                          rede/5xx | não presumir            | estado incerto               |
| Email ausente/não elegível    | email GET/POST                  |       200 inelegível/409 proposto | não envia               | complete não bloqueado       |
| Resend indisponível           | status/POST/worker              |            503 ou 202 enfileirado | retry limitado/outbox   | estado honesto               |
| Provider aceitou, sem entrega | status                          |                      200 accepted | aguardar evento         | não dizer entregue           |
| Delivered/bounce              | webhook/status                  |                      evento + GET | atualiza estado         | não afirma leitura           |
| Clique/retry duplicado        | POST email                      |                mesma operação/409 | dedupe                  | sem duplicar                 |
| Rate limit                    | draft/email                     |                               429 | Retry-After             | aguardar                     |
| Token revogado                | autenticadas                    |                               401 | middleware atual        | encerrar sessão              |
| Erro DB                       | read/write                      |                           500/503 | rollback, sem confirmar | erro explícito               |
| Falha status/webhook          | email                           |                           503/5xx | manter último status    | desconhecido, sem inferência |
| Webhook replay/fora de ordem  | webhook                         |                   204 após dedupe | inbox monotônico        | estado autoritativo          |

## K. Testes de aceite backend

### Draft e finalização

- Zod: draft parcial permitido, máximos corretos, 51 medicamentos/excessos/extras inválidos; Unicode, newline e literal <script> são texto.
- RBAC: dono MEDICO permitido; outro médico 404; recepção/Admin 403; token inválido/revogado 401.
- Estado: só EM_ATENDIMENTO; sem Attendance, médico inativo/inconsistente ou concluído sem writes.
- Novo login recupera draft correto; no-store; response sem dados desnecessários.
- Dois PUT com mesmo ETag: um sucesso e um 412. PUT × complete e DELETE × complete serializados.
- Timeout após commit reconciliado por GET. Complete concorrente mantém uma Prescription e rollback em falha.
- Lista meds vazia continua aceita e a transação inclui Prescription/status/finishedAt/delete draft.

### Sintomas e detail

- IDs e nomes vêm do mesmo join EntrySymptom.
- Duas entradas sintéticas isoladas, sintoma desativado, lista vazia e dados legados.
- Médico alheio 404; recepção conserva seu escopo.
- Atualizar DTO/OpenAPI strict/testes de contrato juntos.

### Email

- Adapter fake sem credenciais reais: secret ausente, timeout antes/depois de aceitar, 429, 5xx, bounce, replay/out-of-order webhook.
- Body rejeita destinatário/conteúdo; email ausente não bloqueia complete.
- Worker concorrente/duplo clique não duplica; accepted != delivered; failure não reverte completed.
- Testar assinatura raw, RBAC/ownership, token revogado, no PII em logs/response.

### Regressão/ambiente

Preservar `tests/integration/attendance.test.ts`, `entry.test.ts`, `queue.test.ts`, `clinic.test.ts`, `tests/entry-validator.test.ts` e `tests/docs-contract.test.ts`. Cobrir também PDF sem Prescription, ownership, no-store/nosniff. Nunca apontar testes mutáveis para Render/Aiven/DB compartilhado; usar fixtures sintéticas e banco descartável.

## L. Plano backend recomendado

| Ordem | Entrega                                                         | Dependência           | Risco/mitigação                |
| ----: | --------------------------------------------------------------- | --------------------- | ------------------------------ |
|     0 | Baseline e preservar fila/início/complete/PDF                   | nenhuma               | alto; congelar locks/transação |
|     1 | Política de nome de sintomas; estender detail/OpenAPI/tests     | decisão de rename     | baixo, read-only               |
|     2 | Retenção; migration + GET/PUT/DELETE draft, RBAC/ETag           | schema                | médio, concorrência            |
|     3 | If-Match em complete e consumo/deleção atomicamente             | etapa 2               | alto, regressão clínica        |
|     4 | Política de consentimento/destinatário/canal/retention e worker | decisão/infra         | alto privacidade               |
|     5 | Delivery/outbox, E1/E2, retries/rate limit e Resend server-side | etapa 4               | alto duplicidade               |
|     6 | Webhook E3 verificado/idempotente e estados separados           | etapa 5               | integridade status             |
|     7 | OpenAPI/migrations/testes/observabilidade sem PII               | etapas anteriores     | rollout compatível             |
|     8 | Integrar frontend após contrato implantado                      | API estável           | evitar requests prematuros     |
|     9 | Homologar issues individualmente                                | evidências integradas | #51 exige provider controlado  |

#48 pode preceder draft por ser read-only; #47 exige migration/concurrency; #51 deve esperar política. Não alterar gravidade externa, FIFO, enteredAt, chamada ou permissão de triagem.

## M. Checklist de handoff

- [ ] Contrato existente/proposto identificado.
- [ ] JWT, RBAC e autorização por recurso definidos.
- [ ] Zod, headers, JSON e erros definidos.
- [ ] Prisma/migration avaliados.
- [ ] Lock/version/ETag/idempotência definidos.
- [ ] Draft somente EM_ATENDIMENTO.
- [ ] Complete atômico e sem ressuscitar draft.
- [ ] Sintomas da mesma entrada; OpenAPI atualizado.
- [ ] Política de destinatário/canal email aprovada.
- [ ] Segredo Resend/webhook somente server-side.
- [ ] Outbox/worker/retry/rate limit/status auditável prontos.
- [ ] Testes unitários, integração, RBAC, propriedade e validação aprovados.
- [ ] Testes concorrência, timeout, dedupe e falhas externas aprovados.
- [ ] Regressão de fila/complete/PDF aprovada.
- [ ] Migrations ensaiadas em DB descartável.
- [ ] Frontend integrado após contrato publicado.
- [ ] E2E sintético e requests externos interceptados.
- [ ] Print/PDF inspecionados sem afirmar impressão física.
- [ ] Resend homologado antes de habilitar UI.
- [ ] Issues homologadas individualmente com evidências reais.

### Decisões pendentes

1. Symptom.name é imutável? Se não, exige snapshot histórico?
2. Patient.email basta ou requer verificação/consentimento/responsável legal?
3. Conteúdo aprovado é PDF anexo ou outro canal autorizado?
4. Deployment suporta worker durable/outbox?
5. Retenção de drafts, snapshot cifrado, deliveries e webhooks?
6. Quais falhas permitem retry/backoff e tentativa manual?
7. Timeout sem confirmação após janela do provider vira unknown/intervenção?
8. E1/E2 seguem a rota proposta ou convenção diferente?
9. Quando If-Match torna-se obrigatório no complete?
10. Webhook desconhecido/out-of-order recebe 2xx/quarentena ou retry?

## Referências

### Frontend no commit observado

- `src/integrations/DoctorWorkspace.tsx`: fila, início, validação, review, complete, conciliação e saída.
- `src/integrations/operational-api.ts`: Prescription/Medication/EntryDetail e chamadas principais.
- `src/integrations/extended-api.ts`: EntryHistory, histórico, active e PDF autenticado.
- `src/integrations/ClinicDataPages.tsx`: histórico/link pela entrada exata.
- `src/features/prescriptions/PrescriptionForm.tsx`, `PrescriptionDocument.tsx`, `model.ts` e CSS.
- `src/features/prescriptions/PrescriptionPreviewPage.tsx`: consulta confirmada, print/PDF e email indisponível.
- `src/features/prescriptions/draft-store.ts`: estado somente em memória.
- `src/App.tsx` e `src/auth/ProtectedArea.tsx`: rota protegida MEDICO.
- `e2e-local/prescription-week8.spec.ts`: testes interceptados, não provam backend/Resend.

### Backend local, somente leitura

- `src/routes/entry.routes.ts`, `queue.routes.ts`, `clinic.routes.ts`.
- `src/models/entry.model.ts`, `queue.model.ts`, `clinic.model.ts`.
- `src/services/entry.service.ts`, `queue.service.ts`, `clinic.service.ts`, `prescription-pdf.service.ts`.
- `src/services/password-reset.service.ts`: Resend somente para reset.
- `src/validators/entry.validator.ts`; `src/middlewares/authenticate.ts` e `authorize.ts`.
- `prisma/schema.prisma` e `src/docs/openapi.yaml`.
- `tests/integration/attendance.test.ts`, `entry.test.ts`, `queue.test.ts`, `clinic.test.ts` e `tests/docs-contract.test.ts`.
