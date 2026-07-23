import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.dirname(path.dirname(scriptPath));

export async function writeProductionSbom(options = {}) {
  const root = options.root ?? defaultRoot;
  const rootPackage = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const rootManifestPath = path.join(root, "package.json");
  const output = options.output ?? path.join(
    root,
    "out",
    "releases",
    `web2ui-extension-${rootPackage.version}.spdx.json`,
  );
  const packages = [spdxPackage(rootPackage, "SPDXRef-Package-Web2UI", true)];
  const relationships = [];
  const installed = new Map();

  const collect = async (name, parentId, parentManifestPath) => {
    const manifestPath = createRequire(parentManifestPath).resolve(`${name}/package.json`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const key = `${manifest.name}@${manifest.version}`;
    let packageId = installed.get(key);
    if (!packageId) {
      packageId = `SPDXRef-Package-${sanitizeId(manifest.name)}-${sanitizeId(manifest.version)}`;
      installed.set(key, packageId);
      packages.push(spdxPackage(manifest, packageId, false));
      for (const dependency of Object.keys(manifest.dependencies ?? {}).sort()) {
        await collect(dependency, packageId, manifestPath);
      }
    }
    relationships.push({ spdxElementId: parentId, relationshipType: "DEPENDS_ON", relatedSpdxElement: packageId });
  };

  for (const dependency of Object.keys(rootPackage.dependencies ?? {}).sort()) {
    await collect(dependency, "SPDXRef-Package-Web2UI", rootManifestPath);
  }

  packages.sort((a, b) => a.SPDXID.localeCompare(b.SPDXID));
  relationships.sort((a, b) =>
    `${a.spdxElementId}:${a.relatedSpdxElement}`.localeCompare(
      `${b.spdxElementId}:${b.relatedSpdxElement}`,
    ),
  );

  const created = new Date(
    Number(process.env.SOURCE_DATE_EPOCH ?? Math.floor(Date.now() / 1_000)) * 1_000,
  ).toISOString().replace(/\.\d{3}Z$/u, "Z");
  const document = {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `web2ui-extension-${rootPackage.version}`,
    documentNamespace: `https://github.com/Lynavo/web2ui-extension/releases/tag/v${rootPackage.version}/sbom`,
    creationInfo: {
      created,
      creators: ["Organization: Lynavo", "Tool: web2ui-production-sbom"],
      licenseListVersion: "3.27",
    },
    documentDescribes: ["SPDXRef-Package-Web2UI"],
    packages,
    relationships,
  };

  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return output;
}

function spdxPackage(manifest, packageId, rootPackage) {
  const license = typeof manifest.license === "string" ? manifest.license : "NOASSERTION";
  return {
    SPDXID: packageId,
    name: manifest.name,
    versionInfo: manifest.version,
    downloadLocation: rootPackage ? "NOASSERTION" : `https://registry.npmjs.org/${manifest.name}`,
    filesAnalyzed: false,
    licenseConcluded: license,
    licenseDeclared: license,
    copyrightText: "NOASSERTION",
    ...(rootPackage
      ? { supplier: "Organization: Lynavo" }
      : {
          externalRefs: [
            {
              referenceCategory: "PACKAGE-MANAGER",
              referenceType: "purl",
              referenceLocator: npmPurl(manifest.name, manifest.version),
            },
          ],
        }),
  };
}

function npmPurl(name, version) {
  const encodedName = name.startsWith("@")
    ? `${encodeURIComponent(name.split("/")[0])}/${encodeURIComponent(name.split("/")[1] ?? "")}`
    : encodeURIComponent(name);
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

function sanitizeId(value) {
  return String(value).replace(/[^A-Za-z0-9.-]+/gu, "-");
}

if (path.resolve(process.argv[1] ?? "") === scriptPath) {
  const output = await writeProductionSbom();
  console.log(`Wrote ${path.relative(defaultRoot, output)}`);
}
