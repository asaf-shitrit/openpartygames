// Playwright global setup: build the web app, reset the local D1, then start
// the real Worker (`wrangler dev`) and wait for it to answer /api/health.
// Teardown kills the detached process group, so no wrangler is left behind.

import {
  prepareState,
  prepareWeb,
  startServer,
  stopServer,
  waitForHealth,
} from "./server";

export default async function setup(): Promise<() => Promise<void>> {
  prepareWeb();
  prepareState();

  const server = startServer();
  await waitForHealth(server.exit);

  return async () => {
    await stopServer(server.pid, server.exit);
  };
}
