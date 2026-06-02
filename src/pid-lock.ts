import fs from 'fs';
import path from 'path';

import { DATA_DIR } from './config.js';
import { log } from './log.js';

const LOCK_PATH = path.join(DATA_DIR, 'nanoclaw.pid');

/**
 * Attempt to acquire the single-instance lock.
 *
 * Uses exclusive file creation (`wx`) to avoid TOCTOU races between two
 * near-simultaneous starts. Returns true if this process is now the lock
 * owner. Returns false if a live peer is already running — the caller must
 * NOT proceed to cleanupOrphans(); it should sleep briefly then exit(0)
 * without writing circuit-breaker state (this is not a crash).
 *
 * Stale locks (the PID in the file is dead) are taken over automatically.
 *
 * Known limitation: if this process is hard-killed (SIGKILL), releasePidLock()
 * never runs, leaving a stale file. The next startup detects the stale PID and
 * takes over, UNLESS the OS reused that PID number for an unrelated process in
 * the meantime. In that unlikely case, startup is incorrectly blocked; deleting
 * data/nanoclaw.pid manually recovers the situation.
 */
export function acquirePidLock(): boolean {
  // DATA_DIR may not exist yet on first run (initDb creates it).
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Fast path: exclusive create — if it succeeds, we're the first instance.
  try {
    const fd = fs.openSync(LOCK_PATH, 'wx');
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
  }

  // Lock file exists — check if the holder is still alive.
  try {
    const existing = fs.readFileSync(LOCK_PATH, 'utf-8').trim();
    const pid = parseInt(existing, 10);
    if (!isNaN(pid) && pid !== process.pid) {
      try {
        process.kill(pid, 0); // throws ESRCH if the process doesn't exist
        log.warn('Another NanoClaw instance is already running — standing by', { pid });
        return false;
      } catch {
        // ESRCH: process is gone — stale lock, fall through to take over.
        log.info('Stale PID lock detected, taking over', { stalePid: pid });
      }
    }
  } catch {
    // Unreadable or corrupt lock file — treat as stale.
  }

  // Stale lock: overwrite with our PID.
  fs.writeFileSync(LOCK_PATH, String(process.pid));
  return true;
}

/** Release the lock on graceful shutdown. */
export function releasePidLock(): void {
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch {}
}
