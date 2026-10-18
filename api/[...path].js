import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const { app } = require('../.server-build/vercel-app.cjs');

export default function handler(request, response) {
  app(request, response);
}
