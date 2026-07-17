import { auth } from "@/auth";
import { Navbar } from "@/components/navbar";

export default async function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    return (
        <div className="flex min-h-screen bg-canvas">
            <Navbar />
            <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
    );
}