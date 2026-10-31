import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceDirectory = path.resolve(backendDirectory, '..');

dotenv.config({ path: path.join(workspaceDirectory, '.env') });
