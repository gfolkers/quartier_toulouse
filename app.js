import { createMap } from './map.js';
import { buildSearchIndex, findBestMatch } from './matcher.js';

const resultContent = document.getElementById('result-content');
const statusBadge = document.getElementById('status-badge');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');

const mapController = createMap();

let searchIndex = [];

const STATUS_LABELS = {
  quartier: 'Quartier de Toulouse reconnu',
  commune: 'Commune reconnue',
  uncertain: 'Correspondance probable',
  error: 'Aucune correspondance fiable',
  neutral: 'En attente d’une recherche',
};

async function loadJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Erreur HTTP ${res.status} pour ${url}`);
  }
  return res.json();
}

async function bootstrap() {
  try {
    const [quartiers, communes, aliases] = await Promise.all([
      loadJson('./data/quartiers_toulouse.geojson'),
      loadJson('./data/communes_occitanie.geojson'),
      loadJson('./data/aliases.json'),
    ]);

    // Sécurisation : ajoute name_norm si absent
    for (const feature of quartiers.features) {
      if (!feature.properties.name_norm && feature.properties.name) {
        feature.properties.name_norm = feature.properties.name;
      }
    }

    for (const feature of communes.features) {
      if (!feature.properties.name_norm && feature.properties.name) {
        feature.properties.name_norm = feature.properties.name;
      }
    }

    searchIndex = buildSearchIndex(
      quartiers.features,
      communes.features,
      aliases,
    );

    setNeutralState(`
      <p><strong>${searchIndex.length}</strong> entités chargées.</p>
      <p>Exemples de test : <em>Rangueil</em>, <em>Muret</em>.</p>
    `);
  } catch (error) {
    console.error(error);
    setStatus('error');
    resultContent.innerHTML = `
      <p>Impossible de charger les données locales.</p>
      <p>Vérifie la présence des fichiers GeoJSON et JSON dans le dossier <code>data/</code>.</p>
    `;
  }
}

function setNeutralState(html) {
  setStatus('neutral');
  resultContent.innerHTML = html;
}

function setStatus(statusKey) {
  statusBadge.className = `status-badge ${statusKey}`;
  statusBadge.textContent = STATUS_LABELS[statusKey] ?? STATUS_LABELS.neutral;
}

function buildResultHtml(match) {
  const { entry, score, certainty, ambiguous, alternatives = [] } = match;
  const p = entry.feature.properties;

  const quality = certainty === 'exact'
    ? 'Correspondance exacte'
    : certainty === 'alias'
      ? 'Correspondance via alias'
      : `Correspondance floue (${Math.round(score * 100)} %)`;

  const lines = [`<p><strong>Saisie interprétée :</strong> ${entry.officialName}</p>`];

  if (p.type === 'quartier') {
    lines.push('<p><strong>Type :</strong> quartier de Toulouse</p>');
  } else {
    lines.push('<p><strong>Type :</strong> commune</p>');
  }

  lines.push(`<p><strong>Qualité du match :</strong> ${quality}</p>`);

  if (ambiguous && alternatives.length) {
    lines.push(`
      <p><strong>Alternative proche :</strong></p>
      <ul>${alternatives.map((item) => `<li>${item}</li>`).join('')}</ul>
    `);
  }

  return lines.join('');
}

function buildPopupHtml(match) {
  const { entry } = match;
  return `
    <div>
      <strong>${entry.officialName}</strong><br>
      <span>${entry.label.subtitle}</span>
    </div>
  `;
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const value = searchInput.value;
  const match = findBestMatch(value, searchIndex);

  if (!match.found) {
    setStatus('error');
    mapController.reset();

    const suggestions = (match.suggestions ?? []).length
      ? `<p><strong>Suggestions :</strong></p><ul>${match.suggestions.map((item) => `<li>${item}</li>`).join('')}</ul>`
      : '<p>Aucune suggestion suffisamment proche.</p>';

    resultContent.innerHTML = `
      <p>La saisie <strong>${escapeHtml(value)}</strong> ne correspond à aucun quartier ou aucune commune de manière fiable.</p>
      ${suggestions}
    `;
    return;
  }

  const status = match.ambiguous ? 'uncertain' : match.entry.label.status;
  setStatus(status);
  resultContent.innerHTML = buildResultHtml(match);
  mapController.focusFeature(match.entry.feature, buildPopupHtml(match));
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

bootstrap();
