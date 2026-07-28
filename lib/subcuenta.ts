export const SUBCUENTAS = {
    "scala-valencia": {
        nombre: "Scala Valencia",
        logo: {
            claro: "/logos/scala-valencia.png",
            oscuro: "/logos/scala-valencia-dark.png",
            isotipo: "/logos/scala-valencia-isotipo.png",
        },
        proporcion: { completo: 1168 / 851, isotipo: 1149 / 595 },
    },
    "vertical-projects": {
        nombre: "Vertical Projects",
        logo: {
            claro: "/logos/vertical-projects.png",
            oscuro: "/logos/vertical-projects-dark.png",
            isotipo: "/logos/vertical-projects-isotipo.png",
        },
        proporcion: { completo: 918 / 784, isotipo: 377 / 472 },
    },
} as const;

export type SubcuentaSlug = keyof typeof SUBCUENTAS;

export function esSubcuentaValida(v: unknown): v is SubcuentaSlug {
    return typeof v === "string" && v in SUBCUENTAS
}

export function getSubcuenta(slug: unknown) {
    return esSubcuentaValida(slug) ? SUBCUENTAS[slug] : null;
}