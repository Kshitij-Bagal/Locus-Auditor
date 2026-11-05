/**
 * Utility helpers for Manager Name Normalization and Fuzzy/Phonetic Matching
 * Supports cross-system variations (e.g. Vishal vs Vishal Vishal, Sachin Chaudhary vs Sachin Choudhary)
 */

export function normalizeManagerName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '')
    .replace(/chaudhary|choudhary|choudhari/g, 'choudhary')
    .replace(/santhosh|santosh/g, 'santosh')
    .replace(/gerg|garg/g, 'garg');
}

export function matchManagerName(nameA, nameB) {
  if (!nameA || !nameB) return false;
  if (nameA === 'ALL' || nameB === 'ALL') return true;
  const rawA = String(nameA).toLowerCase().trim();
  const rawB = String(nameB).toLowerCase().trim();
  if (rawA === rawB || rawA.includes(rawB) || rawB.includes(rawA)) return true;

  const normA = normalizeManagerName(nameA);
  const normB = normalizeManagerName(nameB);
  if (normA && normB && (normA === normB || normA.includes(normB) || normB.includes(normA))) {
    return true;
  }

  // Token matching for tokens of length >= 3
  const tokensA = String(nameA).toLowerCase().split(/[\s,.-]+/).filter(t => t.length >= 3);
  const tokensB = String(nameB).toLowerCase().split(/[\s,.-]+/).filter(t => t.length >= 3);
  for (const ta of tokensA) {
    for (const tb of tokensB) {
      const nta = normalizeManagerName(ta);
      const ntb = normalizeManagerName(tb);
      if (nta === ntb || (nta.length >= 4 && ntb.length >= 4 && (nta.includes(ntb) || ntb.includes(nta)))) {
        return true;
      }
    }
  }

  return false;
}
