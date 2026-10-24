import {defineConfig} from '@playwright/test';
const baseURL=process.env.PLAYWRIGHT_BASE_URL||'http://127.0.0.1:3000';
export default defineConfig({testDir:'./tests/browser',fullyParallel:false,use:{baseURL,headless:true,launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--no-sandbox']}},webServer:{command:'npm run start -- --port '+(new URL(baseURL).port||'3000'),url:baseURL,reuseExistingServer:true},reporter:'list'});
