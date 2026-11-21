import { execSync } from 'node:child_process';

/**
 * Builds the site and serves it with `astro preview` (Astro 7 starts it in the
 * background and returns), then stops it when the run ends. Set E2E_SKIP_SERVER=1
 * to test against a server you already started.
 */
export default async function globalSetup() {
  if (process.env.E2E_SKIP_SERVER) return;
  const port = process.env.E2E_PORT ?? '4400';
  execSync('npx astro build', { stdio: 'ignore' });
  execSync(`npx astro preview --port ${port}`, { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/`)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return () => {
    try {
      execSync('npx astro preview stop', { stdio: 'ignore' });
    } catch {
      /* already stopped */
    }
  };
}
