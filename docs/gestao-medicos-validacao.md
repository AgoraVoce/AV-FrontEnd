# Gestão de médicos, salas e plantões

O frontend integra os contratos do AV-Backend a partir de `9a8725b` (PR #11). As telas administrativas exigem perfil ADMIN. O cadastro completo cria a conta MEDICO e o perfil clínico em uma operação; contas antigas podem receber o vínculo sem outro login ou alteração de senha.

## Funcionalidades entregues

- #32: listagem paginada, cadastro completo e edição de médicos com CRM/UF, telefone, especialidade, situação e sala padrão.
- Busca por nome ou CRM; filtros de especialidade e situação; inativação com confirmação e reativação de perfis legados.
- #35: cadastro, edição e inativação de salas; busca e filtros de disponibilidade; seleção de sala nos plantões e sugestão da sala padrão ativa.
- Escala semanal/lista e filtros por médico, sala e especialidade; cadastro, edição e cancelamento de plantões avulsos.
- Validação de intervalo e conflitos de médico/sala, incluindo reservas legadas com sala textual e registros em páginas posteriores da escala.
- Loading, erro, nova tentativa e vazio, inclusive semana sem plantões; erros de unicidade e concorrência preservam o formulário.

Exclusão de salas e recorrência semanal não são oferecidas, pois os respectivos endpoints não existem no contrato atual. Inativação e plantões avulsos cobrem o fluxo solicitado.

## Contratos usados

Todos os caminhos são relativos a `/api/v1`:

| Ação administrativa | Método e caminho |
| --- | --- |
| Listar médicos | GET `/admin/doctors?page=&pageSize=&q=&specialtyId=&active=` |
| Criar conta e perfil médico atomicamente | POST `/admin/doctors` |
| Vincular conta MEDICO existente | POST `/doctors` |
| Editar, inativar ou reativar médico | PATCH `/doctors/:id` |
| Carregar especialidades | GET `/specialties?page=&pageSize=` |
| Listar/criar salas | GET/POST `/rooms` |
| Editar/inativar sala | PATCH `/rooms/:id` |
| Escala administrativa paginada | GET `/admin/shifts?page=&pageSize=` |
| Criar/editar/cancelar plantão | POST `/doctors/:id/shifts`, PATCH `/doctors/:id/shifts/:shiftId` |

Busca vazia é omitida; não enviar `q=` nem combinar `q` com `name`. CRM aceita 1 a 10 dígitos, preservando zeros iniciais. Cadastro exige telefone com DDD (10 ou 11 dígitos). Edição não envia senha ou campos inalterados; telefone ausente em perfil legado é omitido. O PATCH do backend sincroniza nome/e-mail da conta e do perfil. Não reenviar o e-mail inalterado evita invalidar desnecessariamente a sessão médica.

Salas usam `{name,type,status}` com `ativa|manutencao|inativa`. Plantões usam `{startsAt,endsAt,roomId,availabilityStatus}` com datas ISO e offset de Brasília. O backend mantém a sala textual histórica e rejeita conflitos concorrentes. O frontend carrega todas as páginas da escala antes de verificar sobreposição; a decisão do servidor prevalece se a agenda mudar depois.

## Contas médicas sem perfil clínico

Uma conta com role MEDICO pode autenticar mesmo sem registro Doctor ativo, mas fila, dashboard e atendimento ativo exigem esse vínculo. O código `DOCTOR_PROFILE_UNAVAILABLE` indica perfil ausente ou inativo; não indica ausência de plantão.

- Novos médicos cadastrados a partir de Funcionários são direcionados ao formulário completo, evitando criar apenas a conta de acesso.
- Em **Médicos → Vincular conta existente**, selecione uma conta médica ativa sem perfil e sua especialidade. Contas já vinculadas são excluídas dessa seleção, inclusive as de perfis inativos.
- Para perfil inativo, use **Reativar**, sem exigir o preenchimento de CRM nos cadastros legados.
- A área médica apresenta uma orientação persistente e interrompe o polling que repetia avisos. Após regularizar, use **Verificar cadastro novamente**.
- Mudança de perfil de funcionário para MEDICO também orienta completar o vínculo clínico.

A administração precisa escolher a especialidade correta. Não é criado vínculo automático nem é escolhida especialidade pelo frontend.

## Validação

```bash
npm run lint
npm run build
npm run tokens:check
npm run design:lint
npm test
npm run test:local-api
npm run test:visual:demo
npm run test:visual:api
```

Os testes HTTP interceptam todas as chamadas de API e usam dados sintéticos. Testes visuais cobrem desktop/mobile, erros JavaScript e overflow.

Além dos testes automatizados, a integração foi validada em navegador com API real e PostgreSQL 16 descartável: cadastro de sala, cadastro completo de médico, edição persistida após novo login, busca por CRM, filtros/vazio, plantão com sala padrão, edição, cancelamento e inativação da sala. A suíte de integração `doctor-management.test.ts` do backend passou com 6 testes, incluindo unicidade, autorização e conflitos concorrentes.

Também foi reproduzido o erro de conta médica sem vínculo: após vincular pela interface, fila e atendimento ativo carregaram mantendo login/senha originais. Inativação/reativação de perfil legado e login de médico criado pelo cadastro completo foram verificados contra a API real local.

## Atualização do banco compartilhado em 30/10/2026

O backend local atualizado usava um banco do Aiven sem as três migrations finais. Isso impedia as consultas de gestão apesar de o código conter os novos endpoints. Após autorização explícita, foram aplicadas:

- `20261025120000_add_reception_tickets`;
- `20261025160000_specialty_normalized_name`;
- `20261030010000_doctor_profiles_rooms`.

Houve pré-checagem sem duplicidades impeditivas ou migrations incompletas e backup completo privado, verificado com ferramentas PostgreSQL 18. O backup contém dados reais e não integra o repositório nem os artefatos do PR.

Após a atualização, contagens e assinaturas dos dados originais das 14 tabelas preexistentes ficaram iguais. API e banco responderam aos health checks; 14 verificações com conexão forçada a somente leitura passaram, abrangendo gestão, pacientes, entradas, recepção e médico com perfil ativo. Não foram criados dados sintéticos no banco compartilhado.

Contas antigas sem perfil ainda precisam do vínculo administrativo. Aplicar migrations não escolhe especialidade nem regulariza esses cadastros automaticamente. A validação do banco compartilhado foi de integridade e consultas; as mutações completas foram verificadas no ambiente descartável. Outros ambientes de deploy devem confirmar a mesma versão de backend e as migrations.

O documento local `pendencias-backend-gestao-medicos.md` permanece ignorado pelo Git. Os contratos e o estado final revisáveis estão neste relatório.
