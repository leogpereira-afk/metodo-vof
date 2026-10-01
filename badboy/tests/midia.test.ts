import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  base64,
  identificarAnexo,
  Midia,
  validarArquivo,
} from "../src/midia.ts";

test("recebe foto maior, PDF e áudio do Telegram; rejeita formatos fora do escopo", () => {
  assert.equal(
    identificarAnexo({
      photo: [{ file_id: "a", width: 10, height: 10, file_size: 100 }, {
        file_id: "b",
        width: 40,
        height: 40,
        file_size: 800,
      }],
    })?.file_id,
    "b",
  );
  assert.equal(
    identificarAnexo({
      document: {
        file_id: "c",
        file_name: "fatura.PDF",
        mime_type: "application/pdf",
        file_size: 400,
      },
    })?.tipo,
    "pdf",
  );
  assert.equal(
    identificarAnexo({
      voice: { file_id: "v", mime_type: "audio/ogg", duration: 8 },
    })?.tipo,
    "audio",
  );
  assert.throws(
    () =>
      identificarAnexo({
        document: {
          file_id: "c",
          file_name: "script.exe",
          mime_type: "application/x-msdownload",
        },
      }),
    /formato/i,
  );
});
test("valida conteúdo real, tamanho e PDF sem omitir páginas", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const b = await pdf.save();
  assert.equal(
    (await validarArquivo({
      tipo: "pdf",
      nome: "fatura.pdf",
      mime: "application/pdf",
      file_id: "c",
    }, b)).mime,
    "application/pdf",
  );
  await assert.rejects(
    validarArquivo({
      tipo: "pdf",
      nome: "x.pdf",
      mime: "application/pdf",
      file_id: "c",
    }, new TextEncoder().encode("não sou PDF")),
    /PDF/i,
  );
  await assert.rejects(
    validarArquivo({
      tipo: "imagem",
      nome: "x.png",
      mime: "image/png",
      file_id: "c",
    }, new Uint8Array(6 * 1024 * 1024)),
    /5 MB/i,
  );
  for (let i = 1; i < 101; i++) pdf.addPage();
  await assert.rejects(
    validarArquivo({
      tipo: "pdf",
      nome: "x.pdf",
      mime: "application/pdf",
      file_id: "c",
    }, await pdf.save()),
    /100 páginas/i,
  );
});
test("download Telegram confere caminho, redirecionamentos e tamanho efetivo sem vazar token", async () => {
  const chamadas: any[] = [];
  const m = new Midia(
    { telegramToken: "123:segredo" },
    async (url: any, op: any) => {
      chamadas.push([String(url), op]);
      if (String(url).includes("/getFile")) {
        return Response.json({
          ok: true,
          result: { file_path: "documents/a.txt", file_size: 3 },
        });
      }
      return new Response("abc");
    },
  );
  const blocos = await m.carregar({
    tipo: "texto",
    nome: "a.txt",
    mime: "text/plain",
    file_id: "arquivo",
  });
  assert.match(JSON.stringify(blocos), /abc/);
  assert.equal(chamadas[1][1].redirect, "error");
  const ruim = new Midia(
    { telegramToken: "123:segredo" },
    async () =>
      Response.json({ ok: true, result: { file_path: "../segredo" } }),
  );
  await assert.rejects(
    ruim.carregar({
      tipo: "texto",
      nome: "a.txt",
      mime: "text/plain",
      file_id: "a",
    }),
    /caminho/i,
  );
});
test("Claude exclusivo rejeita áudio antes de baixar e não oferece geração de imagens", async () => {
  let chamadas = 0;
  const m = new Midia({ telegramToken: "t", openaiApiKey: "credencial-legada" } as any, async () => {
    chamadas++;
    throw Error("não deveria chamar");
  });
  const a = {tipo: "audio", nome: "v.ogg", mime: "audio/ogg", file_id: "a"} as const;
  await assert.rejects(m.carregar(a), /Claude.*não.*áudio/i);
  await assert.rejects(m.converter(a, new Uint8Array()), /Claude.*não.*áudio/i);
  assert.deepEqual(m.disponivel(), {leitura: true, audio: false, geracaoImagem: false});
  assert.equal(chamadas, 0);
  assert.equal("gerarImagem" in m, false);
});
