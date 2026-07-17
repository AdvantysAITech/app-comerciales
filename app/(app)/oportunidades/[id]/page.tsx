import { OportunidadDetalle } from "@/components/OportunidadDetalle";

export default async function OportunidadPage({
    params,
}: {
    params: Promise<{ id: string }>;  
}) {
    const { id } = await params;

    return (
        <div className="flex min-h-full items-start justify-center px-6 py-12">
            <div className="w-full max-w-lg rounded-3xl border border-hairline bg-surface p-6 shadow-sm">
                <OportunidadDetalle id={id} />
            </div>
        </div>
    );
}