import { Sidebar } from "@/components/sidebar";
import { auth } from "@/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div className="flex h-full">
      <Sidebar user={session?.user || null} />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
