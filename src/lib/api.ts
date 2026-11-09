import { auth } from './firebase';

/**
 * fetch para a API do servidor, sempre com o token de login do Firebase.
 * `path` é relativo à base do app, ex.: 'api/search-book'.
 */
export async function authFetch(path: string, body: unknown): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Faça login para continuar.');
  return fetch(`${import.meta.env.BASE_URL}${path}`.replace('//', '/'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
}
