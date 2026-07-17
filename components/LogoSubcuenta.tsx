type Props = {
    subcuenta?: "scala-valencia" | "vertical-projects";
};

const LOGOS: Record<string, { src: string; alt: string }> = {
    "scala-valencia": { src: "/logos/scala-valencia.jpg", alt: "Scala Valencia" },
    "vertical-projects": { src: "/logos/vertical-projects.png", alt: "Vertical Projects" }
};

export function LogoSubcuenta({ subcuenta }: Props) {
    const logo = subcuenta ? LOGOS[subcuenta] : undefined;

    return (
        <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-center border-b border-hairline bg-surface/80 backdrop-blur-sm">
            {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo.src} alt={logo.alt} className="h-9 w-auto object-contain" />
            ) : (
                <span className="text-sm font-medium text-muted">Sistema Advantys</span>
            )}
        </header>
    );
}