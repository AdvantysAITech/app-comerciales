import { Modal } from "@/components/Modal";
import { OportunidadDetalle } from "@/components/OportunidadDetalle";

export default async function OportunidadModal({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    return (
        <Modal>
            <OportunidadDetalle id={id} />
        </Modal>
    )
}