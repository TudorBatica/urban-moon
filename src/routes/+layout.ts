/* Every screen in this app is driven by browser state (localStorage answers, the plans
   store, IndexedDB blobs), so a server-rendered first paint is always a *different*
   screen than the one the user is on: it shows the flow with empty answers, the wrong
   rail and no restart button, and — the seam bug this fixes — it renders clickable
   tiles before hydration, so a fast tap on a freshly loaded `/?s=…` was silently lost.
   Rendering on the client only means the markup exists exactly when it is live. */
export const ssr = false;
