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
  // Actions may scroll the page to focused controls. Reset before a full-page
  // screenshot so sticky headers are not painted halfway down the image.
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(80);
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
    const horizontalScrollRegions = Array.from(document.querySelectorAll<HTMLElement>("*"))
      .filter((element) => {
        const style = getComputedStyle(element);
        return (style.overflowX === "auto" || style.overflowX === "scroll") &&
          element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 20;
      })
      .map((element) => ({
        element: element.tagName.toLowerCase(),
        className: typeof element.className === "string" ? element.className.slice(0, 90) : "",
        hiddenWidthPx: element.scrollWidth - element.clientWidth,
      }))
      .slice(0, 10);
    return {
      horizontalScrollRegions,
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
    " | overflow=" + manifest.overflowPx + "px | inner-scroll=" + measurements.horizontalScrollRegions.length + " | pageErrors=" + pageErrors.length,
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
