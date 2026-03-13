const DEFAULT_VIEW = [43.6045, 1.444];
const DEFAULT_ZOOM = 11;

const STATUS_STYLES = {
  quartier: { color: '#6d28d9', fillOpacity: 0.16, weight: 3 },
  'commune-metro': { color: '#0f766e', fillOpacity: 0.12, weight: 3 },
  'commune-hors': { color: '#b45309', fillOpacity: 0.12, weight: 3 },
};

export function createMap() {
  const map = L.map('map', {
    zoomControl: true,
    preferCanvas: true,
  }).setView(DEFAULT_VIEW, DEFAULT_ZOOM);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const highlightLayer = L.geoJSON(null, {
    style: (feature) => STATUS_STYLES[getStatus(feature)] ?? STATUS_STYLES['commune-hors'],
  }).addTo(map);

  let marker = null;

  return {
    map,
    reset() {
      highlightLayer.clearLayers();
      if (marker) {
        map.removeLayer(marker);
        marker = null;
      }
      map.setView(DEFAULT_VIEW, DEFAULT_ZOOM);
    },
    focusFeature(feature, popupHtml) {
      highlightLayer.clearLayers();
      highlightLayer.addData(feature);

      if (marker) map.removeLayer(marker);

      const center = getFeatureCenter(feature);
      marker = L.circleMarker(center, {
        radius: 8,
        color: '#111827',
        weight: 2,
        fillColor: '#ffffff',
        fillOpacity: 1,
      }).addTo(map);

      if (popupHtml) {
        marker.bindPopup(popupHtml).openPopup();
      }

      const bounds = highlightLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.25));
      } else {
        map.setView(center, 13);
      }
    },
  };
}

function getStatus(feature) {
  const p = feature.properties;
  if (p.type === 'quartier') return 'quartier';
  return p.is_toulouse_metropole ? 'commune-metro' : 'commune-hors';
}

function getFeatureCenter(feature) {
  const layer = L.geoJSON(feature);
  const bounds = layer.getBounds();
  return bounds.getCenter();
}
