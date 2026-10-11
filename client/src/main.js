import { createPinia } from 'pinia';
import { createApp } from 'vue';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import 'leaflet/dist/leaflet.css';
import App from './App.vue';
import router from './router';
import { useSession } from './stores/session';
import './style.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
useSession().init(); // loads the demo accounts; views wait for `session.ready`
app.mount('#app');
