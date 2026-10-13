/**
 * Hooks for the packaged Capacitor app. A no-op in the browser, and the
 * plugin code is only downloaded when running inside the native shell.
 */
type CapacitorGlobal = { isNativePlatform?: () => boolean };

export async function initNativeShell() {
  const cap = (window as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (!cap?.isNativePlatform?.()) return;

  const { App } = await import("@capacitor/app");
  // Android hardware/gesture back: walk the in-app history like a browser,
  // and on the first screen send the app to the background as native apps do.
  await App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.minimizeApp();
  });
}
