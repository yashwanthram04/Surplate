import { reactive, ref } from 'vue';

/**
 * Shared form-error behaviour:
 *  - client-side rule messages only appear after the first submit attempt, then update live
 *    (showing them on blur moves the layout under the user's mouse and can swallow the Submit click);
 *  - a message from the server (e.g. "email already registered") stays until that field is edited.
 */
export function useFormErrors(form, clientErrors) {
  const submitted = ref(false);
  const server = reactive({});
  const snapshot = (field) => JSON.stringify(form[field]);

  const err = (field) => {
    const s = server[field];
    if (s && s.at === snapshot(field)) return s.message;
    return submitted.value ? clientErrors.value[field] || '' : '';
  };
  const setServer = (fields) => {
    for (const [field, message] of Object.entries(fields)) server[field] = { message, at: snapshot(field) };
  };
  const cls = (field) => ({ 'is-invalid': !!err(field) });
  const hasClientErrors = () => Object.keys(clientErrors.value).length > 0;

  return { submitted, err, cls, setServer, hasClientErrors };
}
