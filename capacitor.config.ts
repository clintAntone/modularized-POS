import type { CapacitorConfig } from '@capacitor/cli';
import * as dotenv from 'dotenv';

dotenv.config();

const config: CapacitorConfig = {
  appId: process.env.CAPACITOR_APP_ID || 'com.hilotcenter.pos',
  appName: process.env.CAPACITOR_APP_NAME || 'Point-Of-Sales (HC)',
  webDir: process.env.CAPACITOR_WEB_DIR || 'dist'
};

export default config;
