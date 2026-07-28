import { Navbar } from "@/components/navbar";

export default async function AppLayout({
    children,
    modal,
}: {
    children: React.ReactNode;
    modal: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-canvas">
            <main className="min-h-screen overflow-y-auto pt-20 pb-28">{children}</main>
            <Navbar />
            {modal}
        </div>
    );
}