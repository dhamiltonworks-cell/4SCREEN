import { app, BrowserWindow, WebContentsView } from "electron";

const TEST_URL = "https://www.google.com";
const TIMEOUT_MS = 20000;

app.whenReady().then(async () => {
  const mainWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 700,
  });

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: "persist:fourscreen-smoke-test",
      sandbox: false,
      webSecurity: true,
    },
  });

  mainWindow.contentView.addChildView(view);
  view.setBounds({ height: 700, width: 900, x: 0, y: 0 });

  const webContents = view.webContents;

  webContents.on("did-start-navigation", (_event, url, isInPlace, isMainFrame) => {
    if (isMainFrame) {
      console.log("[smoke] did-start-navigation", { isInPlace, url });
    }
  });

  webContents.on("did-finish-load", () => {
    console.log("[smoke] did-finish-load", webContents.getURL());
    console.log("[smoke] title", webContents.getTitle());
    app.exit(0);
  });

  webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) {
      return;
    }
    console.error("[smoke] did-fail-load", { errorCode, errorDescription, validatedURL });
    app.exit(1);
  });

  setTimeout(() => {
    console.error("[smoke] timed out waiting for navigation");
    app.exit(1);
  }, TIMEOUT_MS);

  console.log("[smoke] loadURL", TEST_URL);
  await webContents.loadURL(TEST_URL);
});
