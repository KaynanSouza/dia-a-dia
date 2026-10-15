/**
 * Features esparsas: unigramas + bigramas de tokens. Sem features de valor: o dicionário (maior
 * parte do treino) não tem valores, e features presentes só nos exemplos do usuário enviesariam
 * a predição para essas classes.
 */
export function extractFeatures(tokens: string[]): string[] {
  const words = tokens.filter((t) => t.length >= 2 && !/^\d+$/.test(t));
  const feats: string[] = [...words];
  for (let i = 0; i < words.length - 1; i++) feats.push(`${words[i]}_${words[i + 1]}`);
  return feats;
}
