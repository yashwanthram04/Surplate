<script setup>
import L from 'leaflet';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { SG_CENTER } from '../constants';
import { statusMeta, timeAgo } from '../utils/fridge';
import '../fridges.css';

// Leaflet map of community fridges: one pin each, coloured by its latest status. Tiles come from OneMap.
// Modelled on ListingMap.vue.
const props = defineProps({
  fridges: { type: Array, default: () => [] }, // needs id, name, lat, lng, latestStatus, latestUpdateAt
  highlightId: { type: String, default: null },
  center: { type: Object, default: null }, // { lat, lng } of the searcher (blue dot + radius)
  radiusKm: { type: Number, default: 0 },
  linkable: { type: Boolean, default: true }, // popups link to the fridge page
  active: { type: Boolean, default: true }, // flips to true when a hidden map becomes visible
});

const router = useRouter();
const el = ref(null);
let map = null;
let pinLayer = null;
let centerLayer = null;
let lastFitKey = '';
const pins = new Map(); // fridge id -> marker, for highlighting

const ONEMAP_ATTRIBUTION =
  '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a> &copy; contributors | ' +
  '<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';

function popupFor(f) {
  const box = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = f.name; // textContent: names are user-supplied
  box.append(title);

  const status = document.createElement('div');
  status.className = 'fridge-popup-badge mt-1';
  status.textContent = statusMeta(f.latestStatus).label;
  box.append(status);

  const when = document.createElement('div');
  when.className = 'small text-body-secondary';
  when.textContent = f.latestUpdateAt ? `Updated ${timeAgo(f.latestUpdateAt)}` : 'Nobody has posted an update yet';
  box.append(when);

  if (props.linkable) {
    const a = document.createElement('a');
    a.href = `/fridges/${f.id}`;
    a.className = 'd-inline-block mt-1';
    a.textContent = 'See details';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      router.push({ name: 'fridge', params: { id: f.id } });
    });
    box.append(a);
  }
  return box;
}

function drawFridges() {
  pinLayer.clearLayers();
  pins.clear();
  for (const f of props.fridges) {
    const status = f.latestStatus ?? 'unknown';
    const icon = L.divIcon({
      className: '',
      html: `<div class="pin fridge-pin status-${status}"><span>${statusMeta(status).glyph}</span></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -32],
    });
    const marker = L.marker([f.lat, f.lng], { icon, title: `${f.name}: ${statusMeta(status).label}`, keyboard: true });
    marker.bindPopup(() => popupFor(f));
    marker.addTo(pinLayer);
    pins.set(f.id, marker);
  }
  fitIfNeeded();
  applyHighlight();
}

function fitIfNeeded() {
  // Re-fit only when the set of fridges changes, so the 60 s refresh doesn't undo the user's panning.
  const key = props.fridges.map((f) => f.id).sort().join(',') + (props.center ? `|${props.center.lat},${props.center.lng}` : '');
  if (key === lastFitKey) return;
  lastFitKey = key;
  const points = props.fridges.map((f) => [f.lat, f.lng]);
  if (props.center) points.push([props.center.lat, props.center.lng]);
  if (points.length === 1) map.setView(points[0], 16);
  else if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
}

function drawCenter() {
  centerLayer.clearLayers();
  if (!props.center) return;
  const icon = L.divIcon({ className: '', html: '<div class="user-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
  L.marker([props.center.lat, props.center.lng], { icon, interactive: false, keyboard: false }).addTo(centerLayer);
  if (props.radiusKm > 0) {
    L.circle([props.center.lat, props.center.lng], { radius: props.radiusKm * 1000, color: '#2563eb', weight: 1, fillOpacity: 0.05, interactive: false }).addTo(centerLayer);
  }
}

function applyHighlight() {
  for (const [id, marker] of pins) {
    marker.getElement()?.querySelector('.pin')?.classList.toggle('is-highlighted', id === props.highlightId);
    marker.setZIndexOffset(id === props.highlightId ? 1000 : 0);
  }
}

onMounted(() => {
  // zoomAnimation off: a zoom animation still running when the map is destroyed (route change) throws inside Leaflet.
  map = L.map(el.value, { center: SG_CENTER, zoom: 12, minZoom: 10, maxZoom: 19, scrollWheelZoom: true, zoomAnimation: false });
  L.tileLayer('https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png', { maxZoom: 19, attribution: ONEMAP_ATTRIBUTION }).addTo(map);
  pinLayer = L.layerGroup().addTo(map);
  centerLayer = L.layerGroup().addTo(map);
  drawCenter();
  drawFridges();
});
onBeforeUnmount(() => map?.remove());

watch(() => props.fridges, () => map && drawFridges());
watch(() => [props.center, props.radiusKm], () => {
  if (!map) return;
  drawCenter();
  fitIfNeeded();
});
watch(() => props.highlightId, applyHighlight);
// A map created inside a hidden tab has size 0; recompute once it's shown.
watch(() => props.active, (a) => {
  if (!a || !map) return;
  setTimeout(() => {
    map.invalidateSize();
    lastFitKey = '';
    fitIfNeeded();
  }, 0);
});
</script>

<template>
  <div ref="el" class="map-box" role="region" aria-label="Map of community fridges" data-testid="fridge-map"></div>
</template>
