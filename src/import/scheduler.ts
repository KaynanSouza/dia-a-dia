/**
 * Fatiamento cooperativo: o trabalho pesado roda em fatias de ~8 ms e devolve o controle ao
 * event loop entre elas, então gestos, animações e o re-render do progresso continuam fluindo.
 * (React Native não tem Web Workers; o I/O do SQLite e do arquivo já roda em threads nativas.)
 */
export class TimeSlicer {
  private sliceStart = Date.now();

  constructor(
    private budgetMs = 8,
    private signal?: AbortSignal,
  ) {}

  async tick(): Promise<void> {
    if (Date.now() - this.sliceStart < this.budgetMs) return;
    await new Promise<void>((r) => setTimeout(r, 0));
    this.sliceStart = Date.now();
    if (this.signal?.aborted) throw new ImportCancelledError();
  }
}

export class ImportCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'ImportCancelledError';
  }
}
