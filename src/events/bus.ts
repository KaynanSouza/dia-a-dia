import type { AppEvents } from './types';

type Handler<T> = (payload: T) => void;
type AnyHandler<E> = <K extends keyof E>(event: K, payload: E[K]) => void;

/** Emissor tipado em memória. Handlers que lançam erro não derrubam os demais. */
class EventBus<E extends Record<string, object>> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();
  private any = new Set<AnyHandler<E>>();

  on<K extends keyof E>(event: K, h: Handler<E[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(h as Handler<never>);
    return () => set.delete(h as Handler<never>);
  }

  onAny(h: AnyHandler<E>): () => void {
    this.any.add(h);
    return () => this.any.delete(h);
  }

  emit<K extends keyof E>(event: K, payload: E[K]) {
    for (const h of this.handlers.get(event) ?? []) {
      try {
        (h as Handler<E[K]>)(payload);
      } catch {}
    }
    for (const h of this.any) {
      try {
        h(event, payload);
      } catch {}
    }
  }
}

export const bus = new EventBus<AppEvents>();
