import { expect, test } from '@playwright/test';
import { chooseVenue, createUser, PASSWORD, signIn, uniqueEmail } from './support';

test('an organizer runs a race and a participant takes part, end to end', async ({ page, browser, request }) => {
  const organizer = await createUser(request, 'Olivia Organizer', 'Organizer');
  const title = `E2E 10K ${Date.now()}`;

  // ---- organizer: create the event, add a category, publish
  await signIn(page, organizer.email);
  await page.goto('/manage/events/new');
  await page.getByLabel(/^Title/).fill(title);
  await page.getByLabel('Description').fill('Created by the end-to-end test.');
  await page.getByLabel(/Date and start time/).fill('2099-05-20T18:30');
  await chooseVenue(page);
  await page.getByRole('button', { name: 'Create event' }).click();

  await expect(page).toHaveURL(/\/manage\/events\/\d+\/categories/);
  const eventId = page.url().match(/events\/(\d+)/)![1];
  await expect(page.getByRole('list', { name: 'Ready to publish?' })).toContainText('At least one category');

  await page.getByRole('button', { name: /Add (the first )?category/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add category' });
  await dialog.getByLabel(/^Name/).fill('10 km');
  await dialog.getByLabel(/Entry fee/).fill('150');
  await dialog.getByLabel(/Distance/).fill('10');
  await dialog.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByRole('table', { name: 'Categories' }).locator('strong', { hasText: '10 km' })).toBeVisible();

  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText('Event published.')).toBeVisible();

  // ---- participant: sign up through the UI, register for the race
  const runnerPage = await (await browser.newContext()).newPage();
  const runnerEmail = uniqueEmail('thandi');
  await runnerPage.goto('/register');
  await runnerPage.getByLabel(/Full name/).fill('Thandi Mokoena');
  await runnerPage.getByLabel('Email').fill(runnerEmail);
  await runnerPage.getByLabel(/^Password/).fill(PASSWORD);
  await runnerPage.getByRole('button', { name: 'Create account' }).click();
  await expect(runnerPage).toHaveURL('/');

  await runnerPage.goto(`/events/${eventId}`);
  await expect(runnerPage.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await runnerPage.getByRole('button', { name: 'Register for 10 km' }).click();
  await runnerPage.getByRole('dialog', { name: 'Confirm your registration' }).getByRole('button', { name: 'Register' }).click();

  const success = runnerPage.getByRole('dialog', { name: "You're registered!" });
  await expect(success).toBeVisible();
  const bib = (await success.getByLabel(/Race number/).innerText()).replace('#', '');
  await success.getByRole('link', { name: 'View my races' }).click();
  await expect(runnerPage.getByRole('link', { name: title })).toBeVisible();

  // ---- organizer: the registration shows up, mark it paid, record the finish time by bib
  await page.goto(`/manage/events/${eventId}/registrations`);
  await expect(page.getByText('Thandi Mokoena')).toBeVisible();
  await page.getByLabel('Payment status for Thandi Mokoena').selectOption('Paid');
  await expect(page.getByText(/1 paid or waived · 0 pending/)).toBeVisible();

  await page.goto(`/manage/events/${eventId}/results`);
  await page.getByLabel('Bib number').fill(bib);
  await expect(page.getByText(/Thandi Mokoena · 10 km/)).toBeVisible();
  await page.getByLabel('Finish time').fill('39:30');
  await page.getByLabel('Finish time').press('Enter');
  await expect(page.getByText(/Saved #\d+ Thandi Mokoena: 39:30/)).toBeVisible();
  await expect(page.getByRole('table', { name: 'Results' }).getByText('39:30')).toBeVisible();

  await page.goto(`/manage/events/${eventId}`);
  await page.getByRole('button', { name: 'Mark completed' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mark completed' }).click();
  await expect(page.getByText('Event marked as completed.')).toBeVisible();

  // ---- the public leaderboard and the participant's own results show the time
  await runnerPage.goto(`/events/${eventId}/results`);
  await expect(runnerPage.getByRole('list', { name: 'Podium' }).getByText('Thandi Mokoena')).toBeVisible();
  await expect(runnerPage.getByRole('table', { name: 'Results' }).getByText('39:30')).toBeVisible();

  await runnerPage.goto('/me/results');
  await expect(runnerPage.getByRole('table', { name: 'My results' }).getByText('1st')).toBeVisible();
  await expect(runnerPage.getByText('Races finished').locator('xpath=following-sibling::*[1]')).toHaveText('1');
});
