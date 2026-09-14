import cloudflareAdapter from '@sveltejs/adapter-cloudflare';
import nodeAdapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

/* A Node server (for Cloud Run, `node build`) by default; ADAPTER=cloudflare keeps the old
   Cloudflare Worker build for `npm run deploy` until that deploy is retired. */
const adapter = process.env.ADAPTER === 'cloudflare' ? cloudflareAdapter() : nodeAdapter();

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter
		})
	]
});
