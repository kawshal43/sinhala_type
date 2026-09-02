import { copyFileSync, cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

function premiereUxpBundle(): Plugin {
  return {
    name: "premiere-uxp-bundle",
    apply: "build",
    closeBundle() {
      const outputDirectory = resolve("dist");
      // Converter releases must never include generated motion-graphics assets.
      rmSync(resolve(outputDirectory, "mogrt"), { recursive: true, force: true });
      const htmlPath = resolve(outputDirectory, "index.html");
      const html = readFileSync(htmlPath, "utf8")
        .replace(/<script type="module" crossorigin src=/g, "<script defer src=");

      writeFileSync(htmlPath, html, "utf8");
      copyFileSync(resolve("manifest.json"), resolve(outputDirectory, "manifest.json"));
      const cepOutputDirectory = resolve("cep", "AutoCap", "dist");
      rmSync(cepOutputDirectory, { recursive: true, force: true });
      cpSync(outputDirectory, cepOutputDirectory, { recursive: true, force: true });
    }
  };
}

export default defineConfig({
  base: "./",
  plugins: [premiereUxpBundle()],
  build: {
    target: "es2018",
    outDir: "dist",
    rollupOptions: { output: { format: "iife", inlineDynamicImports: true } }
  },
  test: { environment: "node" }
});
