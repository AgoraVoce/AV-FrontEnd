# Semana 08 — integração da prescrição

Escopo desta entrega: integração do frontend AgoraVocê com as APIs presentes no `main` do AV-Backend, preservando os fluxos de fila clínica e documento já existentes. Issues de origem no AV-Documents: [#47](https://github.com/AgoraVoce/AV-Documents/issues/47), [#48](https://github.com/AgoraVoce/AV-Documents/issues/48), [#49](https://github.com/AgoraVoce/AV-Documents/issues/49) e [#50](https://github.com/AgoraVoce/AV-Documents/issues/50), [#51](https://github.com/AgoraVoce/AV-Documents/issues/51). Nenhuma issue foi fechada.

## Implementado no frontend

- Cliente HTTP compatível com os consumidores atuais e capaz de enviar `PUT`, cabeçalhos condicionais e sinal de cancelamento; lê status/ETag, trata JSON/204, timeout, erro estruturado e `Retry-After`. Todas as chamadas clínicas usam `cache: no-store`, credenciais omitidas e Bearer mantido só em memória.
- Rascunho remoto restaurado por médico e `entryId`, incluindo após reload e novo login. Autosave com debounce de 700 ms, fila serial, ETag (`If-None-Match: *` para criar; `If-Match` para substituir), estado de salvamento real e recuperação de resultado incerto via GET. Texto permanece em memória durante falhas; não é persistido em `localStorage` ou `sessionStorage`.
- Edição feita enquanto um PUT está em andamento permanece pendente e só aparece como salva após sua própria gravação confirmada. Um GET atrasado não substitui uma edição iniciada durante a consulta. `412` preserva o conteúdo local e bloqueia escrita/finalização até o médico carregar a versão do servidor; `428` é exibido como erro de precondição. Navegar não apaga draft remoto. O descarte remoto exige ação explícita com confirmação e `If-Match`.
- Revisão/finalização só é habilitada para o conteúdo integralmente salvo. `POST /complete` recebe o ETag atual. Em conflito, o conteúdo é mantido; em timeout, o estado de `/entries/{id}` é consultado e não ocorre retry cego. Após conclusão confirmada, o estado local daquela entrada é removido.
- `entry.symptoms` do detalhe autorizado é a fonte prioritária em atendimento, revisão e documento final; o cache transitório da fila é fallback somente quando o campo não veio. Queixa livre (`otherSymptoms`) e observação (`shortNote`) continuam visíveis. O documento é construído para a entrada exata, sem cruzar visitas do mesmo paciente.
- GET de capacidade/status e POST de solicitação de e-mail integrados. A ação só é habilitada com `supported` e `eligible`; o diálogo nativo exige confirmação explícita de consentimento. Cada operação recebe `Idempotency-Key`, `X-Patient-Consent: confirmed` e body `{}`. Timeout/resultado incerto bloqueia novo envio automático, mantém a mesma chave em memória e oferece consulta de status. `accepted` não é apresentado como entregue; status consulta-se sob demanda, ao voltar à aba e a cada 60 s enquanto pendente. Destinatário nunca vem do frontend.
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

O webhook `/api/v1/webhooks/resend` é backend-only e não é chamado pelo browser. Nenhum código, migration, worker, credencial ou configuração de Resend foi alterado.

## Segurança e regras clínicas

- A ordem da fila e a chamada permanecem no endpoint transacional do servidor. Abrir detalhes não chama paciente; recepção não chama fila clínica; gravidade continua sendo triagem externa.
- Finalização e prescrição permanecem atômicas no backend. PDF/print só aparecem após prescrição autorizada e atendimento concluído. E-mail não desfaz conclusão.
- Não foi criado papel PACIENTE nem qualquer confusão entre fila clínica e tickets administrativos. Não há dados clínicos em storage persistente, URL ou logs do frontend.
- **Histórico de segredo:** a branch histórica `feat/semana-08-prescricoes` teve arquivos `.env.local.backup.*` removidos por commit posterior. Essa remoção não elimina blobs do histórico Git. Não usamos essa branch, não copiamos nem inspecionamos conteúdo dos backups, não reescrevemos histórico e não fizemos force push. Se uma revisão controlada identificar credenciais nesses blobs, rotacioná-las e tratar saneamento do histórico em tarefa separada.

## Verificação do contrato e deploy

`AV-Backend` `main` foi reconfirmado no commit `4eb62865e26aad49af2046086f14197be64e354e`; `src/docs/openapi.yaml` e as rotas/controllers locais declaram os contratos descritos acima. Em 20/11/2026, uma consulta GET somente leitura ao OpenAPI publicado pelo serviço (`/api-docs/openapi.json`, versão 0.1.0) também listou detalhe, finalização, draft `GET/PUT/DELETE` e e-mail `GET/POST`. Isso confirma os caminhos anunciados pelo serviço, **não** confirma a migration `20261119120000_prescription_drafts` no banco, o estado operacional do worker nem habilitação do envio. Esta tarefa não alterou banco compartilhado, não executou migrations e não enviou e-mail real. O envio depende da homologação do worker/provedor e de `PRESCRIPTION_EMAIL_ENABLED` permanecer desligado até autorização operacional.

## Testes e limitações

Testes da interface usam interceptação explícita para toda requisição da API, fixture sintética, bloqueio de origem externa e nenhuma chamada a Render, Aiven ou Resend. A configuração local usa Vite em `127.0.0.1:5182`, `VITE_AV_LOCAL_API=true`; `vite.config.ts` define fallback de proxy em `127.0.0.1:3000`, mas a suíte intercepta as requisições `/api/v1/*`. Não há `.env.local` na cópia de execução. `npm ci` foi feito com scripts de instalação desativados.

Resultados executados nesta branch:

- `npm test -- --workers=1`: 134 testes passaram.
- `npm run test:local-api -- --workers=1`: 95 testes passaram usando mocks explícitos da API.
- `npm run test:visual:demo -- --workers=1`: 29 passaram e 1 cenário de TV em viewport móvel foi ignorado conforme previsto.
- `npm run test:visual:api -- --workers=1`: 60 verificações passaram; as telas de atendimento, revisão e prescrição não tiveram overflow externo nem erros de página em desktop/mobile.
- `npm run lint`, `npm run build`, `npm run tokens:check`, `npm run design:lint` e a verificação Prettier dos arquivos alterados passaram. Design lint reportou zero erros, zero avisos e uma nota informativa.
- `npm run visual:report`: 89 capturas geradas, com 9 alertas de rolagem horizontal interna em módulos do modo demo e na fila de recepção API mobile. A rolagem da recepção API é intencional para a tabela; os fluxos clínicos desta entrega tiveram overflow externo igual a zero. Esses avisos não foram tratados como falhas de renderização nem alterados fora do escopo.

As suítes usaram Chromium e dados sintéticos. Os testes locais interceptaram explicitamente as chamadas da API e bloquearam tráfego externo; não chamaram Render, Aiven ou Resend. Durante a suíte geral, o proxy de autenticação demo registrou avisos não fatais de `ECONNREFUSED 127.0.0.1:3001` para `/auth/me`; os testes terminaram com sucesso. Os checks do GitHub Actions serão consultados depois do push. Não se deve interpretar estes testes como homologação de implantação, migration, worker, provedor ou impressão física.

## Pendências reais para homologação

1. Confirmar no ambiente-alvo a versão implantada da API/OpenAPI e as migrations exigidas pelo backend, sem aplicar migration compartilhada como parte deste PR.
2. Homologar o worker/outbox, webhook assinado e estados do Resend em ambiente seguro; manter a integração desabilitada até aprovação. Nenhum envio real foi feito.
3. Revisar o artifact visual do GitHub Actions após CI; impressão física depende do navegador/dispositivo.
