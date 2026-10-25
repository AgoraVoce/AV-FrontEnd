# Restauração visual da recepção

Registro da restauração inicial. O fluxo de reavaliação e as classificações locais foram implementados depois; consulte [Reavaliação clínica](reception-reclassification.md) para o estado atual.

Referência adotada: branch `reception` (o pedido continha um placeholder de branch).
Arquivos consultados somente com `git ls-tree` e `git show`: `src/auth/reception/QueuePage.tsx`, `src/components/AppShell.tsx`, `src/styles/app.css`, `src/styles/tokens.generated.css`.

## Checklist

- [x] Tokens existentes coincidem com os da referência: Plus Jakarta Sans, primária #007b78, fundo #f6f9fb, borda #d5e3e8, raios 10/16px.
- [x] Conteúdo ocupa a largura disponível; sidebar de 220px, compacta entre 768–1279px e retrátil abaixo de 768px.
- [x] Header com marca, ambiente atual, marca central e usuário da sessão; logout e navegação preservados.
- [x] Breadcrumb, título, subtítulo e sincronização baseada na última resposta bem-sucedida.
- [x] Total real e estrutura dos três cards de risco com metas.
- [x] Busca por nome/senha, atualização manual, cadastro e atalho existente para pacientes.
- [x] Sete colunas, avatar de iniciais, senha em duas linhas, relógio, detalhes e placeholder de reavaliação com TODO.
- [x] Paginação local real com seis pacientes por página; retorna à primeira página ao filtrar.
- [x] Links inferiores e três cards informativos com os textos solicitados.
- [x] CSS do shell restrito à rota /recepcao; serviços, contratos, rotas, autenticação e condições de perfil preservados.

## Diferenças e limites

Não há equivalência visual exata em elementos que dependem de classificação: pílulas clínicas, cores por paciente, contagens, barra proporcional e ordenação por gravidade. Esses dados não estão no contrato da lista. A ordem retornada pelo backend foi preservada; senhas são opacas e não foram interpretadas como gravidade ou horário.

`GET /api/v1/queues/waiting`, consultado na implementação `getWaitingQueue` e nos testes de integração, fornece `entryId`, `fullName`, `queueCode`. Faltam idade/data de nascimento, queixa, classificação/severity e entrada/tempo de espera. Esses campos e as contagens de risco são apresentados como “—”; a barra fica neutra, sem proporções fictícias. Busca por queixa e filtros clínicos não podem funcionar com esse contrato. Os botões de filtro abrem as opções Todos/Com senha/Sem senha.

O contrato existente de `GET /api/v1/entries/:id` contém `patient.birthDate` (nullable), `severity`, `otherSymptoms` e `enteredAt`, usados no detalhe individual. Não foi adicionado fan-out de uma chamada por paciente a cada polling, preservando o carregamento da lista. Isso não significa que o backend inteiro não forneça os campos: a ausência é específica do endpoint de fila.

“Buscar pacientes” continua navegando para `/pacientes`, como antes. “Alterar prioridade” usa handler vazio com TODO; os textos institucionais são conteúdo solicitado e não representam implementação nova de auditoria, alerta sonoro ou sincronização de categorias.

## Validação

Lint e build (incluindo TypeScript) aprovados. Playwright com endpoints simulados para evitar gravação no backend de produção: fluxos de recepção, médico, administração, autenticação/logout; teste adicional de 1920, 1366, 1024, 768 e 390px, overflow da página, busca, paginação, menu mobile e polling de 30s. Capturas em `/tmp/reception-{largura}.png`.

Não foi validada disponibilidade da API real nem identidade pixel a pixel. A tabela permite scroll interno quando as sete colunas e os dois botões excedem o espaço disponível.
