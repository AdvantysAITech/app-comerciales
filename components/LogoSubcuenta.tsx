import Image from "next/image";
import { getSubcuenta } from "@/lib/subcuenta";

type Props = {
    subcuenta?: string | null;
    variante?: "completo" | "isotipo";
    alto?: number;
    className?: string;
    priority?: boolean;
};

export function LogoSubcuenta({
    subcuenta,
    variante = "completo",
    alto = 40,
    className = "",
    priority = false,
}: Props) {
    const cfg = getSubcuenta(subcuenta);

    if (!cfg) {
        return <span className={`font-serif tracking-tight ${className}`}>Sistema Advantys</span>;
    }

    const ancho = Math.round(alto * cfg.proporcion[variante]);
    const alt = `Logotipo de ${cfg.nombre}`;

    if (variante === "isotipo") {
        return (
            <Image src={cfg.logo.isotipo} alt={alt} width={ancho} height={alto} priority={priority} className={className} />
        );
    }

    return (
    <>
      <Image src={cfg.logo.claro} alt={alt} width={ancho} height={alto}
             priority={priority} className={`block dark:hidden ${className}`} />
      <Image src={cfg.logo.oscuro} alt="" aria-hidden="true" width={ancho} height={alto}
             priority={priority} className={`hidden dark:block ${className}`} />
    </>
  );
}