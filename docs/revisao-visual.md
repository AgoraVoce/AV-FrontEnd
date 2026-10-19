# Revisão visual automática — Chromium

A cada PR direcionada à `main`, o workflow `Frontend PR checks` executa os testes funcionais, abre as rotas do Agora Você com o Chromium e captura o resultado de **todas as telas navegáveis e estados operacionais principais** em duas larguras:

- **Desktop**: 1440 × 900.
- **Celular**: 390 × 844.
- **TV da demonstração**: captura adicional em 1920 × 1080.

O fluxo contempla login, recuperação de senha, recepção, cadastro, gestão de funcionários, consultório médico, relatórios, fila administrativa, transmissão pública, 404 e os formulários/modais da recepção e do médico.

## Onde visualizar os prints da PR

1. Abra a PR do `AV-FrontEnd` e clique na execução **Frontend PR checks**.
2. Abra o resumo da execução. O workflow publica um link **Abrir prints da revisão visual**.
3. Baixe o artifact **`revisao-visual-chromium-<PR>-<execução>`**.
4. Extraia o ZIP e abra `index.html` para ver a galeria visual completa, agrupada por modo e tela.
5. Cada imagem também possui uma versão PNG em tamanho integral, com nome estável, e a listagem está em `README.md`.

Se uma tela falhar nas verificações de layout, a captura é feita **antes de o teste falhar**; o artefato é enviado mesmo que o job termine vermelho. O histórico de artifacts permanece por 14 dias.

## Rodar localmente no Linux/macOS

```bash
npm ci
npx playwright install chromium
npm run test:visual:demo
npm run test:visual:api
npm run visual:report
```

Abra `artifacts/visual-review/index.html` no navegador. A pasta é ignorada pelo Git, para não versionar PNGs grandes a cada PR.

Execute os modos separadamente; cada um inicia o Vite com `VITE_AV_LOCAL_API` apropriado. Não mantenha outro Vite em `localhost:5173` com modo diferente durante esses testes (o CI usa uma instância limpa).

## Verificações automáticas

Cada teste:
- espera a tela renderizar, inclusive a fonte web;
- tira print de **página inteira** com caret e animações desativados;
- mede a largura real do documento e acusa overflow horizontal maior que 8 px;
- identifica imagens quebradas e erros JavaScript não tratados;
- anexa o print ao teste Playwright e escreve um arquivo JSON com rota, viewport e diagnóstico.

A galeria mostra explicitamente os alertas e permite clicar para ampliar. A execução é reprovada quando uma verificação automática falha.

## Checklist de revisão humana

Verifique os prints (especialmente mobile) antes de aprovar a PR:

- Espaçamento interno, margens, hierarquia visual, fontes e contrastes.
- Cards, tabelas, inputs, menus, botões e ícones sem cortes/sobreposições.
- Formulários de cadastro e prescrição: campos visíveis, agrupamento e títulos corretos.
- Diálogos de confirmação e fluxos irreversíveis sem botões escondidos.
- Estados de carregamento, vazios, erros e módulos indisponíveis explicativos.
- Painel TV legível, com identificação mínima e sem CPF ou dados clínicos.
- Consistência do menu lateral, cabeçalho e conteúdo entre desktop e celular.

**Importante:** "OK AUTOMÁTICO" significa apenas ausência de overflow, imagens quebradas e exceções JavaScript naquela captura. Não significa aprovação estética. Um humano ainda precisa inspecionar cores, tipografia e alinhamentos.

## Segurança e alcance

O modo de integração usa **respostas HTTP totalmente simuladas** para login, filas, funcionários, médicos, entrada e prescrição; o modo de demonstração utiliza dados fictícios já presentes no aplicativo. Não utilizamos o banco real nem credenciais da clínica. O JWT simulado nunca é uma credencial verdadeira.

Os screenshots de modo API registram a situação atual dos módulos ainda indisponíveis (TV, relatórios, recuperação de senha). Isso é esperado e não pode ser "escondido" por dados fictícios como se fossem reais.

A revisão por screenshots **não substitui** os testes E2E com PostgreSQL e a verificação clínica/autorização real do backend.
