import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.niramoy.pharmacy",
  appName: "Niramoy Pharmacy",
  webDir: "www",
  server: {
    // The storefront is bundled, but it calls the Express API over plain HTTP
    // on the LAN. Keep the app origin on http too so the WebView does not treat
    // those calls as mixed content, and let the WebView talk cleartext to the
    // LAN (mirrored by android:usesCleartextTraffic in AndroidManifest.xml and
    // NSAppTransportSecurity in ios/App/App/Info.plist).
    androidScheme: "http",
    cleartext: true,
  },
};

export default config;
