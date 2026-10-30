<script setup>
import { computed, ref } from 'vue';
import { Motion } from 'motion-v';
import { now } from '../composables/useNow';
import { LIMITS, initialOf, noteLook, timeAgo } from '../utils/reviews';
import StarRating from './StarRating.vue';

// One thank-you on the wall: a sticky note with a little tilt, tape, a pin when the bakery has pinned it, the
// star ratings, a "on behalf of" ribbon for charities and the bakery's reply. Bakery staff also get pin and
// reply controls. `preview` renders the same note inside the review form, without motion or controls.
const props = defineProps({
  note: { type: Object, required: true },
  manage: Boolean,
  pinsLeft: { type: Number, default: 0 },
  busy: Boolean,
  index: { type: Number, default: 0 }, // position in the wall: staggers the entrance
  preview: Boolean,
});
const emit = defineEmits(['pin', 'reply']);

const look = computed(() => noteLook(props.note.id));
const replying = ref(false);
const draft = ref('');
const replyError = ref('');
const canPin = computed(() => props.note.pinned || props.pinsLeft > 0);

function startReply() {
  draft.value = props.note.reply?.text ?? '';
  replyError.value = '';
  replying.value = true;
}
function sendReply() {
  const text = draft.value.trim();
  if (text.length > LIMITS.replyMax) {
    replyError.value = `Keep replies under ${LIMITS.replyMax} characters.`;
    return;
  }
  emit('reply', props.note, text, () => (replying.value = false));
}
</script>

<template>
  <component
    :is="preview ? 'div' : Motion"
    v-bind="preview ? {} : {
      initial: { opacity: 0, y: 26, scale: 0.95 },
      'while-in-view': { opacity: 1, y: 0, scale: 1 },
      'in-view-options': { once: true, amount: 0.1 },
      transition: { type: 'spring', stiffness: 230, damping: 22, delay: Math.min(index, 8) * 0.06 },
    }"
    class="note"
    :class="{ 'is-preview': preview }"
    data-testid="thank-you-note"
  >
    <article class="note-paper" :class="[`note-tone-${look.tone}`, { 'is-pinned': note.pinned }]" :style="{ '--tilt': preview ? '0deg' : `${look.tilt}deg` }">
      <span class="note-tape" aria-hidden="true"></span>
      <span v-if="note.pinned" class="note-pin" role="img" aria-label="Pinned by the bakery" data-testid="pinned-badge">📌</span>

      <div v-if="note.onBehalfOf" class="note-behalf" data-testid="on-behalf">
        <i class="bi bi-people-fill" aria-hidden="true"></i>
        On behalf of {{ note.onBehalfOf }}<template v-if="note.peopleServed"> · <strong>{{ note.peopleServed }} people</strong></template>
      </div>

      <p class="note-text" data-testid="note-text">{{ note.note }}</p>

      <div class="note-ratings">
        <span title="Food"><i class="bi bi-cup-hot-fill" aria-hidden="true"></i><span class="visually-hidden">Food</span><StarRating :model-value="note.foodRating" readonly size="sm" label="Food" /></span>
        <span title="Listing accuracy"><i class="bi bi-bullseye" aria-hidden="true"></i><span class="visually-hidden">Accuracy</span><StarRating :model-value="note.accuracyRating" readonly size="sm" label="Listing accuracy" /></span>
      </div>

      <footer class="note-foot">
        <span class="note-avatar" aria-hidden="true">{{ initialOf(note.nickname) }}</span>
        <span class="note-who">
          <strong>{{ note.nickname }}</strong><span v-if="note.mine" class="note-mine">you</span>
          <span class="note-meta">{{ note.itemName }} · {{ timeAgo(note.createdAt, now) }}</span>
        </span>
      </footer>

      <div v-if="note.reply" class="note-reply" data-testid="note-reply">
        <i class="bi bi-chat-heart-fill" aria-hidden="true"></i>
        <span><strong>Bakery:</strong> {{ note.reply.text }}</span>
      </div>

      <div v-if="manage && !preview" class="note-tools">
        <template v-if="!replying">
          <button type="button" class="btn btn-sm note-tool" :class="note.pinned ? 'is-active' : ''" :disabled="busy || !canPin" :title="canPin ? '' : 'Unpin another note first'" :aria-pressed="note.pinned" data-testid="pin-btn" @click="emit('pin', note, $event)">
            <i class="bi" :class="note.pinned ? 'bi-pin-angle-fill' : 'bi-pin-angle'" aria-hidden="true"></i> {{ note.pinned ? 'Unpin' : 'Pin' }}
          </button>
          <button type="button" class="btn btn-sm note-tool" :disabled="busy" data-testid="reply-btn" @click="startReply">
            <i class="bi bi-reply" aria-hidden="true"></i> {{ note.reply ? 'Edit reply' : 'Reply' }}
          </button>
        </template>
        <form v-else class="note-reply-form" novalidate @submit.prevent="sendReply">
          <label :for="`reply-${note.id}`" class="visually-hidden">Reply to {{ note.nickname }}</label>
          <textarea :id="`reply-${note.id}`" v-model="draft" class="form-control form-control-sm" :class="{ 'is-invalid': replyError }" rows="2" :maxlength="LIMITS.replyMax + 20" placeholder="e.g. See you tomorrow!"></textarea>
          <div class="d-flex justify-content-between align-items-center mt-1">
            <small :class="draft.length > LIMITS.replyMax ? 'text-danger' : 'text-body-secondary'">{{ draft.length }}/{{ LIMITS.replyMax }}</small>
            <span class="d-flex gap-1">
              <button type="button" class="btn btn-sm btn-outline-secondary" @click="replying = false">Cancel</button>
              <button class="btn btn-sm btn-primary" :disabled="busy" data-testid="send-reply">{{ draft.trim() ? 'Send' : 'Remove reply' }}</button>
            </span>
          </div>
          <div v-if="replyError" class="text-danger small">{{ replyError }}</div>
        </form>
      </div>
    </article>
  </component>
</template>
