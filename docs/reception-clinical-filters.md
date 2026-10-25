# Filtros clínicos da recepção

**Atualização:** a persistência local foi substituída pela API. Consulte [Integração de reavaliação](reception-api-integration.md) para o estado atual; os trechos de fallback abaixo registram a implementação anterior.

Implementados na rota /recepcao, sem mudanças em autenticação, perfis, outras telas ou backend.

- Idade: todas, 0–17, 18–59, 60+ e não informada.
- Espera: qualquer tempo, até 15, 16–30, 31–60, mais de 60 minutos e não informado.
- Gravidade/cor: todas, verde/tranquilo, amarelo/alerta, vermelho/urgente e não informada.
- Mantido o filtro com/sem senha. Todos se combinam com a busca por nome/senha/queixa, sem enviar consultas a cada seleção.
- Contador de filtros ativos e botão Limpar filtros. Alterar filtros/busca volta à primeira página; os filtros são preservados ao atualizar a fila.

## Dados reais e atualização

GET /api/v1/queues/waiting continua sendo a fonte da lista e da ordem de chegada usada pela tela. Como esse contrato ainda traz somente entryId/fullName/queueCode, o helper loadReceptionClinicalData consulta GET /api/v1/entries/:id, com até quatro chamadas simultâneas, AbortSignal e isolamento de falha por entrada.

Campos usados: patient.birthDate → idade civil em America/Sao_Paulo; enteredAt → minutos completos de espera, atualizados pelo relógio da tela; severity → classificação. A classificação local da reavaliação existente continua prevalecendo até a integração da escrita com a API. otherSymptoms preenche a queixa e passa a participar da busca.

Esses dados também preenchem idade, espera e gravidade na tabela/resumo, para que o usuário veja os valores usados pelo filtro. Dados ausentes ou inválidos permanecem “—”, não entram em faixas clínicas e são encontrados em Não informado. O total do resumo se refere à fila inteira, enquanto a paginação se refere ao resultado filtrado.

Polling de 30s e atualização manual renovam os detalhes. Durante o refresh, o snapshot anterior das entradas ainda presentes é mantido até a conclusão da nova consulta, evitando esvaziar os filtros. Falhas individuais mantêm os pacientes na lista e exibem um aviso para tentar novamente; após a conclusão, os dados que não puderam ser renovados ficam desconhecidos. Nenhum dado de paciente novo é inventado ou persistido por esse carregamento.

Limite: há uma chamada por entrada para os detalhes. A melhoria recomendada no backend continua sendo incluir birthDate, enteredAt, severity e otherSymptoms na resposta da fila (ou em um endpoint em lote) para substituir esse enriquecimento. Não foi aplicado fan-out irrestrito nem alteração de contrato de API existente.

## Validação

Lint, TypeScript/build e testes Playwright com API simulada: aniversários de 18/60 anos, data inválida/futura, fuso civil, filtros individuais e combinados, dados desconhecidos, busca por queixa, limpeza, avanço da faixa de espera, gravidade atualizada pelo polling e recuperação de falha parcial. Capturas em 1366/768/390px para inspeção visual e ausência de overflow horizontal da página. Regressões de reavaliação/LED, recepção, médico, administrativo e autenticação incluídas na suíte.
