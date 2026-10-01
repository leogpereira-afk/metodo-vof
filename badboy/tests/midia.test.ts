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
test("áudio sem credencial informa bloqueio e não finge transcrição", async () => {
  const m = new Midia({ telegramToken: "t" }, async () => {
    throw Error("não deveria chamar");
  });
  await assert.rejects(
    m.carregar({
      tipo: "audio",
      nome: "v.ogg",
      mime: "audio/ogg",
      file_id: "a",
    }),
    /OPENAI_API_KEY/,
  );
});
test("transcrição envia arquivo binário ogg e geração usa qualidade alta e PNG original", async () => {
  let imagem: any, form: any;
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const m = new Midia(
    { telegramToken: "t", openaiApiKey: "chave" },
    async (url: any, op: any) => {
      if (String(url).includes("getFile")) {
        return Response.json({
          ok: true,
          result: { file_path: "voice/v.oga" },
        });
      }
      if (String(url).includes("/file/bot")) {
        return new Response(
          new TextEncoder().encode("OggS" + ".".repeat(40)),
        );
      }
      if (String(url).endsWith("/transcriptions")) {
        form = op.body;
        return Response.json({ text: "Verifique minha agenda amanhã." });
      }
      imagem = JSON.parse(op.body);
      return Response.json({
        data: [{ b64_json: base64(png) }],
        usage: { output_tokens: 10 },
      });
    },
  );
  const blocos = await m.carregar({
    tipo: "audio",
    nome: "voz.ogg",
    mime: "audio/ogg",
    file_id: "a",
  });
  assert.match(JSON.stringify(blocos), /Verifique minha agenda/);
  assert.equal(form.get("file").name, "voz.ogg");
  const r = await m.gerarImagem(
    "Uma sala bem iluminada, sem texto",
    "paisagem",
  );
  assert.equal(imagem.quality, "high");
  assert.equal(imagem.n, 1);
  assert.equal(imagem.output_format, "png");
  assert.equal(r.nome.endsWith(".png"), true);
  assert.deepEqual(r.bytes, png);
});
