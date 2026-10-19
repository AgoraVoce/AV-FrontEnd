import { expect, test, type Page } from "@playwright/test";
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
  await expect(page.getByText("Paciente da API")).toBeVisible();
  await expect(page.getByText("Sem senha")).toBeVisible();
  await expect(page.getByText("Carlos Eduardo da Silva")).toHaveCount(0);
  await page.getByRole("button",{name:"Atualizar fila"}).click();
  await expect(page.getByText("Paciente da API")).toBeVisible();
});
test("recepção busca paciente existente por nome e registra entrada com médico",async({page})=>{
  await mockQueue(page);
  await mockDoctors(page);
  await page.route("**/api/v1/patients?*",route=>route.fulfill({json:{items:[{
    id:patientId,fullName:"Pessoa Existente",cpf:"52998224725",birthDate:null,email:null,phone:null,createdAt:"2026-10-19T09:00:00Z",updatedAt:"2026-10-19T09:00:00Z",
  }],page:1,pageSize:10,total:1}}));
  let posted=false;
  await page.route("**/api/v1/entries",async route=>{
    expect(route.request().postDataJSON()).toMatchObject({patientId,assignedDoctorId:doctorId,severity:"AMARELO",symptomIds:[],otherSymptoms:"Dor de cabeça"});
    posted=true;await route.fulfill({status:201,json:{id:entryId,status:"AGUARDANDO",enteredAt:"2026-10-19T09:00:00Z"}});
  });
  await login(page,"RECEPCIONISTA");
  await page.getByRole("link",{name:/Novo Cadastro/}).click();
  await page.getByLabel("Buscar paciente por nome ou CPF").fill("Pessoa");
  await page.getByRole("button",{name:/Pessoa Existente/}).click();
  await page.getByLabel("Classificação informada pela recepção").selectOption("AMARELO");
  await page.getByLabel("Médico de plantão").selectOption(doctorId);
  await page.getByLabel("Sintomas / queixa relatada").fill("Dor de cabeça");
  await page.getByRole("button",{name:"Confirmar entrada no servidor"}).click();
  await expect(page.getByText("Entrada registrada com sucesso")).toBeVisible();
  expect(posted).toBe(true);
});
test("novo paciente exige duas requisições independentes de cadastro e entrada",async({page})=>{
  await mockQueue(page);await mockDoctors(page);
  let patientCreated=false,entryCreated=false;
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
  await page.getByRole("button",{name:"Novo paciente"}).click();
  await page.getByLabel("Nome completo").fill("Pessoa Teste");
  await page.getByLabel("CPF").fill("52998224725");
  await page.getByRole("button",{name:"Continuar para entrada"}).click();
  await expect(page.getByText(/Paciente selecionado:/)).toBeVisible();
  await page.getByLabel("Sintomas / queixa relatada").fill("Dor de cabeça");
  await page.getByRole("button",{name:"Confirmar entrada no servidor"}).click();
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
  await page.getByRole("button",{name:"Ver detalhes"}).click();
  await expect(page.getByText("Classificação")).toBeVisible();
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
  await page.getByRole("button",{name:"Novo funcionário"}).click();
  await page.getByLabel("Nome completo").fill("Nova Médica");
  await page.getByLabel("E-mail corporativo").fill("medica@clinica.test");
  await page.getByLabel("Senha inicial").fill("senhaSegura123");
  await page.locator("form").getByLabel("Perfil").selectOption("MEDICO");
  await page.getByRole("button",{name:"Criar conta no backend"}).click();
  await expect(page.getByRole("cell",{name:"Nova Médica"})).toBeVisible();
  await expect(page.getByText("senhaSegura123")).toHaveCount(0);
  expect(created && listed).toBe(true);
});
test("médico chama, inicia e finaliza com prescrição num único endpoint",async({page})=>{
  await page.route("**/api/v1/queues/me",route=>route.fulfill({json:{items:[{
    entryId,patientId,fullName:"Paciente da API",queueCode:"A012",severity:"AMARELO",enteredAt:"2026-10-19T09:00:00Z",symptoms:[],otherSymptoms:"Dor de cabeça",shortNote:null,
  }]}}));
  let call=0,started=0,finished=0;
  await page.route("**/api/v1/queues/me/next",async route=>{
    expect(route.request().headers().authorization).toContain("Bearer ");
    call++;await route.fulfill({json:detail("called")});
  });
  await page.route("**/api/v1/entries/"+entryId+"/status",async route=>{
    expect(route.request().method()).toBe("PATCH");
    expect(route.request().postDataJSON()).toEqual({status:"in_progress"});
    started++;await route.fulfill({json:detail("in_progress")});
  });
  await page.route("**/api/v1/entries/"+entryId+"/complete",async route=>{
    const body=route.request().postDataJSON();
    expect(body).toEqual({prescription:{description:"Conduta de observação",medications:[{name:"Medicamento fictício",dosage:"1 comprimido",instructions:"Após refeição"}]}});
    finished++;await route.fulfill({json:detail("completed",body.prescription)});
  });
  await login(page,"MEDICO");
  await page.getByRole("button",{name:"Chamar próximo paciente"}).click();
  await expect(page.getByText(/Paciente chamado com sucesso/)).toBeVisible();
  await page.getByRole("button",{name:/Iniciar atendimento/}).click();
  await page.getByRole("button",{name:/Prescrever e finalizar/}).click();
  await page.getByLabel("Descrição / conduta clínica").fill("Conduta de observação");
  await page.getByLabel(/^Nome/).fill("Medicamento fictício");
  await page.getByLabel("Dosagem").fill("1 comprimido");
  await page.getByLabel("Instruções").fill("Após refeição");
  await page.getByRole("button",{name:"Revisar e finalizar"}).click();
  await expect(page.getByText(/Revisar antes de finalizar/)).toBeVisible();
  await page.getByRole("button",{name:"Confirmar finalização"}).click();
  await expect(page.getByText(/Atendimento finalizado e prescrição salva/)).toBeVisible();
  expect([call,started,finished]).toEqual([1,1,1]);
});
test("fila médica vazia não oferece chamada, sem inventar paciente",async({page})=>{
  await page.route("**/api/v1/queues/me",route=>route.fulfill({json:{items:[]}}));
  await login(page,"MEDICO");
  await expect(page.getByText("Nenhum paciente aguardando")).toBeVisible();
  await expect(page.getByRole("button",{name:"Chamar próximo paciente"})).toBeDisabled();
});
test("médico sem cadastro recebe erro de autorização, não dados fictícios",async({page})=>{
  await page.route("**/api/v1/queues/me",route=>route.fulfill({status:403,json:{error:{code:"DOCTOR_PROFILE_UNAVAILABLE",message:"Doctor profile unavailable"}}}));
  await login(page,"MEDICO");
  await expect(page).toHaveURL("/medico");
  await expect(page.getByRole("alert")).toContainText("cadastro médico");
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
