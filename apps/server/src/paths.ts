import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const worldRoot = process.env.VIBEOS_WORLD_ROOT ?? fileURLToPath(new URL('../../../world', import.meta.url));
export const jobsRoot = process.env.VIBEOS_JOBS_ROOT ?? join(worldRoot, '.jobs');
