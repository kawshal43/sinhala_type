import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

      // Ship the platform-specific FFmpeg binary installed on the build host.
      // Windows and macOS releases should be built on their matching platform.
      const ffmpegPackagePath = resolve(
        "node_modules",
        "ffmpeg-static",
        process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
      );
      if (existsSync(ffmpegPackagePath)) {
        const binDirectory = resolve(outputDirectory, "bin");
        mkdirSync(binDirectory, { recursive: true });
        copyFileSync(
          ffmpegPackagePath,
          resolve(binDirectory, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg")
        );
      }

      // Copy JSX host scripts
      const jsxSource = resolve("cep", "AutoCap", "jsx");
      if (existsSync(jsxSource)) {
        const jsxDest = resolve(outputDirectory, "jsx");
        mkdirSync(jsxDest, { recursive: true });
        cpSync(jsxSource, jsxDest, { recursive: true, force: true });
      }

      // Copy bundled assets (AutoCapCaption.mogrt and fonts)
      const assetsSource = resolve("cep", "AutoCap", "assets");
      if (existsSync(assetsSource)) {
        const assetsDest = resolve(outputDirectory, "assets");
        mkdirSync(assetsDest, { recursive: true });
        cpSync(assetsSource, assetsDest, { recursive: true, force: true });
      }
      const fontsSource = resolve("cep", "AutoCap", "assets", "fonts");
      if (existsSync(fontsSource)) {
        const fontsDest = resolve(outputDirectory, "fonts");
        mkdirSync(fontsDest, { recursive: true });
        cpSync(fontsSource, fontsDest, { recursive: true, force: true });
      }

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
