import svelte from "rollup-plugin-svelte";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { terser } from "rollup-plugin-terser";
import sveltePreprocess from "svelte-preprocess";
import typescript from "@rollup/plugin-typescript";

const production = !process.env.ROLLUP_WATCH;

export default {
  input: "src/main.ts",
  output: {
    sourcemap: true,
    format: "iife",
    name: "app",
    file: "public/build/bundle.js"
  },
  plugins: [
    svelte({
      dev: !production,
      css: (css) => {
        css.write("bundle.css");
      },
      preprocess: sveltePreprocess()
    }),
    resolve({
      browser: true,
      dedupe: ["svelte"]
    }),
    commonjs(),
    typescript({
      sourceMap: !production,
      inlineSources: !production
    }),

    // Watch the `public` directory and refresh the
    // browser on changes when not in production
    // !production && livereload('public'),

    production && terser()
  ]
  // watch: {
  //   clearScreen: false
  // }
};
