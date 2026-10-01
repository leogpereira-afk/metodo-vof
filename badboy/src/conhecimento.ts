// A base privada é conteúdo de referência, não autorização de operação.
export function precisaConhecimentoMubisys(pedido: string): boolean {
  const t = pedido.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /mubi|impresilk|\berp\b|\bo\.?\s?s\.?\b|\bnf\b|comiss|estoque|recebive|fatur|concili|markup|orcamento|custeio|materia.prima|expedicao|\bpcp\b|\bdre\b/
    .test(t);
}
export function segmentarConhecimento(
  texto: string,
  maximo = 4000,
): { ordem: number; titulo: string; conteudo: string }[] {
  if (!Number.isInteger(maximo) || maximo < 100 || maximo > 6000) throw new Error("Tamanho de trecho inválido.");
  const resultado: { ordem: number; titulo: string; conteudo: string }[] = [];
  let inicio = 0, titulo = "Referência";
  while (inicio < texto.length) {
    let fim = Math.min(inicio + maximo, texto.length);
    if (fim < texto.length) {
      const quebra = texto.lastIndexOf("\n", fim);
      if (quebra > inicio + maximo / 2) fim = quebra + 1;
      if (fim - inicio > maximo) fim--;
    }
    // Não separa os dois códigos UTF-16 de um caractere.
    if (fim < texto.length && /[\uD800-\uDBFF]/.test(texto[fim - 1]!)) fim--;
    const conteudo = texto.slice(inicio, fim);
    const cabecalho = /^#{1,5}\s+(.+)$/m.exec(conteudo)?.[1];
    resultado.push({ ordem: resultado.length, titulo: (cabecalho ?? titulo).slice(0, 300), conteudo });
    titulo = [...conteudo.matchAll(/^#{1,5}\s+(.+)$/gm)].at(-1)?.[1] ?? titulo;
    inicio = fim;
  }
  return resultado;
}
