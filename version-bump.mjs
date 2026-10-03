import { readFileSync, writeFileSync } from "node:fs";

const targetVersion = process.argv[2];
if (!targetVersion || !/^\d+\.\d+\.\d+$/.test(targetVersion)) {
  console.error("usage: node version-bump.mjs <x.y.z>");
  process.exit(1);
}

const minAppVersion = JSON.parse(readFileSync("versions.json", "utf8"))[
  Object.keys(JSON.parse(readFileSync("versions.json", "utf8"))).pop()
];

for (const file of ["package.json", "manifest.json"]) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  json.version = targetVersion;
  writeFileSync(file, JSON.stringify(json, null, "\t") + "\n");
}

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
if (!versions[targetVersion]) {
  versions[targetVersion] = minAppVersion;
}
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");

console.log(`bumped to ${targetVersion} (minAppVersion ${minAppVersion})`);
