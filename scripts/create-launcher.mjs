import { cp, mkdir, symlink, access, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "build/Bulby.app");
try {
  await access(target);
  throw new Error("build/Bulby.app already exists. Keep or move that launcher before creating another.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await mkdir(path.dirname(target), { recursive: true });
await cp(path.join(root, "node_modules/electron/dist/Electron.app"), target, { recursive: true, verbatimSymlinks: true });
await symlink(root, path.join(target, "Contents/Resources/app"));
const plist = path.join(target, "Contents/Info.plist");
const png = await readFile(path.join(root, "chrome-extension/icons/bulby-128.png"));
const header = Buffer.alloc(16);
header.write("icns", 0);
header.writeUInt32BE(png.length + 16, 4);
header.write("ic07", 8);
header.writeUInt32BE(png.length + 8, 12);
await writeFile(path.join(target, "Contents/Resources/bulby.icns"), Buffer.concat([header, png]));
const info = JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", plist], { encoding: "utf8" }));
Object.assign(info, {
  CFBundleName: "Bulby", CFBundleDisplayName: "Bulby", CFBundleIdentifier: "com.bulby.desktop",
  CFBundleIconFile: "bulby.icns",
  CFBundleURLTypes: [{ CFBundleURLName: "Bulby Launcher", CFBundleURLSchemes: ["bulby"] }]
});
execFileSync("plutil", ["-convert", "xml1", "-o", plist, "-"], { input: JSON.stringify(info) });
execFileSync("codesign", ["--force", "--deep", "--sign", "-", target], { stdio: "inherit" });
console.log(target);
