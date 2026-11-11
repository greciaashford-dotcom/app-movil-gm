// "Continuar con Google" through Emergent managed auth.
// Native: in-app browser session, the redirect deep link carries `#session_id=…`.
// Web: full-page redirect, the app reads `session_id` from the URL when it loads again.
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

WebBrowser.maybeCompleteAuthSession();

const AUTH_URL = "https://auth.emergentagent.com/";

/** session_id from the hash or the query string (Linking.parse cannot read the hash). */
export function extractSessionId(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function redirectUrl(): string {
  return Platform.OS === "web" ? `${window.location.origin}/` : Linking.createURL("");
}

/** Native: resolves with the session_id, or null if the user closed the browser. Web: navigates to Google and resolves null. */
export async function openGoogleSignIn(): Promise<string | null> {
  const redirect = redirectUrl();
  const authUrl = `${AUTH_URL}?redirect=${encodeURIComponent(redirect)}`;
  if (Platform.OS === "web") {
    window.location.href = authUrl;
    return null;
  }
  let captured: string | null = null;
  // Android often reports "dismiss" without a URL even though the deep link arrived: listen for it too.
  const sub = Linking.addEventListener("url", ({ url }) => {
    captured = captured ?? extractSessionId(url);
  });
  try {
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
    const fromResult = result.type === "success" ? extractSessionId(result.url) : null;
    if (fromResult) return fromResult;
    if (!captured) await new Promise((r) => setTimeout(r, 500));
    return captured ?? extractSessionId(await Linking.getInitialURL());
  } finally {
    sub.remove();
  }
}

/** Web only: the session_id Google left in the address bar after the redirect. */
export function readWebSessionId(): string | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  return extractSessionId(window.location.hash) ?? extractSessionId(window.location.search);
}

/** Web only: remove session_id from the address bar, keeping everything else. */
export function clearWebSessionId(): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("session_id");
  const hash = url.hash
    .replace(/^#/, "")
    .split("&")
    .filter((p) => p && !p.startsWith("session_id="))
    .join("&");
  url.hash = hash ? `#${hash}` : "";
  window.history.replaceState(window.history.state, "", url.toString());
}
