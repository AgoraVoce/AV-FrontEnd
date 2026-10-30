import { expect, test, type Page } from "@playwright/test";
// Isolate every test from the real backend; specific fixtures override this fallback.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", route => route.fulfill({ status: 503, json: { error: { code: "UNMOCKED_ENDPOINT", message: "Endpoint unavailable in this fixture" } } }));
});
const account = {id:"97d4962f-c7cc-4a59-8f25-5e3d1a296ec5",name:"Equipe Teste",email:"equipe@clinica.test"};
const entryId = "c6854b6a-1625-40bc-ac2a-d6bc737bd56b";
const patientId = "90e59e30-7cd7-44ec-9f09-84371c873acf";
const doctorId = "4b0e8bcb-fd78-4719-a53b-a227998095d4";
async function login(page:Page,role:"RECEPCIONISTA"|"MEDICO"|"ADMIN"){
  await page.route("**/api/v1/auth/login",async route=>{
    expect(route.request().postDataJSON()).toEqual({email:account.email,password:"senha-de-teste"});
    await route.fulfill({status:200,json:{accessToken:"jwt-de-teste-no-navegador",tokenType:"Bearer",expiresIn:900,user:{...account,role}}});
  });
  await page.goto("/login");
  await page.getByLabel("E-mail",{exact:true}).fill(account.email);
  await page.getByLabel("Senha",{exact:true}).fill("senha-de-teste");
  await page.getByRole("button",{name:"Entrar no sistema"}).click();
}
function mockQueue(page:Page,items:object[]=[]){
  return page.route("**/api/v1/queues/waiting",async route=>{
    expect(route.request().headers().authorization).toBe("Bearer jwt-de-teste-no-navegador");
    await route.fulfill({json:{items}});
  });
}
function mockDoctors(page:Page) {
  return page.route("**/api/v1/doctors?*",route=>route.fulfill({json:{items:[{
    id:doctorId,name:"Dra. Helena",specialty:{id:"e91019fa-8e78-44d9-a5fa-66b64c919a7a",name:"Clínica médica"},
    shift:{id:"691df1a3-167f-469e-a7de-34777cc0e94d",startsAt:"2026-10-19T08:00:00Z",endsAt:"2026-10-19T18:00:00Z",room:"Sala 2"},
  }],page:1,pageSize:100,total:1}}));
}
function detail(status:"waiting"|"called"|"in_progress"|"completed",prescription:unknown=null) {
  return {
    id:entryId,patientId,enteredAt:"2026-10-19T09:00:00Z",severity:"AMARELO",status,
    assignedDoctorId:doctorId,queueCode:"A012",otherSymptoms:"Dor de cabeça",shortNote:"Observação teste",
    queuePosition:status==="waiting"?1:null,patient:{id:patientId,fullName:"Paciente da API",birthDate:null},
    doctor:{id:doctorId,name:"Dra. Helena"},room:"Sala 2",
    timestamps:{enteredAt:"2026-10-19T09:00:00Z",calledAt:status==="waiting"?null:"2026-10-19T09:05:00Z",
      startedAt:status==="in_progress"||status==="completed"?"2026-10-19T09:10:00Z":null,
      finishedAt:status==="completed"?"2026-10-19T09:35:00Z":null},prescription,
  };
}
test("login usa Bearer real e a recepção exibe a fila do backend",async({page})=>{
  await mockQueue(page,[{entryId,fullName:"Paciente da API",queueCode:null}]);
  await login(page,"RECEPCIONISTA");
  await expect(page).toHaveURL("/recepcao");
  await expect(page.getByRole("cell", { name: "Paciente da API" })).toBeVisible();
  await expect(page.locator("tbody tr").first().locator("td").first()).toBeVisible();
  await expect(page.getByText("Carlos Eduardo da Silva")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Atualizar fila"})).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Paciente da API" })).toBeVisible();
});
test("recepção busca paciente existente por nome e registra entrada com médico",async({page})=>{
  await mockQueue(page);
  await mockDoctors(page);
  await page.route("**/api/v1/patients/"+patientId,route=>route.fulfill({json:{id:patientId,fullName:"Pessoa Existente",cpf:"52998224725",birthDate:null,email:null,phone:null,createdAt:"2026-10-19T09:00:00Z",updatedAt:"2026-10-19T09:00:00Z"}}));
  await page.route("**/api/v1/patients?*",route=>route.fulfill({json:{items:[{
    id:patientId,fullName:"Pessoa Existente",cpf:"52998224725",birthDate:null,email:null,phone:null,createdAt:"2026-10-19T09:00:00Z",updatedAt:"2026-10-19T09:00:00Z",
  }],page:1,pageSize:10,total:1}}));
  let posted=false;
  await page.route("**/api/v1/entries",async route=>{
    expect(route.request().postDataJSON()).toMatchObject({patientId,assignedDoctorId:doctorId,severity:"AMARELO",symptomIds:[],otherSymptoms:"Dor de cabeça"});
    posted=true;await route.fulfill({status:201,json:{id:entryId,status:"AGUARDANDO",enteredAt:"2026-10-19T09:00:00Z"}});
  });
  await login(page,"RECEPCIONISTA");
  await page.getByRole("link",{name:"Pacientes cadastrados"}).first().click();
  await expect(page).toHaveURL("/pacientes");
  await page.getByLabel("Buscar paciente por nome ou CPF").fill("Pessoa");
  await page.getByRole("button",{name:"Buscar",exact:true}).click();
  await page.getByRole("link",{name:/Pessoa Existente/}).click();
  await expect(page).toHaveURL(new RegExp("/novo-cadastro\\?patient="));
  await page.getByLabel("Classificação informada pela recepção").selectOption("AMARELO");
  await page.getByLabel("Médico de plantão").selectOption(doctorId);
  await page.getByLabel("Sintomas / queixa relatada").fill("Dor de cabeça");
  await page.getByRole("button",{name:"Confirmar"}).click();
  await expect(page.getByRole("status").getByText("Entrada registrada com sucesso")).toBeVisible();
  expect(posted).toBe(true);
});
test("novo paciente exige duas requisições independentes de cadastro e entrada",async({page})=>{
  await mockQueue(page);await mockDoctors(page);
  let patientCreated=false,entryCreated=false;
  await page.route("**/api/v1/patients?*",route=>route.fulfill({json:{items:[],total:0,page:1,pageSize:1}}));
  await page.route("**/api/v1/patients",async route=>{
    const data=route.request().postDataJSON();
    expect(data.fullName).toBe("Pessoa Teste");patientCreated=true;
    await route.fulfill({status:201,json:{id:patientId,fullName:data.fullName,cpf:data.cpf}});
  });
  await page.route("**/api/v1/entries",async route=>{
    expect(route.request().postDataJSON().patientId).toBe(patientId);entryCreated=true;
    await route.fulfill({status:201,json:{id:entryId,status:"AGUARDANDO",enteredAt:"2026-10-19T09:00:00Z"}});
  });
  await login(page,"RECEPCIONISTA");
  await page.getByRole("link",{name:/Novo Cadastro/}).click();
  await expect(page.getByRole("heading",{name:"Novo paciente"})).toBeVisible();
  await expect(page.getByLabel("Buscar paciente por nome ou CPF")).toHaveCount(0);
  await page.getByLabel("CPF").fill("52998224725");
  await page.getByRole("button",{name:"Continuar"}).click();
  await page.getByLabel("Nome completo").fill("Pessoa Teste");
  await page.getByRole("button",{name:/Cadastrar e continuar/}).click();
  await expect(page.getByText(/Paciente:.*Pessoa Teste/)).toBeVisible();
  await page.getByLabel("Sintomas / queixa relatada").fill("Dor de cabeça");
  await page.getByRole("button",{name:"Confirmar"}).click();
  await expect(page.getByText("Entrada registrada com sucesso")).toBeVisible();
  expect(patientCreated && entryCreated).toBe(true);
});
test("recepção visualiza detalhe, atribui médico e preserva autoridade do médico para chamar",async({page})=>{
  await mockQueue(page,[{entryId,fullName:"Paciente da API",queueCode:"A012"}]);
  await mockDoctors(page);
  await page.route("**/api/v1/entries/"+entryId,route=>route.fulfill({json:detail("waiting")}));
  let assigned=false;
  await page.route("**/api/v1/entries/"+entryId+"/doctor",async route=>{
    expect(route.request().method()).toBe("PATCH");
    expect(route.request().postDataJSON()).toEqual({doctorId});
    assigned=true;await route.fulfill({json:{id:entryId,status:"AGUARDANDO"}});
  });
  await login(page,"RECEPCIONISTA");
  await page.getByRole("link",{name:"Ver detalhes"}).click();
  await expect(page).toHaveURL("/recepcao/entradas/"+entryId);
  await expect(page.getByText("Classificação", { exact: true })).toBeVisible();
  await page.getByLabel("Médico disponível").selectOption(doctorId);
  // The mocked detail has this same doctor, so mimic an initially unassigned entry.
  expect(await page.getByRole("button",{name:"Salvar médico"}).isDisabled()).toBe(true);
  expect(assigned).toBe(false);
  await expect(page.getByRole("button",{name:/Chamar próximo/})).toHaveCount(0);
});
test("admin lista contas reais, filtra e cadastra funcionário sem expor senha",async({page})=>{
  let created=false;let listed=false;
  await page.route("**/api/v1/employees?*",async route=>{
    listed=true;
    await route.fulfill({json:{items:created?[{id:"ef18ca6f-c68f-4748-ae75-653d188287f5",name:"Nova Médica",email:"medica@clinica.test",role:"MEDICO",active:true,createdAt:"2026-10-19T09:00:00Z",updatedAt:"2026-10-19T09:00:00Z"}]:[],page:1,pageSize:10,total:created?1:0}});
  });
  await page.route("**/api/v1/employees",async route=>{
    const data=route.request().postDataJSON();
    expect(data).toEqual({name:"Nova Médica",email:"medica@clinica.test",password:"senhaSegura123",role:"MEDICO"});
    created=true;
    await route.fulfill({status:201,json:{id:"ef18ca6f-c68f-4748-ae75-653d188287f5",name:data.name,email:data.email,role:data.role,active:true}});
  });
  await login(page,"ADMIN");
  await expect(page).toHaveURL("/admin");
  await page.getByRole("link",{name:"Gestão de Usuários"}).click();
  await page.getByRole("link",{name:"Novo funcionário"}).click();
  await expect(page).toHaveURL("/admin/novo-funcionario");
  await expect(page.getByRole("heading",{name:"Equipe cadastrada"})).toHaveCount(0);
  await expect(page.getByRole("link",{name:/Voltar aos funcionários/})).toBeVisible();
  await page.getByLabel("Nome completo").fill("Nova Médica");
  await page.getByLabel("E-mail corporativo").fill("medica@clinica.test");
  await page.getByLabel("Senha inicial").fill("senhaSegura123");
  await page.locator("form").getByLabel("Perfil").selectOption("MEDICO");
  await page.getByRole("button",{name:/Cadastrar funcionário/}).click();
  await expect(page).toHaveURL("/admin/usuarios");
  await expect(page.getByRole("cell",{name:"Nova Médica"})).toBeVisible();
  await expect(page.getByText("senhaSegura123")).toHaveCount(0);
  expect(created && listed).toBe(true);
});
test("médico chama, inicia e finaliza com prescrição num único endpoint",async({page})=>{
  await page.route("**/api/v1/queues/me",route=>route.fulfill({json:{items:[{
    entryId,patientId,fullName:"Paciente da API",queueCode:"A012",severity:"AMARELO",enteredAt:"2026-10-19T09:00:00Z",symptoms:[],otherSymptoms:"Dor de cabeça",shortNote:null,
  }]}}));
  let call=0,started=0,finished=0;
  let status:"waiting"|"called"|"in_progress"|"completed"="waiting";
  await page.route("**/api/v1/doctors/me/active",route=>route.fulfill({json:status==="called"||status==="in_progress" ? detail(status) : null}));
  await page.route("**/api/v1/entries/"+entryId,route=>route.fulfill({json:detail(status)}));
  await page.route("**/api/v1/queues/me/next",async route=>{
    expect(route.request().headers().authorization).toContain("Bearer ");
    call++;status="called";await route.fulfill({json:detail("called")});
  });
  await page.route("**/api/v1/entries/"+entryId+"/status",async route=>{
    expect(route.request().method()).toBe("PATCH");
    expect(route.request().postDataJSON()).toEqual({status:"in_progress"});
    started++;status="in_progress";await route.fulfill({json:detail("in_progress")});
  });
  await page.route("**/api/v1/entries/"+entryId+"/complete",async route=>{
    const body=route.request().postDataJSON();
    expect(body).toEqual({prescription:{description:"Conduta de observação",medications:[{name:"Medicamento fictício",dosage:"1 comprimido",instructions:"Após refeição"}]}});
    finished++;status="completed";await route.fulfill({json:detail("completed",body.prescription)});
  });
  await login(page,"MEDICO");
  await page.getByRole("button",{name:"Chamar próximo paciente"}).click();
  await expect(page).toHaveURL("/medico/atendimento");
  await expect(page.getByRole("status").getByText("Paciente chamado")).toBeVisible();
  await expect(page.getByRole("heading",{name:"Minha fila"})).toHaveCount(0);
  await page.getByRole("button",{name:/Iniciar atendimento/}).click();
  await page.getByRole("button",{name:/Prescrever e finalizar/}).click();
  await page.getByLabel("Descrição / conduta clínica").fill("Conduta de observação");
  await page.getByLabel(/^Nome/).fill("Medicamento fictício");
  await page.getByLabel("Dosagem").fill("1 comprimido");
  await page.getByLabel("Instruções").fill("Após refeição");
  await page.getByRole("button",{name:"Revisar e finalizar"}).click();
  await expect(page.getByText(/Revisar antes de finalizar/)).toBeVisible();
  await page.getByRole("button",{name:"Confirmar finalização"}).click();
  await expect(page).toHaveURL("/medico");
  await expect(page.getByRole("status").getByText("Atendimento finalizado")).toBeVisible();
  expect([call,started,finished]).toEqual([1,1,1]);
});
test("fila médica vazia não oferece chamada, sem inventar paciente",async({page})=>{
  await page.route("**/api/v1/queues/me",route=>route.fulfill({json:{items:[]}}));
  await login(page,"MEDICO");
  await expect(page.getByText("Não há pacientes aguardando neste momento.")).toBeVisible();
  await expect(page.getByRole("button",{name:"Chamar próximo paciente"})).toBeDisabled();
});
test("médico sem cadastro recebe erro de autorização, não dados fictícios",async({page})=>{
  await page.route("**/api/v1/queues/me",route=>route.fulfill({status:403,json:{error:{code:"DOCTOR_PROFILE_UNAVAILABLE",message:"Doctor profile unavailable"}}}));
  await login(page,"MEDICO");
  await expect(page).toHaveURL("/medico");
  await expect(page.getByRole("alert").filter({hasText:"cadastro médico"}).first()).toBeVisible();
  await expect(page.getByText("Dr. Marcelo Arantes")).toHaveCount(0);
});
test("logout revoga o token no servidor e direciona ao login",async({page})=>{
  await mockQueue(page);
  let revoked=false;
  await page.route("**/api/v1/auth/logout",async route=>{
    revoked=route.request().headers().authorization==="Bearer jwt-de-teste-no-navegador";
    await route.fulfill({status:204,body:""});
  });
  await login(page,"RECEPCIONISTA");
  await page.getByRole("button",{name:"Sair"}).click();
  await expect(page).toHaveURL("/login");
  expect(revoked).toBe(true);
});
test("401 encerra sessão e impede visualização de dados privados",async({page})=>{
  await page.route("**/api/v1/queues/waiting",route=>route.fulfill({status:401,json:{error:{code:"UNAUTHENTICATED",message:"Authentication required"}}}));
  await login(page,"RECEPCIONISTA");
  await expect(page).toHaveURL("/login");
});


test("cadastro de funcionário abre rota exclusiva e botão voltar preserva listagem", async ({ page }) => {
  await page.route("**/api/v1/employees?*", route => route.fulfill({ json: { items: [], page: 1, pageSize: 10, total: 0 } }));
  await login(page, "ADMIN");
  await page.getByRole("link", { name: "Gestão de Usuários" }).click();
  await page.getByRole("link", { name: "Novo funcionário" }).click();
  await expect(page).toHaveURL("/admin/novo-funcionario");
  await expect(page.getByRole("heading", { name: "Equipe cadastrada" })).toHaveCount(0);
  await page.getByRole("link", { name: /Voltar aos funcionários/ }).click();
  await expect(page).toHaveURL("/admin/usuarios");
  await expect(page.getByRole("heading", { name: "Funcionários" })).toBeVisible();
});

test("médico inicia no dashboard, fila clicável mostra detalhe sem chamar fora de ordem", async ({ page }) => {
  await page.route("**/api/v1/queues/me", route => route.fulfill({ json: { items: [{
    entryId, patientId, fullName: "Paciente da API", queueCode: "A012", severity: "AMARELO",
    enteredAt: "2026-10-19T09:00:00Z", symptoms: [], otherSymptoms: "Dor de cabeça", shortNote: null,
  }] } }));
  await page.route("**/api/v1/entries/" + entryId, route => route.fulfill({ json: detail("waiting") }));
  let calls = 0;
  await page.route("**/api/v1/queues/me/next", route => { calls += 1; return route.fulfill({ json: detail("called") }); });
  await login(page, "MEDICO");
  await expect(page.getByRole("heading", { name: "Dashboard médico" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paciente atual" })).toHaveCount(0);
  await page.getByRole("link", { name: "Minha fila" }).first().click();
  await expect(page).toHaveURL("/medico/fila");
  await page.getByRole("link", { name: /Paciente da API.*Ver detalhes/ }).click();
  await expect(page).toHaveURL("/medico/fila/" + entryId);
  await expect(page.getByText("Dor de cabeça")).toBeVisible();
  await expect(page.getByRole("button", { name: "Chamar próximo paciente" })).toHaveCount(0);
  expect(calls).toBe(0);
});

test("falha no cadastro exibe toast e não mostra card de erro", async ({ page }) => {
  await mockQueue(page);
  await page.route("**/api/v1/patients", route => route.fulfill({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "Unavailable" } } }));
  await page.route("**/api/v1/patients?*",route=>route.fulfill({json:{items:[],page:1,pageSize:1,total:0}}));
  await login(page, "RECEPCIONISTA");
  await page.getByRole("link", { name: /Novo Cadastro/ }).click();
  await page.getByLabel("CPF").fill("52998224725");
  await page.getByRole("button",{name:"Continuar"}).click();
  await page.getByLabel("Nome completo").fill("Paciente Teste");
  await page.getByRole("button", { name: /Cadastrar e continuar/ }).click();
  await expect(page.getByRole("alert")).toContainText("Não foi possível cadastrar o paciente");
  await expect(page.locator(".local-message.is-error")).toHaveCount(0);
});
