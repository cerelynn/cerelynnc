import * as esbuild from "https://deno.land/x/esbuild@v0.15.15/mod.js";
import * as path from "https://deno.land/std@0.168.0/path/mod.ts";
const CACHE = await caches.open("imports");
interface ImportMap {
    imports: {
        react: string;
        [key: string]: string;
    };
}
interface CompileOptions {
    inputPoint: string;
    outputPoint: string;
    importMap: ImportMap;
}

function urlImportsPlugin(importMap: ImportMap): esbuild.Plugin {
    return {
        name: "URL Imports",
        setup(build) {
            build.onResolve({ filter: /^https?:\/\// }, (args) => {
                return { path: args.path, namespace: "http-url" };
            });

            build.onResolve(
                { filter: /.*/, namespace: "http-url" },
                (args) => ({
                    path: new URL(args.path, args.importer).toString(),
                    namespace: "http-url",
                })
            );

            build.onResolve({ filter: /.*/ }, (args: esbuild.OnResolveArgs) => {
                if (args.kind === "import-statement") {
                    const imports = importMap.imports;
                    const splitPath = args.path.split("/");
                    const npmPackage = splitPath.shift();
                    if (imports[npmPackage as string]) {
                        const importLink =
                            imports[npmPackage as string] +
                            "/" +
                            splitPath.join("/");
                        return {
                            path: importLink,
                            namespace: "http-url",
                        };
                    }
                }

                return {
                    path: path.resolve(args.resolveDir, args.path),
                    namespace: "file",
                };
            });

            build.onLoad(
                { filter: /.*/, namespace: "http-url" },
                async (args) => {
                    const url = new URL(args.path);
                    const urlCache = await CACHE.match(url);

                    if (urlCache) return { contents: await urlCache.text() };
                    console.log("Started fetching", url.href);
                    const response = await fetch(url.href);
                    CACHE.put(url, response.clone());
                    return { contents: await response.text() };
                }
            );
        },
    };
}

async function compile(options: CompileOptions) {
    await esbuild.build({
        entryPoints: [options.inputPoint],
        outdir: options.outputPoint,
        format: "esm",
        bundle: true,
        plugins: [urlImportsPlugin(options.importMap)],
        jsx: "automatic",
        jsxImportSource: options.importMap.imports.react,
    });
}
export default compile;
