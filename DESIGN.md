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

Uma porta de entrada calma para operadores de recepção, médicos e administração no Brasil. A tarefa é entrar com credenciais internas, sem distrações clínicas. Idioma pt-BR. Uso em computador de trabalho e celular.

A referência são as três telas fornecidas e a logo original: painel duplo, verde petróleo, campos claros e tipografia com hierarquia. A assinatura é uma linha de pulso discreta que atravessa o rodapé do painel de marca; não representa dados clínicos. O formulário permanece familiar. Evitar estética de dashboard, números fictícios e afirmações de certificação, conformidade ou disponibilidade.

Este arquivo gera os tokens: frontmatter JSON (válido como YAML) → `scripts/generate-tokens.mjs` → `src/styles/tokens.generated.css` → `app.css` → componentes compartilhados. Não editar o CSS gerado. `npm run tokens:check` verifica deriva.

## Colors

Primary é ação e seleção, nunca classificação clínica. Surface é branco verdadeiro, background é cinza frio e brand-surface é verde muito claro. Text e muted mantêm contraste em fundos claros. Danger identifica erros sempre acompanhados de texto. Focus usa primary com contorno de 3px. Não há tema escuro nesta entrega. Forced colors deixa cores e controles sob controle do sistema.

## Typography

Plus Jakarta Sans é hospedada localmente pelo pacote fontsource, pesos 400, 500, 600 e 700. Display usa peso 700 e espaçamento negativo; body/controles usam 400–600, 14–16px e entrelinha 1.5. Os papéis usam a mesma família para continuidade, sem segunda fonte ornamental. Headings se adaptam com clamp; nenhum texto essencial é truncado.

## Layout

Painel de até 1280px, proporção 48/52 entre marca e formulário. Padding amplo em desktop e formulário até 540px. Abaixo de 900px, composição em uma coluna, marca compacta e formulário integral. Abaixo de 480px, bordas externas e padding diminuem. Documento é o único proprietário da rolagem vertical. Campos e botão têm pelo menos 52px de altura. Slots de ajuda preservam posição dos campos. Feedback global pode crescer para manter texto integral acessível, sem ocultar o botão.

## Elevation & Depth

Um único cartão com borda suave; sombra curta e discreta. Não empilhar cartões. Área autenticada usa cabeçalho simples e confirmação de acesso, sem painel operacional nesta issue.

## Shapes

Controles usam control; container usa panel. Ícones Lucide com traços 1.7–2px. Logo PNG original é utilizada sem redesenho.

## Components

AuthLayout, PasswordField, ErrorToast, Brand, Feedback e Spinner são compartilhados. Recuperação usa a mesma composição, três etapas sem navegação livre, código numérico, reenvio com espera e confirmação de senha. LoginPage oferece um único formulário de e-mail e senha, independente de perfil ou query string. Botões possuem hover, active, focus-visible e disabled. Loading conserva geometria. Login usa toast de erro persistente com role alert e campos em danger/danger-surface; Entrar desabilita quando faltar e-mail ou senha. Toast superior direito usa --z-toast: 900, safe-area e largura limitada ao viewport, sem mover o formulário. Outros fluxos mantêm Feedback inline; pending usa role status. Reveal tem nome alternado e aria-pressed. Não há seletor de área. A API determina o perfil e o redirecionamento.

Motion: somente transições de cor de 150ms e spinner durante requisição; prefers-reduced-motion elimina rotação e transições. A linha de pulso é estática. Scrollbars globais têm thumb, track, hover, active e fallback WebKit, sem opt-in por componente.

## Do's and Don'ts

- Usar a logo anexada e os tokens gerados.
- Manter um único login para todos os perfis, com campos editáveis durante a verificação de sessão e após falha de restauração.
- Não exibir dados reais ou fictícios de pacientes no login.
- Recuperação de senha foi autorizada em solicitação posterior à issue original. Não adicionar MFA, lembrar acesso ou funcionalidades clínicas.

## Linguagem

pt-BR simples e acolhedor, voltado à pessoa que está entrando. Preferir “sua conta”, “Digite”, “Entrar” e “tente de novo” a termos como sessão, autenticação, credenciais, autorização e permissões nos avisos públicos. Explicar o próximo passo sem culpar a pessoa, prometer envio para contas inexistentes ou afirmar sucesso antes da API. Mensagens de conexão continuam distintas de e-mail/senha inválidos. Manter instruções de expiração, confirmação e limites de senha claras.
