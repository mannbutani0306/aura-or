import 'dotenv/config';
import { startServer } from './server/app';

void startServer().catch((error: unknown) => {
  console.error('Failed to start AURA server:', error);
  process.exitCode = 1;
});