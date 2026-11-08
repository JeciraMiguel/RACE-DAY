// Starts the API for the e2e run on a fresh SQLite file (Playwright's webServer launches this).
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = process.env.E2E_API_PORT ?? '5600';
const db = join(tmpdir(), `raceday-e2e-${port}.db`);
for (const file of [db, `${db}-shm`, `${db}-wal`]) if (existsSync(file)) rmSync(file);

const child = spawn('dotnet', ['run', '--project', '../RaceDayApi.Server', '--no-launch-profile'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ASPNETCORE_ENVIRONMENT: 'Development',
    ASPNETCORE_URLS: `http://localhost:${port}`,
    ConnectionStrings__DefaultConnection: `Data Source=${db}`,
    // e2e creates many accounts and signs in quickly from one address
    RateLimit__AuthPerMinute: '100000',
    // banner uploads are covered by the API tests; keep e2e independent of a storage emulator
    Seed__AdminEmail: 'admin@raceday.local',
    Seed__AdminPassword: 'Admin#12345',
  },
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
