import { fileURLToPath } from 'node:url';

export const worldRoot = process.env.VIBEOS_WORLD_ROOT ?? fileURLToPath(new URL('../../../world', import.meta.url));
