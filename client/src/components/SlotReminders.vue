<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../api';
import { useSession } from '../stores/session';
import { formatSlot } from '../utils/slots';
import { spacedCode } from '../utils/reservations';

// In-app reminders for collection slots starting within 30 minutes (the server's /reservations/upcoming window),
// plus an optional browser notification while Surplate is open in a tab.
const session = useSession();
const items = ref([]);

// Browser storage is a convenience only: if it is unavailable, reminders simply show again.
function read(key) {
  try { return JSON.parse(localStorage.getItem(key)) ?? []; } catch { return []; }
}
function write(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list.slice(-200))); } catch { /* ignore */ }
}
const dismissed = ref(read('surplate:dismissed-reminders'));
const notified = read('surplate:notified-reminders');
const permission = ref(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

// Recipients get one reminder per reservation; bakery staff one per slot.
const reminders = computed(() => {
  if (!session.isBakery) {
    return items.value.map((r) => ({ key: r.id, link: '/reservations', linkText: 'My reservations',
      text: `Collect ${r.quantity} × ${r.itemName} from ${r.bakeryName}, ${formatSlot(r.slotStart, r.slotEnd)}.${r.code ? ` Your code: ${spacedCode(r.code)}.` : ''}` }));
  }
  const slots = new Map();
  for (const r of items.value) {
    const key = `slot:${r.slotStart}`;
    if (!slots.has(key)) slots.set(key, { key, start: r.slotStart, end: r.slotEnd, count: 0 });
    slots.get(key).count += 1;
  }
  return [...slots.values()].map((s) => ({ key: s.key, link: '/orders', linkText: 'Open orders',
    text: `${s.count} ${s.count === 1 ? 'order' : 'orders'} to hand over ${formatSlot(s.start, s.end)}.` }));
});
const visible = computed(() => reminders.value.filter((r) => !dismissed.value.includes(r.key)));

function notify() {
  if (permission.value !== 'granted') return;
  for (const r of reminders.value) {
    if (notified.includes(r.key)) continue;
    notified.push(r.key);
    write('surplate:notified-reminders', notified);
    try { new Notification('Surplate collection reminder', { body: r.text, tag: r.key }); } catch { /* some browsers only allow this from a service worker */ }
  }
}
async function load() {
  if (!session.user || session.isAdmin) { items.value = []; return; }
  try {
    items.value = (await api.get('/reservations/upcoming')).data.items;
    notify();
  } catch { /* reminders are best-effort; the next poll tries again */ }
}
async function enableNotifications() {
  permission.value = await Notification.requestPermission();
  notify();
}
function dismiss(key) {
  dismissed.value = [...dismissed.value, key];
  write('surplate:dismissed-reminders', dismissed.value);
}

watch(() => session.user?.id, load, { immediate: true });
const timer = setInterval(load, 60000);
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div v-if="visible.length" class="container-fluid px-3 px-lg-4 pt-3" aria-live="polite">
    <div v-for="r in visible" :key="r.key" class="alert alert-info d-flex align-items-start gap-2 mb-2 py-2" data-testid="slot-reminder">
      <i class="bi bi-alarm mt-1" aria-hidden="true"></i>
      <div class="me-auto d-flex flex-wrap align-items-center column-gap-2 row-gap-1">
        <span>{{ r.text }} <RouterLink :to="r.link" class="alert-link">{{ r.linkText }}</RouterLink></span>
        <button v-if="permission === 'default'" type="button" class="btn btn-sm btn-outline-primary" @click="enableNotifications">Notify me in this browser</button>
      </div>
      <button type="button" class="btn-close mt-1" aria-label="Dismiss reminder" @click="dismiss(r.key)"></button>
    </div>
  </div>
</template>
