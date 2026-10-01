export async function lerPaginas(
  buscar: (url: string) => Promise<Record<string, unknown>>,
  url: string,
  campo = "items",
  maxPaginas = 10,
) {
  const items: Record<string, unknown>[] = [];
  const destino = new URL(url);
  const vistos = new Set<string>();
  let proximaPagina = "";
  for (let i = 0; i < maxPaginas; i++) {
    const dados = await buscar(destino.toString());
    if (Array.isArray(dados[campo])) items.push(...dados[campo] as Record<string, unknown>[]);
    proximaPagina = String(dados.nextPageToken ?? "");
    if (!proximaPagina) break;
    if (vistos.has(proximaPagina)) break;
    vistos.add(proximaPagina);
    destino.searchParams.set("pageToken", proximaPagina);
  }
  return { items, parcial: !!proximaPagina, proximaPagina };
}
