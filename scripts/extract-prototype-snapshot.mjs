import fs from "node:fs";
import path from "node:path";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/extract-prototype-snapshot.mjs <prototype.html> <output.json>");
}

const source = fs.readFileSync(inputPath, "utf8");
const match = source.match(/const data = (\{.*\});\n    const runnerToken/s);

if (!match) {
  throw new Error("Unable to find the embedded dashboard data");
}

const data = JSON.parse(match[1]);

if (!Array.isArray(data.rows) || !Array.isArray(data.trend) || typeof data.metrics !== "object") {
  throw new Error("Embedded dashboard data has an unexpected shape");
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath} with ${data.rows.length} failed tests`);