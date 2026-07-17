import { auth } from "@/auth";
import { Navbar } from "@/components/navbar";
import { LogoSubcuenta } from "@/components/LogoSubcuenta";

export default async function AppLayout({
    children,
    modal,
}: {
    children: React.ReactNode;
    modal: React.ReactNode;
}) {
    const session = await auth();
    const subcuenta = session?.user?.subcuenta as "scala-valencia" | "vertical-projects" | undefined;

    return (
        <div className="min-h-screen bg-canvas">
            <LogoSubcuenta subcuenta={subcuenta} />
            <main className="min-h-screen overflow-y-auto pt-20 pb-28">{children}</main>
            <Navbar />
            {modal}
        </div>
    );
}