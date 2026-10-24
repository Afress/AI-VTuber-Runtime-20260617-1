import { contextBridge } from "electron";
import { getDesktopRuntimeApi } from "./runtimeConfig";

contextBridge.exposeInMainWorld(
  "desktopRuntime",
  getDesktopRuntimeApi(
    process.platform,
    process.argv.find((argument) => argument.startsWith("--desktop-app-version="))?.split("=")[1] ??
      process.versions.electron,
  ),
);
