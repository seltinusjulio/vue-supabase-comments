import { addImports, createResolver, defineNuxtModule } from "@nuxt/kit";

export interface CommentsModuleOptions {
  /** Add the default theme (CSS custom properties) to the app. */
  css: boolean;
}

/**
 * Optional Nuxt integration: auto-imports the composable and helpers and adds
 * the default theme. Tailwind scanning is not configured here (see
 * styles/comments.css); components are registered once they exist.
 */
export default defineNuxtModule<CommentsModuleOptions>({
  meta: {
    name: "vue-supabase-comments",
    configKey: "comments",
  },
  defaults: {
    css: true,
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);

    addImports([
      { name: "useCommentTree", from: resolver.resolve("./index") },
      { name: "resolveCommentMessages", from: resolver.resolve("./index") },
    ]);

    if (options.css) {
      nuxt.options.css.push(resolver.resolve("./styles/comments.css"));
    }
  },
});
