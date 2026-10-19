import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { expect, type Page, type TestInfo } from "@playwright/test";

const ROOT = resolve(process.cwd(), "artifacts/visual-review");

export async function captureScreen(
  page: Page,
  info: TestInfo,
  mode: "demo" | "api",
  screen: string,
  pageErrors: string[] = [],
) {
  await expect(page.locator("#root")).not.toBeEmpty();
  await page.evaluate(async () => { await document.fonts.ready; });
  const dir = resolve(ROOT, mode, info.project.name);
  const filename = screen + ".png";
  const imageFile = resolve(dir, filename);
  mkdirSync(dirname(imageFile), { recursive: true });

  // Always capture before asserting layout so failed screens remain inspectable.
  await page.screenshot({
    path: imageFile,
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });

  const measurements = await page.evaluate(() => {
    const documentWidth = document.documentElement.scrollWidth;
    const viewportWidth = document.documentElement.clientWidth;
    const brokenImages = Array.from(document.images)
      .filter((item) => item.complete && item.naturalWidth === 0)
      .map((item) => item.getAttribute("alt") || item.getAttribute("src") || "unnamed image")
      .slice(0, 10);
    return {
      heading: document.querySelector("h1, h2")?.textContent?.trim() || "(sem título)",
      viewportWidth,
      documentWidth,
      overflowPx: Math.max(0, documentWidth - viewportWidth),
      brokenImages,
    };
  });

  const manifest = {
    mode,
    screen,
    viewport: info.project.name,
    urlPath: new URL(page.url()).pathname,
    ...measurements,
    pageErrors: [...pageErrors],
    image: relative(ROOT, imageFile).replaceAll("\\", "/"),
  };
  writeFileSync(resolve(dir, screen + ".json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await info.attach(screen + " (" + info.project.name + ")", {
    path: imageFile,
    contentType: "image/png",
  });
  console.log(
    "[visual] " + mode + "/" + info.project.name + "/" + screen +
    " | overflow=" + manifest.overflowPx + "px | pageErrors=" + pageErrors.length,
  );
  expect(pageErrors, "Erro JavaScript na tela " + screen).toEqual([]);
  expect(measurements.overflowPx, "Overflow horizontal na tela " + screen).toBeLessThanOrEqual(8);
  expect(measurements.brokenImages, "Imagens quebradas na tela " + screen).toEqual([]);
}

export function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}
