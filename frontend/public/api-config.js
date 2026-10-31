// Vite injects this value into the booking page HTML. Public assets are copied
// as-is, so the page provides their runtime configuration.
export const API_BASE_URL = String(globalThis.ESTATEDESK_API_BASE_URL ?? '').replace(/\/+$/, '');
