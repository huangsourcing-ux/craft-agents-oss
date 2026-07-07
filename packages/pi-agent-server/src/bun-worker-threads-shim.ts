import { createRequire } from 'node:module';

// Bun 1.3.x does not expose worker_threads.markAsUncloneable, but recent
// undici versions expect it during module initialization. Pi agent runs as a
// Bun subprocess, so install a no-op fallback before importing the Pi SDK.
const require = createRequire(import.meta.url);

try {
  const workerThreads = require('node:worker_threads') as {
    markAsUncloneable?: (value: unknown) => void;
  };
  if (typeof workerThreads.markAsUncloneable !== 'function') {
    workerThreads.markAsUncloneable = () => {};
  }
} catch {
  // If the runtime does not provide worker_threads, downstream code will report
  // the real failure. This shim is only meant to fill Bun's missing method.
}
