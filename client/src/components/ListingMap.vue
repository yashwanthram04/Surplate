<script setup>
import L from 'leaflet';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { SG_CENTER } from '../constants';

// Leaflet map of listings, grouped into one pin per pickup location. Tiles come from OneMap.
const props = defineProps({
  listings: { type: Array, default: () => [] }, // needs id, itemName, lat, lng, (bakery.name)
  highlightId: { type: String, default: null },
  center: { type: Object, default: null }, // { lat, lng } of the searcher (blue dot + radius)
  radiusKm: { type: Number, default: 0 },
  linkable: { type: Boolean, default: true }, // popups link to the listing detail page
  active: { type: Boolean, default: true }, // flips to true when a hidden map becomes visible
});

const router = useRouter();
const el = ref(null);
let map = null;
let pinLayer = null;
let centerLayer = null;
let lastFitKey = '';
const pins = new Map(); // listing id -> marker element, for highlighting

const ONEMAP_ATTRIBUTION =
  '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a> &copy; contributors | ' +
  '<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';

function popupFor(group) {
  const box = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = group[0].bakery?.name ?? group[0].itemName; // textContent: names are user-supplied
  box.append(title);
  const ul = document.createElement('ul');
  ul.className = 'list-unstyled mb-0 mt-1';
  for (const l of group) {
    const li = document.createElement('li');
    if (props.linkable && l.bakery) {
      const a = document.createElement('a');
      a.href = `/listings/${l.id}`;
      a.textContent = l.itemName;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        router.push({ name: 'listing', params: { id: l.id } });
      });
      li.append(a);
    } else {
      li.textContent = l.itemName;
    }
    ul.append(li);
  }
  box.append(ul);
  return box;
}

function drawListings() {
  pinLayer.clearLayers();
  pins.clear();
  const groups = new Map();
  for (const l of props.listings) {
    const key = `${l.lat.toFixed(5)},${l.lng.toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  for (const group of groups.values()) {
    const icon = L.divIcon({
      className: '',
      html: `<div class="pin"><span>${group.length > 1 ? group.length : ''}</span></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -32],
    });
    const marker = L.marker([group[0].lat, group[0].lng], { icon, title: group[0].bakery?.name ?? group[0].itemName, keyboard: true });
    marker.bindPopup(() => popupFor(group));
    marker.addTo(pinLayer);
    for (const l of group) pins.set(l.id, marker);
  }
  fitIfNeeded();
  applyHighlight();
}

function fitIfNeeded() {
  // Re-fit only when the set of listings changes, so the 60 s refresh doesn't undo the user's panning.
  const key = props.listings.map((l) => l.id).sort().join(',') + (props.center ? `|${props.center.lat},${props.center.lng}` : '');
  if (key === lastFitKey) return;
  lastFitKey = key;
  const points = props.listings.map((l) => [l.lat, l.lng]);
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
    L.circle([props.center.lat, props.center.lng], {
      radius: props.radiusKm * 1000,
      color: '#2563eb',
      weight: 1,
      fillOpacity: 0.05,
      interactive: false,
    }).addTo(centerLayer);
  }
}

function applyHighlight() {
  for (const [id, marker] of pins) {
    const node = marker.getElement()?.querySelector('.pin');
    node?.classList.toggle('is-highlighted', id === props.highlightId);
    if (id === props.highlightId) marker.setZIndexOffset(1000);
    else marker.setZIndexOffset(0);
  }
}

onMounted(() => {
  // zoomAnimation off: a zoom animation still running when the map is destroyed (route change) throws inside Leaflet.
  map = L.map(el.value, { center: SG_CENTER, zoom: 12, minZoom: 10, maxZoom: 19, scrollWheelZoom: true, zoomAnimation: false });
  L.tileLayer('https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: ONEMAP_ATTRIBUTION,
  }).addTo(map);
  pinLayer = L.layerGroup().addTo(map);
  centerLayer = L.layerGroup().addTo(map);
  drawCenter();
  drawListings();
});
onBeforeUnmount(() => map?.remove());

watch(() => props.listings, () => map && drawListings());
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
    lastFitKey = ''; // the first fit was computed at size 0, so fit again now that it is visible
    fitIfNeeded();
  }, 0);
});
</script>

<template>
  <div ref="el" class="map-box" role="region" aria-label="Map of available food pickups" data-testid="listing-map"></div>
</template>
