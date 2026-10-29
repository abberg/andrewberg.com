import type { Samples } from '../extract/compact';
import type { SnakeFrame, WorkerMessage } from '../worker';
import type { Params } from './params';

// The main thread's side of the snake Worker. Sends samples only while the
// Worker is idle, always the newest, so a slow frame can't build a queue; the
// Worker scales velocities by the frame gap it sees.
export function createSnakeClient() {
  const worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
  let busy = false;
  let pending: Samples | null = null;
  let latest: SnakeFrame | null = null;

  const send = (samples: Samples) => {
    busy = true;
    const message: WorkerMessage = { type: 'samples', samples };
    // Copied, not transferred: the debug overlay still draws these samples.
    worker.postMessage(message);
  };
  worker.onmessage = (event: MessageEvent<SnakeFrame>) => {
    latest = event.data;
    busy = false;
    if (pending) { send(pending); pending = null; }
  };

  return {
    push(samples: Samples) {
      if (busy) pending = samples;
      else send(samples);
    },
    setParams(params: Partial<Params>) {
      const message: WorkerMessage = { type: 'params', params };
      worker.postMessage(message);
    },
    reset() {
      pending = null;
      const message: WorkerMessage = { type: 'reset' };
      worker.postMessage(message);
    },
    get latest() { return latest; },
  };
}
