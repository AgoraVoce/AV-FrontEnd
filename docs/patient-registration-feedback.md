# Cadastro de pacientes: validação e mensagens de erro

O formulário anterior verificava apenas a quantidade de dígitos do CPF. Foi reproduzido, no navegador local ligado à API real, o envio de um CPF repetido inválido: HTTP 400 VALIDATION_ERROR, campo cpf; o usuário via somente a mensagem genérica “Há campos inválidos”. A requisição foi recusada antes da gravação e nenhum paciente foi criado.

## Ajustes

- CPF com validação de dígitos verificadores e rejeição de sequências repetidas, conforme o validador do backend; pontuação aceita e removida antes do envio.
- Nome, nascimento (data real e sem futuro no dia civil de São Paulo), e-mail e limites de tamanho verificados antes de chamar a API. Data opcional incompleta também gera orientação.
- Campos com erro têm texto específico, aria-invalid, aria-describedby e foco no primeiro campo inválido. O botão permite tentar continuar para obter uma explicação, em vez de ficar desabilitado sem motivo visível.
- PATIENT_ALREADY_EXISTS destaca o CPF e orienta usar Buscar paciente existente. Não tenta criar uma duplicata nem seleciona outro paciente automaticamente.
- Erros de validação retornados pela API apontam os campos correspondentes. Falhas de serviço continuam usando o toast existente, sem novo card genérico.
- Dados digitados são preservados em erros; os campos ficam bloqueados durante envio para evitar alteração de payload pendente.
- Erros ao registrar a entrada ficam visíveis no formulário, sem recriar o cadastro pessoal. Os endpoints, payloads, autenticação, perfis e regras do backend não foram alterados.

## Verificação

Após a correção, confirmado no navegador real: CPF inválido bloqueado, zero POSTs de paciente, mensagem específica e foco no campo CPF. Nenhum cadastro válido foi executado contra o banco real nesta tarefa.

Testes com API simulada cobrem: CPF inválido/correção, CPF duplicado, erro por campo retornado pela API, indisponibilidade e nova tentativa sem perder dados, cadastro válido seguido de entrada com espera começando em 0 min, e entrada já ativa sem novo POST de paciente. Também foram verificados lint, TypeScript/build e regressões de cadastro/API.

A causa exata do cadastro relatado pelo usuário ainda depende da mensagem/etapa apresentada no formulário. A reprodução acima confirma um problema de validação e feedback; não permite afirmar que o CPF específico do usuário era inválido ou duplicado.

## Nome preenchido com e-mail e ausência de senha de atendimento

Uma consulta posterior somente de leitura confirmou que o atendimento recém-criado tinha o e-mail da recepção efetivamente salvo no fullName do paciente e queueCode nulo. A fila e o detalhe concordavam sobre o nome: não era substituição visual pelo usuário da sessão.

O formulário agora usa campos com namespace patient-, autocomplete off no formulário e nos dados pessoais e bloqueia @ no nome, com mensagem específica e foco. O fluxo mantém o nome digitado como fonte do payload e usa o nome confirmado pela API na etapa de entrada. O cadastro incorreto existente não foi alterado automaticamente: falta o nome correto informado pelo usuário.

O backend atual usa queueCode: input.queueCode ?? null e o formulário não envia queueCode. Portanto, a geração automática de senha/número de atendimento é uma pendência real; o front não fabrica um número apenas na tela. Também foi solicitada ao usuário a confirmação de que se refere à senha da fila, e não a uma senha de login do paciente. Nenhuma senha de acesso foi criada ou alterada.
