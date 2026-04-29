// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { createStarlightTypeDocPlugin } from "starlight-typedoc";

const [coreTypeDoc, coreTypeDocSidebar] = createStarlightTypeDocPlugin();

export default defineConfig({
  site: "https://conduit.tomhofman.dev",
  integrations: [
    starlight({
      title: "Conduit",
      description:
        "Agentic coding scheduler — read issues, run agents in isolated worktrees, write results back.",
      social: {
        github: "https://github.com/ausernamedtom/conduit",
      },
      editLink: {
        baseUrl:
          "https://github.com/ausernamedtom/conduit/edit/main/website/",
      },
      plugins: [
        coreTypeDoc({
          entryPoints: ["../packages/conduit/src/index.ts"],
          tsconfig: "../packages/conduit/tsconfig.json",
          output: "api",
          sidebar: {
            label: "API reference",
            collapsed: true,
          },
          typeDoc: {
            entryPointStrategy: "expand",
            excludePrivate: true,
            excludeInternal: true,
          },
        }),
      ],
      sidebar: [
        {
          label: "Guides",
          autogenerate: { directory: "guides" },
        },
        {
          label: "Reference",
          autogenerate: { directory: "reference" },
        },
        {
          label: "Packages",
          autogenerate: { directory: "packages" },
        },
        coreTypeDocSidebar,
      ],
    }),
  ],
});
