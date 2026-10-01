// Reserva atômica no banco: a mesma conversa nunca executa dois trabalhos juntos.
// Efeito externo incerto não é repetido automaticamente.
export async function processarFila<T extends { id: number }>(
  memoria: {
    reservarTrabalho: () => Promise<T | null>;
    concluirTrabalho: (id: number, erro?: string) => Promise<void>;
  },
  executar: (trabalho: T) => Promise<void>,
  max = 4,
) {
  for (let i = 0; i < max; i++) {
    const trabalho = await memoria.reservarTrabalho();
    if (!trabalho) return;
    let erro: string | undefined;
    try {
      await executar(trabalho);
    } catch (e) {
      erro = (e as Error).message;
    }
    await memoria.concluirTrabalho(trabalho.id, erro);
  }
}
