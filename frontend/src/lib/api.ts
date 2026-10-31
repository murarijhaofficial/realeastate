import type { User } from './types';

const baseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '') ?? '';
let token = localStorage.getItem('estatedesk.token') ?? '';

export function setToken(nextToken: string) { token = nextToken; nextToken ? localStorage.setItem('estatedesk.token', nextToken) : localStorage.removeItem('estatedesk.token'); }
export function isAuthorized() { return Boolean(token); }

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${baseUrl}/api/v1${path}`, { ...options, headers });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message ?? 'Something went wrong. Please try again.');
  return body.data as T;
}

export async function apiAsset(path: string): Promise<Blob> {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${baseUrl}${path}`, { headers });
  if (!response.ok) throw new Error('The project layout image could not be loaded.');
  return response.blob();
}

export async function login(email: string, password: string) {
  const result = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  setToken(result.token);
  return result.user;
}

export async function logout() { try { await api('/auth/logout', { method: 'POST' }); } finally { setToken(''); } }
