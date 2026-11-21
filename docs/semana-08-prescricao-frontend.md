# Semana 08 — integração da prescrição

Escopo desta entrega: integração do frontend AgoraVocê com as APIs presentes no `main` do AV-Backend, preservando os fluxos de fila clínica e documento já existentes. Issues de origem no AV-Documents: [#47](https://github.com/AgoraVoce/AV-Documents/issues/47), [#48](https://github.com/AgoraVoce/AV-Documents/issues/48), [#49](https://github.com/AgoraVoce/AV-Documents/issues/49) e [#50](https://github.com/AgoraVoce/AV-Documents/issues/50), [#51](https://github.com/AgoraVoce/AV-Documents/issues/51). Nenhuma issue foi fechada.

## Implementado no frontend

- Cliente HTTP compatível com os consumidores atuais e capaz de enviar `PUT`, cabeçalhos condicionais e sinal de cancelamento; lê status/ETag, trata JSON/204, timeout, erro estruturado e `Retry-After`. Todas as chamadas clínicas usam `cache: no-store`, credenciais omitidas e Bearer mantido só em memória.
- Rascunho remoto restaurado por médico e `entryId`, incluindo após reload e novo login. Autosave com debounce de 700 ms, fila serial, ETag (`If-None-Match: *` para criar; `If-Match` para substituir), estado de salvamento real e recuperação de resultado incerto via GET. Texto permanece em memória durante falhas; não é persistido em `localStorage` ou `sessionStorage`.
- Edição feita enquanto um PUT está em andamento permanece pendente e só aparece como salva após sua própria gravação confirmada. Um GET atrasado não substitui uma edição iniciada durante a consulta. `412` preserva o conteúdo local e bloqueia escrita/finalização até o médico carregar a versão do servidor; `428` é exibido como erro de precondição. Navegar não apaga draft remoto. O descarte remoto exige ação explícita com confirmação e `If-Match`.
- Revisão/finalização só é habilitada para o conteúdo integralmente salvo. `POST /complete` recebe o ETag atual. Em conflito, o conteúdo é mantido; em timeout, o estado de `/entries/{id}` é consultado e não ocorre retry cego. Após conclusão confirmada, o estado local daquela entrada é removido.
- `entry.symptoms` do detalhe autorizado é a fonte prioritária em atendimento, revisão e documento final; o cache transitório da fila é fallback somente quando o campo não veio. Queixa livre (`otherSymptoms`) e observação (`shortNote`) continuam visíveis. O documento é construído para a entrada exata, sem cruzar visitas do mesmo paciente.
- O Gmail API é o provedor configurado no backend para recuperação de senha e prescrições. O frontend consulta GET de capacidade/status; após consentimento, consulta novamente e só envia se o servidor continuar reportando `supported=true` e `eligible=true`, sem entrega anterior ainda ativa. O diálogo exige confirmação explícita e não mostra nem aceita destinatário. O POST contém `{}`, `Idempotency-Key` e `X-Patient-Consent: confirmed`; HTTP 202 confirma registro no fluxo, não entrega.
- Estados de e-mail são isolados por médico e entrada. Respostas de consultas antigas são ignoradas. Timeout/resultado incerto não dispara novo POST; a chave permanece em memória durante a reconciliação. `queued` e `processing` são atualizados no máximo três vezes por entrega, em intervalos de 60 s quando a aba está visível ou ao voltar o foco; após isso há atualização manual. `accepted` não inicia polling porque o Gmail deste fluxo não confirma entrega. `delivered` e `delivery_delayed` só são exibidos quando constam no estado retornado pelo servidor, inclusive compatibilidade com registros históricos.
- PDF autenticado, pré-visualização, impressão A4 multipágina, confirmação de conclusão e proteção de impressão sem prescrição persistida foram preservados. O diálogo usa foco modal do navegador, pode ser operado por teclado e respeita `prefers-reduced-motion`.

## Endpoints consumidos

| Método e caminho                                 | Uso                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `GET /api/v1/entries/{id}`                       | Detalhe, sintomas estruturados e reconciliação da finalização          |
| `GET /api/v1/entries/{id}/prescription-draft`    | Recuperar draft/ETag                                                   |
| `PUT /api/v1/entries/{id}/prescription-draft`    | Criar/atualizar com precondição e payload estrito                      |
| `DELETE /api/v1/entries/{id}/prescription-draft` | Descarte explícito, com `If-Match` quando há draft                     |
| `POST /api/v1/entries/{id}/complete`             | Finalizar atomicamente com o ETag salvo                                |
| `GET /api/v1/entries/{id}/prescription-email`    | Capacidade, elegibilidade e status real                                |
| `POST /api/v1/entries/{id}/prescription-email`   | Solicitar envio consentido/idempotente; HTTP 202 não significa entrega |
| `GET /api/v1/entries/{id}/prescription.pdf`      | PDF autenticado existente, sem alteração                               |

O worker `prescription-email:worker` é executado pelo backend e não é chamado pelo browser. O backend monta e envia a mensagem/anexo usando as credenciais OAuth do Gmail no servidor. A API do Gmail confirma aceitação, não entrega ao destinatário. O webhook `/api/v1/webhooks/resend` é legado/backend-only e não é chamado pelo browser. Nenhum código, migration, worker ou credencial do backend foi alterado.

## Segurança e regras clínicas

- A ordem da fila e a chamada permanecem no endpoint transacional do servidor. Abrir detalhes não chama paciente; recepção não chama fila clínica; gravidade continua sendo triagem externa.
- Finalização e prescrição permanecem atômicas no backend. PDF/print só aparecem após prescrição autorizada e atendimento concluído. E-mail não desfaz conclusão.
- Não foi criado papel PACIENTE nem qualquer confusão entre fila clínica e tickets administrativos. Não há dados clínicos em storage persistente, URL ou logs do frontend.
- **Histórico de segredo:** a branch histórica `feat/semana-08-prescricoes` teve arquivos `.env.local.backup.*` removidos por commit posterior. Essa remoção não elimina blobs do histórico Git. Não usamos essa branch, não copiamos nem inspecionamos conteúdo dos backups, não reescrevemos histórico e não fizemos force push. Se uma revisão controlada identificar credenciais nesses blobs, rotacioná-las e tratar saneamento do histórico em tarefa separada.

## Verificação do contrato e deploy

`AV-Backend` `main` foi reconfirmado no commit `9cb83f504b1e16d1460907e4436958dcdba4586e` (PR #13 incorpora o Gmail provider). O controller declara `supported` com base em `PRESCRIPTION_EMAIL_ENABLED=true` e presença das quatro variáveis OAuth no servidor; isso não valida os tokens OAuth nem prova que o worker está ativo. A flag tem default `false`. A documentação de configuração do backend explica a execução supervisionada de `prescription-email:worker`; um serviço web gratuito que dorme não garante processamento contínuo.

Em 21/11/2026, uma consulta somente leitura a `https://av-backend-rlc1.onrender.com/api-docs/openapi.json` retornou OpenAPI 3.0.3 (versão 0.1.0) e anunciou os métodos `GET` e `POST` de `/api/v1/entries/{id}/prescription-email`. Isso comprova apenas que o contrato está publicado nesse endereço. Não confirma configuração OAuth, validade das credenciais, flag habilitada, worker processando a fila, aceitação do Gmail ou entrega. Esta revisão não leu arquivos `.env`, não consultou segredos, não alterou banco/infraestrutura e não solicitou envios reais.

## Testes e limitações

Testes da interface usam interceptação explícita, fixtures sintéticas e bloqueio de origem externa. Não chamam Gmail, Render, Aiven ou Resend. A configuração local usa Vite em `127.0.0.1:5182`, `VITE_AV_LOCAL_API=true`; `vite.config.ts` define fallback de proxy em `127.0.0.1:3000`, mas a suíte intercepta as requisições `/api/v1/*`. Não há `.env.local` na cópia de execução. `npm ci` foi feito com scripts de instalação desativados.

Resultados executados nesta branch:

- `npm test -- --workers=1`: 134 testes passaram.
- `npm run test:local-api -- --workers=1`: 106 testes passaram usando mocks explícitos da API. Depois, `npm run test:local-api -- --workers=1 e2e-local/prescription-week8.spec.ts`: 45/45 testes focados da Semana 08 passaram, incluindo o cenário de timeout do POST Gmail.
- `npm run test:visual:demo -- --workers=1`: 29 passaram e 1 cenário de TV em viewport móvel foi ignorado conforme previsto.
- `npm run test:visual:api -- --workers=1`: 60 verificações passaram; as telas de atendimento, revisão e prescrição não tiveram overflow externo nem erros de página em desktop/mobile.
- `npm run lint`, `npm run build`, `npm run tokens:check`, `npm run design:lint` e a verificação Prettier dos arquivos alterados passaram. Design lint reportou zero erros, zero avisos e uma nota informativa.
- `npm run visual:report`: 89 capturas geradas, com 9 alertas de rolagem horizontal interna em módulos do modo demo e na fila de recepção API mobile. A rolagem da recepção API é intencional para a tabela; os fluxos clínicos desta entrega tiveram overflow externo igual a zero. Esses avisos não foram tratados como falhas de renderização nem alterados fora do escopo.

As suítes usaram Chromium e dados sintéticos. A suíte visual de demonstração passou com 29 testes e ignorou um cenário de TV móvel conforme previsto. Os testes de tela imprimiram overflow externo de 0 px; rolagens internas observadas em tabelas e painéis responsivos são locais aos componentes. Durante a suíte geral, o proxy de autenticação demo registrou avisos não fatais de `ECONNREFUSED 127.0.0.1:3001` para `/auth/me`; os testes terminaram com sucesso. Estes testes não homologam deployment, migration, worker, OAuth/Gmail nem impressão física.

## Pendências reais para homologação

1. Confirmar a migration de entregas e a versão da API no ambiente-alvo, sem aplicar migrations compartilhadas nesta tarefa.
2. Confirmar privadamente as credenciais OAuth Gmail e a flag `PRESCRIPTION_EMAIL_ENABLED` no backend; nenhum valor de segredo deve ser compartilhado com o frontend.
3. Garantir que `prescription-email:worker` execute sob supervisão contínua e homologar a fila com destinatário de teste autorizado e dados sintéticos. Esta revisão não iniciou o worker nem enviou e-mail.
4. `accepted` confirma resposta positiva do Gmail API, não recebimento pelo paciente. O frontend não afirma entrega sem estado do servidor que a confirme.
5. Conferir os checks e artefatos visuais do GitHub Actions depois de abrir o PR; impressão física depende do navegador/dispositivo.
