import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const design = JSON.parse(
  (await readFile(new URL("DESIGN.md", root), "utf8")).split("---")[1],
);
const lines = [
  "/* Generated from DESIGN.md. Run npm run tokens:generate. */",
  ":root {",
];
for (const [key, value] of Object.entries(design.colors))
  lines.push(`  --color-${key}: ${value};`);
for (const [key, value] of Object.entries(design.typography))
  lines.push(`  --font-${key}: ${value.fontFamily};`);
for (const [key, value] of Object.entries(design.rounded))
  lines.push(`  --radius-${key}: ${value};`);
for (const [key, value] of Object.entries(design.spacing))
  lines.push(`  --space-${key}: ${value};`);
lines.push("}", "");
const css = lines.join("\n");
const target = new URL("src/styles/tokens.generated.css", root);
if (process.argv.includes("--check")) {
  if ((await readFile(target, "utf8")) !== css)
    throw new Error("Tokens divergentes. Execute npm run tokens:generate.");
} else await writeFile(target, css);
