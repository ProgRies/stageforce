import {defineConfig} from 'vite';
// Two pages from one project: the desktop CRM at / and the phone app at /m/. Each has its own entry, so neither changes the other.
export default defineConfig({build:{rollupOptions:{input:{main:'index.html',mobile:'m/index.html'}}}});
