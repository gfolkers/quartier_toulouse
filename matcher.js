import { normalizeText } from './normalize.js';

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[m][n];
}

function similarityScore(a, b) {
  if (!a || !b) return 0;
  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

function getStatusFromFeature(feature) {
  if (feature.properties.type === 'quartier') return 'quartier';
  return 'commune';
}

function buildLabel(feature) {
  const p = feature.properties;

  if (p.type === 'quartier') {
    return {
      title: p.name,
      subtitle: 'Quartier de Toulouse',
      status: 'quartier',
    };
  }

  return {
    title: p.name,
    subtitle: 'Commune',
    status: 'commune',
  };
}

export function buildSearchIndex(quartiersFeatures, communesFeatures, aliasMap) {
  const features = [...quartiersFeatures, ...communesFeatures];
  const entries = [];

  for (const feature of features) {
    const officialName = feature.properties.name;
    const normalizedOfficialName = normalizeText(
      feature.properties.name_norm || officialName
    );
    const aliases = aliasMap[normalizedOfficialName] ?? [];

    entries.push({
      feature,
      officialName,
      normalizedOfficialName,
      aliases: aliases.map((value) => normalizeText(value)),
      label: buildLabel(feature),
    });
  }

  return entries;
}

export function findBestMatch(input, index) {
  const normalizedInput = normalizeText(input);

  if (!normalizedInput) {
    return {
      found: false,
      reason: 'empty',
      normalizedInput,
    };
  }

  for (const entry of index) {
    if (entry.normalizedOfficialName === normalizedInput) {
      return {
        found: true,
        certainty: 'exact',
        score: 1,
        entry,
      };
    }
  }

  for (const entry of index) {
    if (entry.aliases.includes(normalizedInput)) {
      return {
        found: true,
        certainty: 'alias',
        score: 0.98,
        entry,
      };
    }
  }

  let best = null;
  let second = null;

  for (const entry of index) {
    const candidates = [entry.normalizedOfficialName, ...entry.aliases];
    let entryBestScore = 0;

    for (const candidate of candidates) {
      const score = similarityScore(normalizedInput, candidate);
      if (score > entryBestScore) entryBestScore = score;
    }

    const item = { entry, score: entryBestScore };
    if (!best || item.score > best.score) {
      second = best;
      best = item;
    } else if (!second || item.score > second.score) {
      second = item;
    }
  }

  if (!best || best.score < 0.72) {
    return {
      found: false,
      reason: 'no-match',
      normalizedInput,
      suggestions: [best, second]
        .filter(Boolean)
        .filter((item) => item.score >= 0.55)
        .map((item) => item.entry.officialName),
    };
  }

  const ambiguous = second && Math.abs(best.score - second.score) < 0.05;

  return {
    found: true,
    certainty: best.score >= 0.9 ? 'strong-fuzzy' : 'fuzzy',
    ambiguous,
    score: best.score,
    entry: best.entry,
    alternatives: ambiguous && second ? [second.entry.officialName] : [],
  };
}
