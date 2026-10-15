/**
 * Camada 5: Naive Bayes multinomial sobre pesos TF-IDF (Rennie et al., 2003, sem complemento).
 *   tf      = log(1 + contagem)
 *   idf     = log((N + 1) / (df + 1)) + 1
 *   x       = tf·idf normalizado (L2) por documento
 *   θ[c,f]  = (Σ x[c,f] + α) / (Σ_f Σ x[c,f] + α·V)
 *   score_c = log P(c) + Σ_f x_q[f]·log θ[c,f]  → softmax = confiança
 * Modelo esparso: guarda só os log θ das features vistas em cada classe + um default por classe.
 */
export const MODEL_VERSION = 1;

export type TrainingDoc = { features: string[]; label: string; weight?: number };

export type SerializedModel = {
  v: number;
  alpha: number;
  classes: string[];
  logPrior: number[];
  idf: Record<string, number>;
  logTheta: Record<string, number>[]; // por classe: feature → log θ
  logThetaDefault: number[];
};

export type Prediction = { label: string; confidence: number } | null;

function tfidfVector(features: string[], idf: Record<string, number>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const f of features) if (f in idf) counts.set(f, (counts.get(f) ?? 0) + 1);
  const v = new Map<string, number>();
  let norm = 0;
  for (const [f, c] of counts) {
    const w = Math.log1p(c) * idf[f];
    v.set(f, w);
    norm += w * w;
  }
  norm = Math.sqrt(norm) || 1;
  for (const [f, w] of v) v.set(f, w / norm);
  return v;
}

export function train(docs: TrainingDoc[], alpha = 0.1): SerializedModel {
  const df = new Map<string, number>();
  for (const d of docs) for (const f of new Set(d.features)) df.set(f, (df.get(f) ?? 0) + 1);
  const n = docs.length;
  const idf: Record<string, number> = {};
  for (const [f, c] of df) idf[f] = Math.log((n + 1) / (c + 1)) + 1;
  const vocab = df.size;

  const classes = [...new Set(docs.map((d) => d.label))].sort();
  const ci = new Map(classes.map((c, i) => [c, i]));
  const mass = classes.map(() => new Map<string, number>());
  const totals = classes.map(() => 0);
  const priors = classes.map(() => 0);

  for (const d of docs) {
    const c = ci.get(d.label)!;
    const w = d.weight ?? 1;
    priors[c] += w;
    for (const [f, x] of tfidfVector(d.features, idf)) {
      mass[c].set(f, (mass[c].get(f) ?? 0) + x * w);
      totals[c] += x * w;
    }
  }

  const priorSum = priors.reduce((a, b) => a + b, 0) || 1;
  const logTheta = classes.map((_, c) => {
    const denom = totals[c] + alpha * vocab;
    const out: Record<string, number> = {};
    for (const [f, m] of mass[c]) out[f] = Math.log((m + alpha) / denom);
    return out;
  });

  return {
    v: MODEL_VERSION,
    alpha,
    classes,
    logPrior: priors.map((p) => Math.log(p / priorSum)),
    idf,
    logTheta,
    logThetaDefault: classes.map((_, c) => Math.log(alpha / (totals[c] + alpha * vocab))),
  };
}

export function predict(model: SerializedModel, features: string[]): Prediction {
  if (!model.classes.length) return null;
  const x = tfidfVector(features, model.idf);
  if (!x.size) return null; // nada conhecido: não chuta

  const scores = model.classes.map((_, c) => {
    let s = model.logPrior[c];
    const theta = model.logTheta[c];
    const def = model.logThetaDefault[c];
    for (const [f, w] of x) s += w * (theta[f] ?? def);
    return s;
  });
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  return { label: model.classes[best], confidence: exps[best] / sum };
}
