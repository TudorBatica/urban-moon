import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit({ compilerOptions: { runes: true } })],
	// `.svelte.ts` modules compile against Svelte's client runtime.
	resolve: { conditions: ['browser'] },
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts']
	}
});
