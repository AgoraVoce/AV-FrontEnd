# Recepção: validação com a API real — 24/10/2026

## Resultado

Fluxo real validado no navegador e no PostgreSQL configurado pelo backend, exclusivamente no registro sintético `FRONT-033d9a92-4`. Nenhum paciente ou usuário novo foi criado. Os valores clínicos originais foram restaurados ao fim do teste.

- Login HTTP 200 e fila HTTP 200.
- Fila ampliada com `gravidade`, `status`, `horarioEntrada` e `queixa`, além dos campos e aliases anteriores.
- Reavaliação pelo modal, POST real HTTP 201, mudança de Vermelho para Amarelo e alteração identificada da descrição sintética.
- Justificativa persistida em `justification`; observação operacional anterior preservada em `shortNote`/`observationSnapshot`.
- Estado confirmado por GET da entrada e da fila, com horário original de chegada preservado.
- Linha, pílula e LED confirmados na interface.
- Justificativa confirmada no histórico exibido pela interface.
- Estado persistiu após recarregar, efetuar novo login e abrir uma sessão independente de navegador, sem usar localStorage como fonte. As sessões independentes usaram a mesma conta autorizada; não foi utilizada a credencial de outro profissional.
- Restauração pelo modal confirmada no banco, mantendo gravidade, queixa, sintomas, observação e horário originais.
- Histórico passou de 0 para 2 registros; ambos mantidos, identificados como validação e restauração. Não foram apagadas auditorias.

Identificador da execução: `a42d393c-df76-4a09-bec3-18ca4cecadfb`.
Auditoria da validação: `a7df476e-feca-4a26-a485-6e389940d0f7`.
Auditoria da restauração: `aabc4188-20a9-42b7-91f0-a5bf904b6e7c`.

## Versão do backend utilizada

A ampliação foi localizada em `origin/feat/queue-waiting-reassessments`, commit `25962c7`. A branch `main` do backend ainda não contém esse commit. Nenhuma branch foi trocada e nenhum merge/push foi feito. O checkout de validação foi criado separadamente em `/tmp/av-backend-reception-validation`, com dependências reutilizadas do backend existente e cliente Prisma gerado nesse checkout.

A migration `20261024120000_add_reassessment_justification` estava pendente e foi aplicada após aprovação: adiciona somente a coluna nullable `justification` na tabela `reassessments`.

O backend ampliado está em `http://127.0.0.1:27366`. O proxy do front em `.env` foi atualizado para essa porta, preservando as outras configurações. Foi reconfirmado por leitura que a tela habitual `http://127.0.0.1:5173/login` autentica e recebe a resposta ampliada. O backend anterior na porta 27365 não foi interrompido.

Para reiniciar essa versão local se o processo parar:

```bash
cd /tmp/av-backend-reception-validation
PORT=27366 npm run dev
```

O checkout está em /tmp e é um ambiente local de validação, não um deploy permanente. O grupo ainda deve incorporar/publicar a branch ampliada no ambiente oficial pelo fluxo habitual. Não foi realizado nem verificado o deploy no Render.

## Integração do front

`reception-waiting.ts` normaliza o contrato real ampliado e verifica sua consistência. A gravidade, o estado, a queixa agregada e a chegada vêm da fila, inclusive se um detalhe falhar. Idade ainda usa os detalhes porque a resposta ampliada não inclui data de nascimento. Os detalhes também continuam sendo consultados ao abrir a reavaliação para preservar corretamente patientId, symptomIds, shortNote e verificar o snapshot atual.

A capacidade ampliada detectada na resposta determina o contrato de escrita: o novo POST envia `justification` separadamente e preserva `shortNote`; servidores antigos continuam usando o contrato anterior. Não há repetição automática de POST com outro payload nem fallback de gravação local. O histórico prioriza justification, mantendo compatibilidade com registros anteriores que só têm observationSnapshot.

Sinais vitais continuam “—” por ausência no contrato. Não existe catálogo HTTP para escolher novos sintomas estruturados; a descrição é editável e sintomas existentes podem ser mantidos ou substituídos explicitamente. Esses campos não foram inventados.
