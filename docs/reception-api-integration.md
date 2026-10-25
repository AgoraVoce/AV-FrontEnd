# Recepção: persistência de reavaliação na API

**Atualização:** a fila ampliada e o campo dedicado `justification` foram integrados e validados com o banco real. Consulte [Validação real da recepção](reception-real-validation.md) para versão, evidências, restauração do registro sintético e configuração local. Os contratos antigos descritos abaixo continuam suportados para compatibilidade.

Este documento substitui as descrições históricas de fallback local em reception-reclassification.md e reception-clinical-filters.md.

## Fluxo implementado

- A gravidade exibida vem exclusivamente dos detalhes retornados pelo servidor. A chave antiga `av:reception-reassessments:v1:<userId>` não é mais lida, escrita nem enviada para a API. Registros antigos locais não são migrados automaticamente para auditorias clínicas reais.
- O modal consulta GET /api/v1/entries/:id e permite alterar a descrição dos sintomas/queixa, a gravidade ou ambos. Mantém os symptomIds existentes por padrão. Quando houver sintomas estruturados, uma opção explícita permite removê-los e substituí-los pela descrição. O backend atual não expõe catálogo de sintomas: não há seleção de novos itens estruturados nem nomes inventados.
- Exige justificativa de 10–300 caracteres após trim, uma alteração efetiva e sintomas válidos. A descrição tem limite de 2000 caracteres. Mudança apenas de sintomas é permitida sem obrigar troca de gravidade.
- Antes de enviar, o service relê a entrada e verifica paciente, estado waiting, classificação, sintomas e updatedAt conhecido contra o snapshot aberto. Uma mudança detectada mantém o rascunho e pede reabertura para revisão.
- POST /api/v1/entries/:id/reassessments usa o contrato existente `{ severity, symptomIds, otherSymptoms, shortNote }`. A justificativa é enviada como shortNote, persistida como observationSnapshot. Autor, níveis anterior/novo e horários vêm da transação do servidor, não de campos enviados pela interface.
- A resposta 201 é validada antes do sucesso. Atualiza a linha com a gravidade/sintomas confirmados, fecha o modal, emite o LED e recarrega a fila e seus detalhes. Filtros continuam aplicados; o paciente pode sair do resultado filtrado se a nova gravidade não corresponder à seleção.
- Durante o envio, formulário e fechamento ficam bloqueados para evitar duplicação ou a impressão de que fechar desfez uma escrita em andamento. Erros de rede/API/409 não disparam sucesso/LED, não usam fallback local e preservam o rascunho. O backend continua responsável pela validação transacional do estado.
- A tabela agora inclui STATUS, usando o valor real do detalhe. Sem detalhes disponíveis, continua “—”.
- Ver detalhes contém histórico paginado via GET /api/v1/entries/:id/reassessments?page=N&pageSize=5. Mostra transição, justificativa, sintomas e horário. Mostra o nome da sessão quando o autor coincide; para outros autores, disponibiliza o ID real, pois o contrato não traz nomes profissionais. Falhas do histórico têm tentativa novamente independente do restante do detalhe.

## Limites confirmados no checkout inspecionado

O backend foi lido, não alterado. A rota de escrita/histórico existe em src/routes/clinic.routes.ts; validação e transação foram conferidas em src/validators/clinic.validator.ts e src/models/clinic.model.ts.

GET /queues/waiting continua selecionando e retornando somente entryId, fullName e queueCode em src/models/queue.model.ts e src/services/queue.service.ts. Portanto, a recepção mantém o enriquecimento existente de GET /entries/:id com concorrência máxima quatro. Não foi adotado um contrato ampliado inexistente no código. Incluir os campos na fila continua sendo uma otimização pendente do backend.

Sinais vitais e registro profissional não constam dos contratos de detalhe/sessão consumidos; sinais ficam “—” e responsável usa nome/perfil reais. O contrato POST ainda não aceita expectedVersion/previousSeverity nem chave de idempotência. A checagem de concorrência no front é preventiva, não uma garantia contra uma alteração na janela entre GET e POST; o servidor serializa as gravações e recusa pacientes fora da espera. Evoluir o contrato com versão/idempotência é uma melhoria recomendada.

## Validação

Lint, TypeScript e build. Playwright com API inteiramente simulada: payload estrito, auditoria e campos confirmados pelo servidor, leitura após reload, ausência de escrita local, prioridade local antiga ignorada, alteração de sintomas com/sem troca de cor, remoção explícita de sintomas estruturados, atualização de cores/ordem/resumo/LED, rascunho durante polling, falhas GET/POST e conflito, bloqueio de duplicação durante envio, teclado e larguras 1920/1366/768/390. Histórico com mais de uma página. Também foram executadas regressões de recepção, filtros, médico, administração e gestão clínica.

Não foram feitos cadastros, reavaliações ou outras gravações de teste no banco real, nem foi verificado o deploy remoto desses endpoints. Arquivos que já tinham alterações de outras tarefas, inclusive client compartilhado, rotas e configuração de testes, foram preservados.
