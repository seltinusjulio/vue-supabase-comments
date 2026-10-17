import {
  addComponent,
  addImports,
  createResolver,
  defineNuxtModule,
} from "@nuxt/kit";

export interface CommentsModuleOptions {
  /** Add the default theme and component styles to the app. */
  css: boolean;
  /**
   * Prefix for the auto-registered components, e.g. "Pkg" gives
   * <PkgCommentSection>. Useful while the host still has components with
   * the same names.
   */
  prefix: string;
}

const COMPONENTS = [
  "CommentSection",
  "CommentNode",
  "CommentForm",
  "CommentModerationTable",
] as const;

/**
 * Optional Nuxt integration: registers the components, auto-imports the
 * composable and helpers, and adds the default styles. Tailwind scanning is
 * not configured here (see styles/comments.css).
 */
export default defineNuxtModule<CommentsModuleOptions>({
  meta: {
    name: "vue-supabase-comments",
    configKey: "comments",
  },
  defaults: {
    css: true,
    prefix: "",
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);

    for (const name of COMPONENTS) {
      void addComponent({
        name: `${options.prefix}${name}`,
        filePath: resolver.resolve(`./components/${name}.vue`),
      });
    }

    addImports([
      { name: "useCommentTree", from: resolver.resolve("./index") },
      { name: "resolveCommentMessages", from: resolver.resolve("./index") },
    ]);

    if (options.css) {
      nuxt.options.css.push(resolver.resolve("./styles/comments.css"));
    }
  },
});
