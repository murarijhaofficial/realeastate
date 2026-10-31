import fs from 'node:fs/promises';
import path from 'node:path';

const configuredApiUrl = process.env.API_BASE_URL?.trim();
if (!configuredApiUrl) {
  throw new Error('API_BASE_URL must be set to the deployed HTTPS API origin before building the Vercel frontend.');
}

let apiUrl;
try {
  const parsedUrl = new URL(configuredApiUrl);
  if (parsedUrl.protocol !== 'https:' || parsedUrl.pathname !== '/' || parsedUrl.search || parsedUrl.hash) {
    throw new Error();
  }
  apiUrl = parsedUrl.origin;
} catch {
  throw new Error('API_BASE_URL must be an HTTPS origin without a path, query, or fragment.');
}

const publicDirectory = path.resolve('public');
const outputDirectory = path.resolve('dist');
await fs.cp(publicDirectory, outputDirectory, { recursive: true });
await fs.writeFile(
  path.join(outputDirectory, 'api-config.js'),
  `export const API_BASE_URL = ${JSON.stringify(apiUrl)};\n`,
);
console.log(`Built frontend in ${outputDirectory} for ${apiUrl}`);
