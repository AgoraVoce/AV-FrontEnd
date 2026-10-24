# Recepção: reavaliação clínica

## Escopo e checklist visual

- [x] Barra: Atualizar fila → Filtrar → Buscar pacientes → Cadastrar Paciente. Busca usa Search e o mesmo estilo computado de Filtrar, sem sublinhado, mantendo /pacientes. Só o input cresce; ações quebram para baixo no mobile.
- [x] Overlay rgba(15,23,42,.55) acima de header/sidebar, sem blur; linha selecionada destacada e botão sólido “Alterando...” com lápis.
- [x] Modal branco, 480px no máximo, margem mínima 16px, raio 14px, scroll interno e tokens atuais.
- [x] Rótulo clínico, título, paciente real e senha, três níveis em radiogroup, seleção com borda/check, sinais vitais, justificativa/contador, responsável e rodapé.
- [x] Níveis em três colunas; empilham abaixo de 360px. Nome/senha longos não extrapolam o card.
- [x] Nenhum nível é presumido: o detalhe preenche a classificação conhecida; enquanto carrega é possível explorar as opções, mas salvar exige detalhe disponível.
- [x] Justificativa de 10–300 caracteres após trim; erro ao sair do campo ou tentar salvar, estado de envio e erros sem perda do rascunho.
- [x] X, Cancelar, ESC e overlay fecham; body bloqueado, fundo inert, foco inicial no primeiro card, trap de Tab/Shift+Tab e retorno ao botão por ID. Uma requisição pendente é abortada ao fechar.
- [x] Polling de 30s não altera rascunho nem apaga classificações locais. Saída da fila bloqueia o envio. O service revalida status/paciente imediatamente antes de persistir.
- [x] Cores, pílula, resumo e proporções calculados apenas das classificações conhecidas; nenhuma classificação mantém “—”. Ordem Urgente > Alerta > Tranquilo > desconhecido; sort estável preserva a ordem atual da fila dentro de cada grupo.
- [x] Serviços novos restritos à recepção, sem alterar autenticação, rotas, perfis, outras telas ou o backend.

Não houve novo anexo visual do frame “05 · Recepção — Reavaliação” neste turno. O modal segue a descrição fornecida; não foi comprovada equivalência pixel a pixel com o Figma. Há uma nota adicional explícita sobre persistência local.

## Inspeção dos contratos reais

Backend acessível em `../AV-Backend`, consultado somente para leitura:

- `src/routes/entry.routes.ts`: POST /entries, GET /entries/:id, PATCH doctor/status, POST complete. Não há rota de reavaliação.
- `prisma/schema.prisma`: existe o modelo Reassessment, sem controller/service/rota de escrita de reavaliação exposta em src.
- `src/services/queue.service.ts` e `src/models/queue.model.ts`: fila geral traz entryId, fullName e queueCode. Classificação só no detalhe e na fila médica.
- Front `operations.entry`, GET /api/v1/entries/:id: patientId, severity, status e dados da entrada; sem PA/FC/SpO2/temperatura. Todos os sinais vitais ficam “—”; não se infere valores.
- Sessão normalizada `src/auth/types.ts`: id, name, login, role; sem CRM/COREN. Responsável usa nome e perfil reais, sem registro inventado.

## Fallback autorizado

`src/integrations/priority-store.ts` expõe `updatePatientPriority(patientId, input)` e um store externo via useSyncExternalStore, padrão já usado pelo projeto. Chave `av:reception-reassessments:v1:<userId>` no localStorage. Cada auditoria contém ID único, patientId, entryId, nível anterior/novo, justificativa, responsável (id/nome/perfil) e ISO date/time. Uma entrada futura do mesmo paciente não herda o override da visita anterior. O último registro por entrada define o nível local. É persistido entre reloads, reage a alterações de armazenamento em outra aba e não é sobrescrito pelo polling. Falha no armazenamento é exibida sem sucesso falso.

Essa alteração não muda a fila central, a TV ou outros dispositivos/usuários. A tela informa que é local. Horário/responsável e histórico local não têm garantia de auditoria do servidor. O TODO do service indica o ponto exato de substituição; nunca se tenta um endpoint hipotético nem se usa fallback silencioso após erro de escrita em API.

## Contrato que falta no backend (proposta, ainda não implementada)

1. `POST /api/v1/entries/:entryId/reassessments`, autenticado/autorizado para reavaliação. Corpo `{ patientId, previousSeverity, newSeverity, reason }`, gravidades VERMELHO/AMARELO/VERDE; reason com trim de 10–300 caracteres. previousSeverity permite detectar edição concorrente. Derivar responsável da sessão e horário do servidor, sem confiar em nome/registro/data enviados pelo navegador.
2. Resposta 201 `{ id, entryId, patientId, previousSeverity, newSeverity, reason, responsible: { id, name, role, professionalRegistration? }, occurredAt }`. Salvar auditoria e classificação da entrada atomicamente. Validar que paciente corresponde à entrada e que ainda aguarda; retornar 409 em mudança de estado/classificação, 400 por corpo inválido e 401/403 para acesso indevido. Considerar uma chave de idempotência para repetição após timeout.
3. `GET /api/v1/queues/waiting`: incluir `patientId`, `severity` (nullable se desconhecida), `enteredAt` e preferencialmente `updatedAt`/versão da classificação por item, além de entryId/fullName/queueCode. Isso permite eliminar overrides locais, calcular todos os contadores e sincronizar todos os clientes sem uma requisição por linha.
4. `GET /api/v1/entries/:id`: incluir sinais vitais reais e unidades (ex.: `vitals: { bloodPressure, heartRate, spo2, temperature }`, cada campo nullable). Se registro profissional existir, expô-lo no contrato normalizado da sessão. Essa extensão deve ser implementada e validada explicitamente antes de o front a consumir.

## Verificação

Lint, TypeScript e build. Testes Playwright com toda a API simulada: regressões de recepção/médico/admin/autenticação; ordem e estilo computado dos botões; fechamento e retorno de foco; rádio por setas e trap de teclado; justificativa; sucesso/auditoria/reordenação/resumo; erro na API de detalhes e no localStorage; polling durante rascunho; paciente fora da fila; persistência após reload; capturas em 1920, 1366, 768 e 390px (`/tmp/reclassification-{largura}.png`) com inspeção visual em desktop/mobile.

Não houve escrita no backend real nem comparação visual automatizada com um frame Figma indisponível.
