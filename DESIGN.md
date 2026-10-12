---
{
  "version": "alpha",
  "name": "Agora Você",
  "description": "Acesso interno sereno e preciso para a equipe do pronto-socorro.",
  "colors": {
    "primary": "#007b78",
    "primary-hover": "#006561",
    "primary-active": "#00514e",
    "background": "#f6f9fb",
    "surface": "#ffffff",
    "brand-surface": "#eaf6f4",
    "text": "#142733",
    "muted": "#54657c",
    "border": "#d5e3e8",
    "danger": "#a52d38",
    "danger-surface": "#fff3f3",
    "scrollbar-thumb": "#859ba7",
    "scrollbar-hover": "#54657c",
    "scrollbar-active": "#142733"
  },
  "typography": {
    "body": {
      "fontFamily": "'Plus Jakarta Sans', system-ui, sans-serif"
    },
    "display": {
      "fontFamily": "'Plus Jakarta Sans', system-ui, sans-serif"
    }
  },
  "rounded": {
    "control": "10px",
    "panel": "16px"
  },
  "spacing": {
    "page-max": "1280px",
    "form-max": "540px",
    "field-gap": "16px"
  },
  "components": {
    "button": {
      "height": "54px",
      "backgroundColor": "{colors.primary}",
      "textColor": "{colors.surface}"
    },
    "field": {
      "height": "54px",
      "backgroundColor": "{colors.surface}",
      "textColor": "{colors.text}"
    },
    "feedback": {
      "backgroundColor": "{colors.danger-surface}",
      "textColor": "{colors.danger}"
    },
    "body": {
      "backgroundColor": "{colors.background}",
      "textColor": "{colors.text}"
    },
    "help": {
      "textColor": "{colors.muted}"
    },
    "button-hover": {
      "backgroundColor": "{colors.primary-hover}"
    },
    "button-active": {
      "backgroundColor": "{colors.primary-active}"
    },
    "divider": {
      "backgroundColor": "{colors.border}"
    },
    "scrollbar-thumb": {
      "backgroundColor": "{colors.scrollbar-thumb}"
    },
    "scrollbar-hover": {
      "backgroundColor": "{colors.scrollbar-hover}"
    },
    "scrollbar-active": {
      "backgroundColor": "{colors.scrollbar-active}"
    },
    "brand-panel": {
      "backgroundColor": "{colors.brand-surface}",
      "textColor": "{colors.text}"
    }
  }
}
---

# Agora Você Design System

## Overview

Uma interface calma para operadores de recepção, médicos e administração no Brasil, com entrada autenticada, fila operacional e transmissão pública. Idioma pt-BR. Uso em computador de trabalho, celular e monitores 16:9.

A referência são as três telas fornecidas e a logo original: painel duplo, verde petróleo, campos claros e tipografia com hierarquia. A assinatura é uma linha de pulso discreta que atravessa o rodapé do painel de marca; não representa dados clínicos. O formulário permanece familiar. Evitar estética de dashboard, números fictícios e afirmações de certificação, conformidade ou disponibilidade.

Este arquivo gera os tokens: frontmatter JSON (válido como YAML) → `scripts/generate-tokens.mjs` → `src/styles/tokens.generated.css` → `app.css` → componentes compartilhados. Não editar o CSS gerado. `npm run tokens:check` verifica deriva. As telas operacionais usam os mesmos papéis de cor; classificação clínica e feedback semântico permanecem separados.

## Colors

Primary é ação e seleção, nunca classificação clínica. Surface é branco verdadeiro, background é cinza frio e brand-surface é verde muito claro. Text e muted mantêm contraste em fundos claros. Danger identifica erros sempre acompanhados de texto. Focus usa primary com contorno de 3px. Não há tema escuro nesta entrega. Forced colors deixa cores e controles sob controle do sistema.

## Typography

Plus Jakarta Sans é hospedada localmente pelo pacote fontsource, pesos 400, 500, 600 e 700. Display usa peso 700 e espaçamento negativo; body/controles usam 400–600, 14–16px e entrelinha 1.5. Os papéis usam a mesma família para continuidade, sem segunda fonte ornamental. Headings se adaptam com clamp; nenhum texto essencial é truncado.

## Layout

Painel autenticado de até 1280px, proporção 48/52 entre marca e formulário. A fila usa tabela com rolagem horizontal somente no contêiner em telas estreitas. A transmissão TV usa rota standalone, sem shell administrativo, com composição responsiva para 1366, 1920 e 4K. Abaixo de 900px, formulários vão para uma coluna; abaixo de 480px, bordas externas e padding diminuem. Documento é o proprietário da rolagem vertical, exceto a lista popup autorada. Campos, Select e botões têm pelo menos 48–52px de altura.

## Elevation & Depth

Um único cartão com borda suave; sombra curta e discreta. Não empilhar cartões sem necessidade. Área autenticada usa cabeçalho simples; a TV pública não herda sidebar nem cabeçalho administrativo.

## Shapes

Controles usam control; container usa panel. Ícones Lucide com traços 1.7–2px. Logo PNG original é utilizada sem redesenho.

## Components

AuthLayout, PasswordField, ErrorToast, Brand, Feedback, Select e Spinner são compartilhados. Recuperação usa a mesma composição, três etapas sem navegação livre, código numérico, reenvio com espera e confirmação de senha. LoginPage oferece um único formulário de e-mail e senha, independente de perfil ou query string. Botões possuem hover, active, focus-visible e disabled. Loading conserva geometria. Login mantém toast persistente para erros de autenticação, enquanto a falha de restauração usa feedback inline com role alert e nova tentativa; credenciais inválidas usam campos em danger/danger-surface. Entrar desabilita quando faltar e-mail ou senha. Toast superior direito usa --z-toast: 900, safe-area e largura limitada ao viewport, sem mover o formulário. A fila usa Select/Listbox autorado com portal, colisão, Escape, Enter, setas e typeahead; filtros combinam busca textual, prioridade, idade e espera derivada de arrivedAt. Feedback de operações usa tons semânticos: sucesso verde, erro vermelho, aviso âmbar e reversão neutra. A API/estado operacional determina o painel público; sem status `called`, não há chamada exibida. Reveal tem nome alternado e aria-pressed.

Motion: somente transições de cor de 150ms e spinner durante requisição; prefers-reduced-motion elimina rotação e transições. A linha de pulso é estática. Scrollbars globais têm thumb, track, hover, active e fallback WebKit, sem opt-in por componente.

## Do's and Don'ts

- Usar a logo anexada e os tokens gerados.
- Manter um único login para todos os perfis, com campos editáveis durante a verificação de sessão e após falha de restauração.
- Não exibir dados reais ou fictícios de pacientes no login.
- Recuperação de senha foi autorizada em solicitação posterior à issue original. Não adicionar MFA, lembrar acesso ou funcionalidades clínicas.
- Não inventar senha chamada, consultório, profissional ou previsão na transmissão. Simulação local, quando usada em desenvolvimento, deve ser explicitamente identificada.
