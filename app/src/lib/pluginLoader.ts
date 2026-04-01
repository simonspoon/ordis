import { toast } from "./toast";

// Each bundled plugin module must export: init(): Promise<void> | void
// The init() function calls registerSessionPlugin/registerWorkspacePlugin/registerPluginCommand

type PluginModule = {
  init: () => Promise<void> | void;
};

// Add bundled plugin dynamic imports here.
// Each entry: [human-readable name, () => import("../plugins/foo")]
const BUNDLED_PLUGINS: Array<[string, () => Promise<PluginModule>]> = [
  ["Content Viewer", () => import("../plugins/contentViewerPlugin")],
  ["File Browser", () => import("../plugins/fileBrowserPlugin")],
  ["Artifact Viewer", () => import("../plugins/artifactViewerPlugin")],
  ["Project Management", () => import("../plugins/projectManagementPlugin")],
  ["Test Plugin", () => import("../plugins/testPlugin")],
  ["Settings", () => import("../plugins/settingsPlugin")],
];

export async function initializePlugins(): Promise<void> {
  for (const [name, loader] of BUNDLED_PLUGINS) {
    try {
      const mod = await loader();
      await mod.init();
    } catch (err) {
      console.error(`Plugin "${name}" failed to initialize:`, err);
      toast.warning(`Plugin "${name}" failed to load`);
    }
  }
}
