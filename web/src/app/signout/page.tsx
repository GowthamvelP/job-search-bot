"use client";

import { useRouter } from "next/navigation";
import { Sparkles, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SignOutPage() {
  const router = useRouter();

  async function handleSignOut() {
    // Call the NextAuth signout endpoint via POST with CSRF
    const res = await fetch("/api/auth/csrf");
    const { csrfToken } = await res.json();

    await fetch("/api/auth/signout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `csrfToken=${csrfToken}`,
    });

    router.push("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 mb-2">
          <LogOut className="w-7 h-7 text-violet-400" />
        </div>
        <h1 className="text-xl font-bold">Sign out?</h1>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to sign out of JobAgent?
        </p>
        <div className="flex gap-3 justify-center">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSignOut}
            className="cursor-pointer"
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
