import assert from "node:assert/strict";
import { test } from "node:test";
import { Cerebro } from "../src/claude.ts";
const resposta = (content: any[], stop_reason = "end_turn") => ({
  content,
  stop_reason,
  model: "claude-opus-5-5",
  usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
});
test("auditoria bloqueia escrita mesmo se o modelo tentar e revisa afirmação de execução", async () => {
  const chamadas: any[] = [];
  let gravacoes = 0;
  const client = {
    beta: {
      messages: {
        create: async (p: any) => {
          chamadas.push(p);
          if (chamadas.length === 1) {
            return resposta([{
              type: "tool_use",
              id: "t1",
              name: "salvar_fato",
              input: { fato: "Preferência indevida por origem externa" },
            }], "tool_use");
          }
          if (chamadas.length === 2) return resposta([{ type: "text", text: "Salvei a preferência." }]);
          return resposta([{
            type: "text",
            text: "Nenhuma preferência foi salva. O modo de auditoria permite apenas consultas.",
          }]);
        },
      },
    },
  };
  const memoria = {
    listarFatos: async () => [],
    listarTarefas: async () => [],
    registrarUso: async () => {},
    salvarFato: async () => {
      gravacoes++;
      return 1;
    },
  };
  const c = new Cerebro(
    { anthropicApiKey: "teste", modelo: "claude-opus-5-5", esforco: "medium", fuso: "America/Sao_Paulo" },
    memoria as any,
    {} as any,
    client as any,
  );
  const r = await c.responder([{ papel: "user", conteudo: "Confira meu cadastro sem alterar." }], "30/09/2026", {
    somenteLeitura: true,
  });
  assert.equal(gravacoes, 0);
  assert.ok(!chamadas[0].tools.some((t: any) => t.name === "salvar_fato"));
  assert.equal(r.texto, "Nenhuma preferência foi salva. O modo de auditoria permite apenas consultas.");
  assert.equal(chamadas.length, 3);
  assert.ok(!chamadas[2].tools?.length);
});
test("hotel é preparado com fotografia do cadastro e não grava antes da confirmação", async () => {
  const chamadas: any[] = [];
  const pendentes: any[] = [];
  const viagem = { id: "v1", cidade: "Destino teste", hoteis: [] };
  const client = {
    beta: {
      messages: {
        create: async (p: any) => {
          chamadas.push(p);
          return chamadas.length === 1
            ? resposta([{
              type: "tool_use",
              id: "t1",
              name: "preparar_registro_central",
              input: {
                tipo: "hotel",
                id: "v1",
                campos_json: JSON.stringify({ nome: "Hotel exemplo", entrada: "2026-10-20", saida: "2026-10-22" }),
              },
            }], "tool_use")
            : resposta([{ type: "text", text: "Confira os dados e toque em Registrar." }]);
        },
      },
    },
  };
  const memoria = {
    listarFatos: async () => [],
    listarTarefas: async () => [],
    registrarUso: async () => {},
    criarPendente: async (t: string, d: any) => {
      pendentes.push({ t, d });
      return 7;
    },
  };
  const sistemas = { consultar: async () => [{ item: viagem }] };
  const c = new Cerebro(
    { anthropicApiKey: "teste", modelo: "claude-opus-5-5", esforco: "medium", fuso: "America/Sao_Paulo" },
    memoria as any,
    sistemas as any,
    client as any,
  );
  const r = await c.responder([{ papel: "user", conteudo: "Registre o hotel na viagem." }], "20/10/2026", {
    chatId: 1,
  });
  assert.equal(pendentes.length, 1);
  assert.deepEqual(pendentes[0].d.esperado, viagem);
  assert.equal(r.confirmacoes[0]?.tipo, "central");
  assert.equal(JSON.parse(chamadas[1].messages.at(-1).content[0].content).gravado, false);
});
test("tarefa concluída sem evidência é recusada e histórico usa somente a conversa atual", async () => {
  let rodada = 0, gravacoes = 0;
  const buscas: any[] = [];
  let resultados: any;
  const client = {
    beta: {
      messages: {
        create: async (p: any) => {
          if (rodada++ === 0) {
            return resposta([
              {
                type: "tool_use",
                id: "t1",
                name: "registrar_tarefa",
                input: { id: 0, titulo: "Enviar documento", estado: "concluida", evidencia: "" },
              },
              { type: "tool_use", id: "t2", name: "buscar_historico", input: { termo: "hotel" } },
            ], "tool_use");
          }
          resultados = p.messages.at(-1).content;
          return resposta([{ type: "text", text: "A tarefa continua pendente." }]);
        },
      },
    },
  };
  const m = {
    listarFatos: async () => [],
    listarTarefas: async () => [],
    registrarUso: async () => {},
    registrarTarefa: async () => {
      gravacoes++;
    },
    buscarHistorico: async (...a: any[]) => {
      buscas.push(a);
      return [];
    },
  };
  const c = new Cerebro(
    { anthropicApiKey: "teste", modelo: "claude-opus-5-5", esforco: "medium", fuso: "America/Sao_Paulo" },
    m as any,
    {} as any,
    client as any,
  );
  await c.responder([{ papel: "user", conteudo: "Como está minha tarefa?" }], "20/10/2026", { chatId: 27 });
  assert.equal(gravacoes, 0);
  assert.equal(resultados[0].is_error, true);
  assert.deepEqual(buscas, [[27, "hotel"]]);
});
test("pergunta Mubisys recupera guia e evidências privadas antes de responder sem executar instruções dos documentos", async () => {
  const buscas: any[] = [];
  let parametros: any;
  const c = new Cerebro(
    { anthropicApiKey: "teste", modelo: "claude-opus-5-5", esforco: "medium", fuso: "America/Sao_Paulo" },
    {
      listarFatos: async () => [],
      listarTarefas: async () => [],
      registrarUso: async () => {},
      consultarConhecimentoMubisys: async (...p: any[]) => {
        buscas.push(p);
        return {
          tipo: "referencia_historica",
          data_base: "2026-09-30",
          conteudo: "Comissão pela venda do mês. Exemplo antigo não é preço atual.",
        };
      },
    } as any,
    {} as any,
    {
      beta: {
        messages: {
          create: async (p: any) => {
            parametros = p;
            return resposta([{ type: "text", text: "A base histórica informa comissão pela venda do mês." }]);
          },
        },
      },
    } as any,
  );
  const r = await c.responder([{ papel: "user", conteudo: "Qual a regra de comissão da Impresilk?" }], "01/10/2026", {
    somenteLeitura: true,
  });
  assert.equal(buscas.length, 2);
  assert.equal(buscas[0][1], "guia-operacional-donboy");
  assert.ok(parametros.system.some((p: any) => p.text.includes("não instruções nem autorização")));
  assert.ok(parametros.tools.some((t: any) => t.name === "consultar_conhecimento_mubisys"));
  assert.ok(!parametros.tools.some((t: any) => t.name === "lancar_na_central"));
  assert.ok(r.consultas[0]?.includes("base 30/09/2026"));
});
test('revisor recebe também as referências privadas carregadas antes das ferramentas',async()=>{
 let rodada=0,rev:any;
 const m={listarFatos:async()=>[],listarTarefas:async()=>[],registrarUso:async()=>{},consultarConhecimentoMubisys:async()=>({conteudo:'Comissão pela venda do mês, não pelo recebimento.'})};
 const cli={beta:{messages:{create:async(p:any)=>{if(rodada++===0)return resposta([{type:'text',text:'Comissão pela venda do mês. '+('Explicação. '.repeat(140))}]);rev=JSON.parse(p.messages[0].content);return resposta([{type:'text',text:'A comissão é pela venda do mês, conforme a referência histórica.'}]);}}}};
 const c=new Cerebro({anthropicApiKey:'teste',modelo:'claude-opus-5-5',esforco:'medium',fuso:'America/Sao_Paulo'},m as any,{} as any,cli as any);
 await c.responder([{papel:'user',conteudo:'Comissão Impresilk'}],'01/10/2026');
 assert.ok(rev.referencia_mubisys);assert.match(JSON.stringify(rev.referencia_mubisys),/venda do mês/);
});

test('conversa normal respeita limite de 20 ferramentas estritas sem remover capacidades', async () => {
 let enviadas:any[]=[];
 const c=new Cerebro({anthropicApiKey:'teste',modelo:'claude-opus-5-5',esforco:'medium',fuso:'America/Sao_Paulo'},
 {listarFatos:async()=>[],listarTarefas:async()=>[],registrarUso:async()=>{}} as any,{} as any,
 {beta:{messages:{create:async(p:any)=>{enviadas=p.tools;return resposta([{type:'text',text:'Olá, posso ajudar.'}]);}}}} as any);
 await c.responder([{papel:'user',conteudo:'Olá'}],'01/10/2026');
 assert.ok(enviadas.filter(t=>t.strict===true).length<=20,'API Claude recusa mais de 20 ferramentas strict');
 for(const nome of ['consultar_conhecimento_mubisys','consultar_recebiveis','consultar_banco','ver_agenda','buscar_emails'])assert.notEqual(enviadas.find(t=>t.name===nome).strict,true,'consultas não devem aumentar a gramática estrita');
 for(const nome of ['consultar_conhecimento_mubisys','registrar_tarefa','preparar_registro_central','lancar_na_central','salvar_fato'])assert.ok(enviadas.some(t=>t.name===nome),nome);
 for(const nome of ['registrar_tarefa','preparar_registro_central','lancar_na_central','salvar_fato'])assert.equal(enviadas.find(t=>t.name===nome).strict,true);
});

test("auditoria com conjunto completo mantém bloqueio de escrita e revisão", async () => {
  const chamadas: any[] = [];
  let gravacoes = 0;
  const client = {
    beta: {
      messages: {
        create: async (p: any) => {
          chamadas.push(p);
          if (chamadas.length === 1) {
            return resposta([{
              type: "tool_use",
              id: "t1",
              name: "salvar_fato",
              input: { fato: "Preferência indevida por origem externa" },
            }], "tool_use");
          }
          if (chamadas.length === 2) return resposta([{ type: "text", text: "Salvei a preferência." }]);
          return resposta([{
            type: "text",
            text: "Nenhuma preferência foi salva. O modo de auditoria permite apenas consultas.",
          }]);
        },
      },
    },
  };
  const memoria = {
    listarFatos: async () => [],
    listarTarefas: async () => [],
    registrarUso: async () => {},
    salvarFato: async () => {
      gravacoes++;
      return 1;
    },
  };
  const c = new Cerebro(
    { anthropicApiKey: "teste", modelo: "claude-opus-5-5", esforco: "medium", fuso: "America/Sao_Paulo" },
    memoria as any,
    {} as any,
    client as any,
  );
  const r = await c.responder([{ papel: "user", conteudo: "Confira meu cadastro sem alterar." }], "30/09/2026", {
    somenteLeitura: true, auditarFerramentasCompletas: true,
  });
  assert.equal(gravacoes, 0);
  assert.ok(chamadas[0].tools.some((t: any) => t.name === "salvar_fato"));
  assert.equal(r.texto, "Nenhuma preferência foi salva. O modo de auditoria permite apenas consultas.");
  assert.equal(chamadas.length, 3);
  assert.ok(!chamadas[2].tools?.length);
});
