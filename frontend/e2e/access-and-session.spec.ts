import { expect, test } from '@playwright/test';
import { chooseVenue, createUser, PASSWORD, signIn } from './support';

test('anonymous visitors are sent to sign in, and come back afterwards', async ({ page, request }) => {
  const user = await createUser(request, 'Pat Participant');

  await page.goto('/me/registrations');
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page).toHaveURL(/\/me\/registrations/);
  await expect(page.getByRole('heading', { name: 'My RaceDay' })).toBeVisible();
});

test('participants cannot reach the organizer area', async ({ page, request }) => {
  const user = await createUser(request, 'Quinn Participant');
  await signIn(page, user.email);

  await expect(page.getByRole('link', { name: 'Manage' })).toHaveCount(0);
  await page.goto('/manage');
  await expect(page).toHaveURL(/\/forbidden/);
  await expect(page.getByText('You do not have access')).toBeVisible();
});

test('an organizer cannot even see another organizer\'s draft event', async ({ page, browser, request }) => {
  const owner = await createUser(request, 'Owner Organizer', 'Organizer');
  const other = await createUser(request, 'Other Organizer', 'Organizer');

  const ownerPage = await (await browser.newContext()).newPage();
  await signIn(ownerPage, owner.email);
  await ownerPage.goto('/manage/events/new');
  await ownerPage.getByLabel(/^Title/).fill(`Private ${Date.now()}`);
  await ownerPage.getByLabel(/Date and start time/).fill('2099-06-01T08:00');
  await chooseVenue(ownerPage);
  await ownerPage.getByRole('button', { name: 'Create event' }).click();
  await expect(ownerPage).toHaveURL(/\/manage\/events\/\d+\/categories/);
  const eventPath = new URL(ownerPage.url()).pathname.replace('/categories', '');

  await signIn(page, other.email);
  await page.goto(eventPath);
  // drafts are private: the server answers 404, so the page does not reveal that the event exists
  await expect(page.getByRole('heading', { name: 'Event not found' })).toBeVisible();
  await expect(page.getByText(/Private \d+/)).toHaveCount(0);
});

test('the session survives a reload, and signing out ends it', async ({ page, request }) => {
  const user = await createUser(request, 'Riley Participant');
  await signIn(page, user.email);

  await page.goto('/me/profile');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();

  await page.locator('button[aria-haspopup="true"]').click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Join' })).toBeVisible();

  await page.goto('/me/profile');
  await expect(page).toHaveURL(/\/login/);
});

test('changing the password signs the user out and the old password stops working', async ({ page, request }) => {
  const user = await createUser(request, 'Sam Participant');
  await signIn(page, user.email);

  await page.goto('/me/profile');
  await page.getByLabel('Current password').fill(PASSWORD);
  await page.getByLabel('New password', { exact: true }).fill('BrandNew456');
  await page.getByLabel('Confirm new password').fill('BrandNew456');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page.getByRole('alert')).toContainText('Invalid email or password');

  await page.getByLabel(/^Password/).fill('BrandNew456');
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page).not.toHaveURL(/\/login/);
});
