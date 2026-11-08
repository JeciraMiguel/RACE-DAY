import { expect, type APIRequestContext, type Page } from '@playwright/test';

const API = `http://localhost:${process.env.E2E_API_PORT ?? '5600'}/api`;

export const PASSWORD = 'Password123!';

/** A unique, valid email so tests never collide on the shared database. */
export const uniqueEmail = (label: string) => `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.raceday.test`;

async function post<T>(request: APIRequestContext, path: string, data: unknown, token?: string): Promise<T> {
  const response = await request.post(`${API}${path}`, { data, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  expect(response.ok(), `${path} -> ${response.status()} ${await response.text()}`).toBeTruthy();
  return (response.status() === 204 ? undefined : await response.json()) as T;
}

export async function adminToken(request: APIRequestContext): Promise<string> {
  return (await post<{ token: string }>(request, '/auth/login', { email: 'admin@raceday.local', password: 'Admin#12345' })).token;
}

/** Registers a user through the API; optionally promotes them (needs the admin token). */
export async function createUser(request: APIRequestContext, name: string, role?: 'Organizer' | 'Admin') {
  const email = uniqueEmail(name.toLowerCase().replace(/\W+/g, ''));
  await post(request, '/auth/register', { fullName: name, email, password: PASSWORD, dateOfBirth: '1990-05-17', gender: 'Female' });

  if (role) {
    const admin = await adminToken(request);
    const found = await (await request.get(`${API}/users?search=${encodeURIComponent(email)}`, { headers: { Authorization: `Bearer ${admin}` } })).json();
    await request.put(`${API}/users/${found.items[0].userId}/role`, { data: { role }, headers: { Authorization: `Bearer ${admin}` } });
  }
  return { email, name };
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page).not.toHaveURL(/\/login/);
}


/** Picks the seeded venue once the venue list has loaded. */
export async function chooseVenue(page: Page) {
  const select = page.getByLabel(/^Venue/);
  await expect(select.locator('option', { hasText: 'Cape Town Stadium' })).toBeAttached();
  await select.selectOption({ label: 'Cape Town Stadium' });
}
