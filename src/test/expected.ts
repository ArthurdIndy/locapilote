import expected from '../../data/expected.json';

type YearlyLine = Record<string, number | null>;

/** Lit une ligne de la synthèse annuelle de `data/expected.json` (valeurs en euros). */
export function expectedSynthesisLine(label: string): YearlyLine {
  const line = (expected.synthese as Record<string, YearlyLine>)[label];
  if (line === undefined) throw new Error(`Ligne absente de expected.json : « ${label} »`);
  return line;
}
