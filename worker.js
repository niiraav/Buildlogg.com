// Minimal Worker for static assets — passes all requests to the ASSETS binding
// This is required by Cloudflare Workers Builds even for pure static sites
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
