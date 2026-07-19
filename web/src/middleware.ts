export { auth as middleware } from "@/auth";

export const config = {
  // Protect all routes except: login, signout, api/auth, static assets, favicon
  matcher: ["/((?!login|signout|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
