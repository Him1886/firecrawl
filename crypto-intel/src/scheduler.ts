/**
 * Minimal interval scheduler. Runs `task` immediately, then every
 * `intervalMinutes`. A failed run is logged and does NOT stop the loop — the
 * next interval still fires. This keeps a long-lived process resilient to
 * transient API/network errors.
 */
export async function runForever(
  task: () => Promise<void>,
  intervalMinutes: number,
): Promise<void> {
  const intervalMs = intervalMinutes * 60 * 1000;
  console.log(`[crypto-intel] starting loop, every ${intervalMinutes} min`);

  const tick = async (): Promise<void> => {
    try {
      await task();
    } catch (err) {
      console.error(
        "[crypto-intel] run failed (continuing):",
        err instanceof Error ? err.message : err,
      );
    }
  };

  await tick();
  await new Promise<never>(() => {
    setInterval(() => void tick(), intervalMs);
  });
}
