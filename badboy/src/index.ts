import { criarBot } from "./bot.js";
import { Cerebro } from "./claude.js";
import { lerConfig } from "./config.js";
import { Memoria } from "./memoria.js";

const config = lerConfig();
const memoria = new Memoria(config);
const cerebro = new Cerebro(config, memoria);
const bot = criarBot(config, memoria, cerebro);

await bot.api.setMyCommands([
  { command: "custo", description: "Gasto do mês em tokens e dólares" },
  { command: "lembrar", description: "Salvar um fato" },
  { command: "fatos", description: "Listar os fatos salvos" },
  { command: "esquecer", description: "Apagar um fato (com confirmação)" },
  { command: "limpar", description: "Apagar o histórico (com confirmação)" },
  { command: "ajuda", description: "O que eu sei fazer" },
]);

// Long polling: não precisa de URL pública nem webhook no Railway.
// Uma instância só: duas rodando ao mesmo tempo disputam os updates.
const parar = () => bot.stop();
process.once("SIGINT", parar);
process.once("SIGTERM", parar);

console.log(`BadBoy no ar (modelo ${config.modelo}, esforço ${config.esforco}).`);
await bot.start({ drop_pending_updates: false });
