// Prepara dados privados para importação administrativa; não se conecta ao banco.
// node --import tsx scripts/preparar-conhecimento.ts PASTA GUIA SAIDA.json
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { segmentarConhecimento } from "../src/conhecimento.ts";
const [origem, guia, saida] = process.argv.slice(2);
if (!origem || !guia || !saida) throw Error("Informe pasta, guia privado e saída.");
const hash = (t: string | Buffer) => createHash("sha256").update(t).digest("hex");
const manifesto = JSON.parse(await readFile(join(origem, "MANIFESTO.json"), "utf8"));
const mapa = new Map<string, string>(manifesto.arquivos.map((x: any) => [x.arquivo, x.sha256]));
const docs: any[] = [];
const trechos: any[] = [];
async function ler(pasta: string) {
  for (const item of await readdir(pasta, { withFileTypes: true })) {
    const p = join(pasta, item.name);
    if (item.isDirectory()) await ler(p);
    else if (item.isFile()) {
      const rel = relative(origem!, p).replaceAll("\\", "/");
      if (
        !rel.endsWith(".md") && !rel.endsWith(".csv") &&
        !["anexos/contrato-api-referencia.json", "anexos/linha-base-e-metas.json"].includes(rel)
      ) continue;
      const bytes = await readFile(p), sha = hash(bytes);
      if (mapa.get(rel) !== sha) throw Error("Integridade não confere: " + rel);
      adicionar(rel, bytes.toString("utf8"), sha, "Pacote Mubisys Impresilk / " + rel);
    }
  }
}
function adicionar(chave: string, conteudo: string, sha: string, fonte: string) {
  if (
    /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}|sbp_[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{10,}/
      .test(conteudo)
  ) throw Error("Possível credencial em " + chave);
  const titulo = /^#\s+(.+)$/m.exec(conteudo)?.[1] ?? chave;
  docs.push({ chave, titulo, origem: fonte, data_base: "2026-09-30", sha256: sha, caracteres: conteudo.length });
  trechos.push(...segmentarConhecimento(conteudo).map((t) => ({ ...t, documento: chave })));
}
await ler(origem);
const g = await readFile(guia, "utf8");
adicionar(
  "guia-operacional-donboy",
  g,
  hash(g),
  "Síntese das regras operacionais dos relatórios 01, 03 e instruções anexas",
);
await writeFile(saida, JSON.stringify({ documentos: docs, trechos }));
console.log(
  JSON.stringify({
    documentos: docs.length,
    trechos: trechos.length,
    caracteres: docs.reduce((s, d) => s + d.caracteres, 0),
    integridade: "todos os originais conferidos com o manifesto",
  }),
);
