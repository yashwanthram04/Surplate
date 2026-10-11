import { ref } from 'vue';

// One shared clock for every countdown on the page (one timer instead of one per card).
export const now = ref(Date.now());
setInterval(() => {
  now.value = Date.now();
}, 1000);
