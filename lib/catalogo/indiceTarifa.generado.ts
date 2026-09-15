/**
 * GENERADO por scripts/tarifa/generar-indice-buscador.ts. NO EDITAR A MANO.
 *
 * Índice ligero de la tarifa 2026.1 para el buscador de Varios.
 * `validarMapeo()` comprueba que coincide con data/tarifa. Si la tarifa cambia:
 *   npm run buscador:indice
 */

export const VERSION_TARIFA_INDICE = "2026.1";

export const CAPITULOS_INDICE = [
    {
        "codigo": "01",
        "codigoJerarquico": "1.01",
        "nombre": "DEMOLICIONES Y ACTUACIONES PREVIAS"
    },
    {
        "codigo": "02",
        "codigoJerarquico": "1.02",
        "nombre": "ANDAMIOS Y MEDIOS DE ELEVACION"
    },
    {
        "codigo": "03",
        "codigoJerarquico": "1.03",
        "nombre": "CERRAMIENTOS Y FACHADAS"
    },
    {
        "codigo": "04",
        "codigoJerarquico": "1.04",
        "nombre": "REVESTIMIENTOS CERAMICOS Y PETREOS"
    },
    {
        "codigo": "05",
        "codigoJerarquico": "1.05",
        "nombre": "PINTURAS Y TRATAMIENTOS SUPERFICIALES"
    },
    {
        "codigo": "06",
        "codigoJerarquico": "1.06",
        "nombre": "IMPERMEABILIZACIONES Y CUBIERTAS"
    },
    {
        "codigo": "07",
        "codigoJerarquico": "1.07",
        "nombre": "RETIRADA DE AMIANTO RERA"
    },
    {
        "codigo": "08",
        "codigoJerarquico": "1.08",
        "nombre": "CERRAJERIA Y CARPINTERIA METALICA"
    },
    {
        "codigo": "09",
        "codigoJerarquico": "1.09",
        "nombre": "SEGURIDAD Y SALUD EN OBRA"
    },
    {
        "codigo": "10",
        "codigoJerarquico": "1.10",
        "nombre": "GESTION DE RESIDUOS RCD"
    },
    {
        "codigo": "11",
        "codigoJerarquico": "1.11",
        "nombre": "TRABAJOS VERTICALES VP"
    },
    {
        "codigo": "12",
        "codigoJerarquico": "1.12",
        "nombre": "INSTALACIONES BASICAS Y SANEAMIENTO"
    }
] as const;

export const PARTIDAS_INDICE: ReadonlyArray<{
    codigo: string;
    capitulo: string;
    descripcion: string;
    unidad: string;
}> = [
    {
        "codigo": "DEM001",
        "capitulo": "01",
        "descripcion": "Demolicion manual aplacado piedra natural con anclaje mecanico",
        "unidad": "m²"
    },
    {
        "codigo": "DEM002",
        "capitulo": "01",
        "descripcion": "Demolicion manual aplacado ceramico exterior pegado",
        "unidad": "m²"
    },
    {
        "codigo": "DEM003",
        "capitulo": "01",
        "descripcion": "Demolicion alicatado azulejo medios manuales",
        "unidad": "m²"
    },
    {
        "codigo": "DEM004",
        "capitulo": "01",
        "descripcion": "Demolicion pavimento ceramico interior medios manuales",
        "unidad": "m²"
    },
    {
        "codigo": "DEM005",
        "capitulo": "01",
        "descripcion": "Demolicion pavimento ceramico cubierta plana",
        "unidad": "m²"
    },
    {
        "codigo": "DEM006",
        "capitulo": "01",
        "descripcion": "Levantado revestimiento madera clavada sobre rastreles",
        "unidad": "m²"
    },
    {
        "codigo": "DEM007",
        "capitulo": "01",
        "descripcion": "Demolicion base pavimento mortero hasta 8 cm martillo neumatico",
        "unidad": "m²"
    },
    {
        "codigo": "DEM008",
        "capitulo": "01",
        "descripcion": "Demolicion revestimiento continuo mortero medios manuales ext.",
        "unidad": "m²"
    },
    {
        "codigo": "DEM009",
        "capitulo": "01",
        "descripcion": "Picado de enfoscado paramento vertical exterior manual",
        "unidad": "m²"
    },
    {
        "codigo": "DEM010",
        "capitulo": "01",
        "descripcion": "Picado de enlucido yeso paramento vertical manual",
        "unidad": "m²"
    },
    {
        "codigo": "DEM011",
        "capitulo": "01",
        "descripcion": "Demolicion chapado piedra natural con grapas recuperacion material",
        "unidad": "m²"
    },
    {
        "codigo": "DEM012",
        "capitulo": "01",
        "descripcion": "Levantado lamina impermeabilizacion cubierta plana manual",
        "unidad": "m²"
    },
    {
        "codigo": "DEM013",
        "capitulo": "01",
        "descripcion": "Demolicion solado baldosa cubierta plana con capa mortero",
        "unidad": "m²"
    },
    {
        "codigo": "DEM014",
        "capitulo": "01",
        "descripcion": "Demolicion cajeado forjado hormigon martillo neumatico",
        "unidad": "m³"
    },
    {
        "codigo": "DEM015",
        "capitulo": "01",
        "descripcion": "Limpieza y rascado pinturas viejas temple paramentos ext.",
        "unidad": "m²"
    },
    {
        "codigo": "DEM016",
        "capitulo": "01",
        "descripcion": "Lavado hidrodinamico fachada agua presion",
        "unidad": "m²"
    },
    {
        "codigo": "DEM017",
        "capitulo": "01",
        "descripcion": "Limpieza chapado ceramico maquina agua presion",
        "unidad": "m²"
    },
    {
        "codigo": "DEM018",
        "capitulo": "01",
        "descripcion": "Limpieza juntas chapado piedra natural manual con cepillo",
        "unidad": "m²"
    },
    {
        "codigo": "DEM019",
        "capitulo": "01",
        "descripcion": "Decapado quimico pintura exterior paramento vertical",
        "unidad": "m²"
    },
    {
        "codigo": "DEM020",
        "capitulo": "01",
        "descripcion": "Eliminacion eflorescencias sales con producto quimico",
        "unidad": "m²"
    },
    {
        "codigo": "AND001",
        "capitulo": "02",
        "descripcion": "Montaje desmontaje andamio tubular",
        "unidad": "ud"
    },
    {
        "codigo": "AND002",
        "capitulo": "02",
        "descripcion": "Montaje desmontaje andamio tubular multidireccional h=10-20m",
        "unidad": "m²"
    },
    {
        "codigo": "AND003",
        "capitulo": "02",
        "descripcion": "Montaje desmontaje andamio tubular multidireccional h=20-30m",
        "unidad": "m²"
    },
    {
        "codigo": "AND004",
        "capitulo": "02",
        "descripcion": "Alquiler andamio tubular multidireccional 15 dias 250m2",
        "unidad": "ud"
    },
    {
        "codigo": "AND005",
        "capitulo": "02",
        "descripcion": "Alquiler andamio tubular multidireccional dia natural m2",
        "unidad": "m²"
    },
    {
        "codigo": "AND006",
        "capitulo": "02",
        "descripcion": "Malla proteccion tupida polietileno andamio",
        "unidad": "m²"
    },
    {
        "codigo": "AND007",
        "capitulo": "02",
        "descripcion": "Plataforma elevadora telescopica diesel hasta 20m",
        "unidad": "ud"
    },
    {
        "codigo": "AND008",
        "capitulo": "02",
        "descripcion": "Plataforma elevadora telescopica diesel hasta 28m",
        "unidad": "ud"
    },
    {
        "codigo": "AND009",
        "capitulo": "02",
        "descripcion": "Plataforma tijera electrica hasta 12m",
        "unidad": "ud"
    },
    {
        "codigo": "AND010",
        "capitulo": "02",
        "descripcion": "Camion grua telescopica 20t salida",
        "unidad": "ud"
    },
    {
        "codigo": "AND011",
        "capitulo": "02",
        "descripcion": "Camion grua telescopica 25t salida",
        "unidad": "ud"
    },
    {
        "codigo": "AND012",
        "capitulo": "02",
        "descripcion": "Grua torre montaje desmontaje hasta 30m",
        "unidad": "ud"
    },
    {
        "codigo": "AND013",
        "capitulo": "02",
        "descripcion": "Alquiler grua torre dia natural",
        "unidad": "día"
    },
    {
        "codigo": "AND014",
        "capitulo": "02",
        "descripcion": "Proteccion red perimetral fachada bandeja recogida",
        "unidad": "m"
    },
    {
        "codigo": "AND015",
        "capitulo": "02",
        "descripcion": "Barandilla provisional obra tubular reglamentaria",
        "unidad": "m"
    },
    {
        "codigo": "AND016",
        "capitulo": "02",
        "descripcion": "Lona proteccion publicidad andamio impresa",
        "unidad": "m²"
    },
    {
        "codigo": "FAC001",
        "capitulo": "03",
        "descripcion": "Enfoscado cemento CSIII W1 a buena vista ext. 15mm",
        "unidad": "m²"
    },
    {
        "codigo": "FAC002",
        "capitulo": "03",
        "descripcion": "Enfoscado cemento maestreado fratasado ext. 20mm vertical",
        "unidad": "m²"
    },
    {
        "codigo": "FAC003",
        "capitulo": "03",
        "descripcion": "Enfoscado cemento interior a buena vista 15mm",
        "unidad": "m²"
    },
    {
        "codigo": "FAC004",
        "capitulo": "03",
        "descripcion": "Enfoscado cemento maestreado fratasado vigas soportes",
        "unidad": "m"
    },
    {
        "codigo": "FAC005",
        "capitulo": "03",
        "descripcion": "Mortero monocapa hidrofugo proyectado ext. acabado liso",
        "unidad": "m²"
    },
    {
        "codigo": "FAC006",
        "capitulo": "03",
        "descripcion": "Mortero monocapa hidrofugo rasqueteado ext.",
        "unidad": "m²"
    },
    {
        "codigo": "FAC007",
        "capitulo": "03",
        "descripcion": "Renovacion monocapa agrietado con malla fibra vidrio 5x5mm",
        "unidad": "m²"
    },
    {
        "codigo": "FAC008",
        "capitulo": "03",
        "descripcion": "Reparacion grietas paramento mortero con malla fibra vidrio",
        "unidad": "m²"
    },
    {
        "codigo": "FAC009",
        "capitulo": "03",
        "descripcion": "Reparacion grieta mortero con masilla elastica",
        "unidad": "m"
    },
    {
        "codigo": "FAC010",
        "capitulo": "03",
        "descripcion": "Picado paramento revocar aleros eliminacion recubrimientos",
        "unidad": "m²"
    },
    {
        "codigo": "FAC011",
        "capitulo": "03",
        "descripcion": "Inspeccion visual dintel cargadero prefabricado hormigon",
        "unidad": "m"
    },
    {
        "codigo": "FAC012",
        "capitulo": "03",
        "descripcion": "Impregnacion inhibidor corrosion Sika FerroGard-903 Plus manual",
        "unidad": "m"
    },
    {
        "codigo": "FAC013",
        "capitulo": "03",
        "descripcion": "Inyeccion resina epoxi fisuras estructurales",
        "unidad": "m"
    },
    {
        "codigo": "FAC014",
        "capitulo": "03",
        "descripcion": "Cosido grietas obra fabrica carga barras acero inox",
        "unidad": "m"
    },
    {
        "codigo": "FAC015",
        "capitulo": "03",
        "descripcion": "Saneado armadura oxidada chorro arena pasivado",
        "unidad": "m²"
    },
    {
        "codigo": "FAC016",
        "capitulo": "03",
        "descripcion": "Reparacion canto forjado hormigon deteriorado con mortero R4",
        "unidad": "m²"
    },
    {
        "codigo": "FAC017",
        "capitulo": "03",
        "descripcion": "Aplicacion mortero pasivante barras corrugadas cantos forjado",
        "unidad": "m"
    },
    {
        "codigo": "FAC018",
        "capitulo": "03",
        "descripcion": "Cerramiento ladrillo cara vista 1 pie",
        "unidad": "m²"
    },
    {
        "codigo": "FAC019",
        "capitulo": "03",
        "descripcion": "Cerramiento ladrillo hueco doble tabicon 9cm",
        "unidad": "m²"
    },
    {
        "codigo": "FAC020",
        "capitulo": "03",
        "descripcion": "Trasdosado directo placa yeso laminado sobre cerramiento",
        "unidad": "m²"
    },
    {
        "codigo": "FAC021",
        "capitulo": "03",
        "descripcion": "Sistema SATE EPS 60mm mortero armado malla fibra",
        "unidad": "m²"
    },
    {
        "codigo": "FAC022",
        "capitulo": "03",
        "descripcion": "Sistema SATE lana roca 80mm mortero armado",
        "unidad": "m²"
    },
    {
        "codigo": "FAC023",
        "capitulo": "03",
        "descripcion": "Fachada ventilada panel composite aluminio",
        "unidad": "m²"
    },
    {
        "codigo": "FAC024",
        "capitulo": "03",
        "descripcion": "Fachada ventilada panel ceramico porcelanico 45x45",
        "unidad": "m²"
    },
    {
        "codigo": "FAC025",
        "capitulo": "03",
        "descripcion": "Sellado junta dilatacion fachada poliuretano bicomponente",
        "unidad": "m"
    },
    {
        "codigo": "FAC026",
        "capitulo": "03",
        "descripcion": "Sellado juntas carpinteria-fachada silicona neutra",
        "unidad": "m"
    },
    {
        "codigo": "REV001",
        "capitulo": "04",
        "descripcion": "Aplacado gres porcelanico fachada 30x30 cm mortero cola C2",
        "unidad": "m²"
    },
    {
        "codigo": "REV002",
        "capitulo": "04",
        "descripcion": "Aplacado gres porcelanico fachada 45x45 cm mortero cola C2",
        "unidad": "m²"
    },
    {
        "codigo": "REV003",
        "capitulo": "04",
        "descripcion": "Aplacado gres porcelanico fachada 60x60 cm mortero cola C2",
        "unidad": "m²"
    },
    {
        "codigo": "REV004",
        "capitulo": "04",
        "descripcion": "Chapado piedra natural granito pulido 40x40x2cm adhesivo cementoso",
        "unidad": "m²"
    },
    {
        "codigo": "REV005",
        "capitulo": "04",
        "descripcion": "Chapado piedra natural granito 60x40x3cm con grapas anclaje",
        "unidad": "m²"
    },
    {
        "codigo": "REV006",
        "capitulo": "04",
        "descripcion": "Chapado marmol travertino 40x40x2cm adhesivo cementoso",
        "unidad": "m²"
    },
    {
        "codigo": "REV007",
        "capitulo": "04",
        "descripcion": "Alicatado azulejo ceramico hasta 25x40 cm interior",
        "unidad": "m²"
    },
    {
        "codigo": "REV008",
        "capitulo": "04",
        "descripcion": "Alicatado gres porcelanico 30x60 interior",
        "unidad": "m²"
    },
    {
        "codigo": "REV009",
        "capitulo": "04",
        "descripcion": "Revestimiento placas rigidas acero inoxidable e=1mm fijacion mecanica",
        "unidad": "m²"
    },
    {
        "codigo": "REV010",
        "capitulo": "04",
        "descripcion": "Revestimiento placas acero galvanizado e=1,5mm",
        "unidad": "m²"
    },
    {
        "codigo": "REV011",
        "capitulo": "04",
        "descripcion": "Frente forjado revestimiento monocapa hidrofugo",
        "unidad": "m"
    },
    {
        "codigo": "REV012",
        "capitulo": "04",
        "descripcion": "Rodapie ceramico 8x25 cm recibido mortero",
        "unidad": "m"
    },
    {
        "codigo": "REV013",
        "capitulo": "04",
        "descripcion": "Solado baldosa gres rustico exterior 20x20 junta abierta",
        "unidad": "m²"
    },
    {
        "codigo": "REV014",
        "capitulo": "04",
        "descripcion": "Pavimento terrazas gres porcelanico antideslizante 60x60",
        "unidad": "m²"
    },
    {
        "codigo": "REV015",
        "capitulo": "04",
        "descripcion": "Revoco cal hidraulica NHL-5 proyectado exterior",
        "unidad": "m²"
    },
    {
        "codigo": "PIN001",
        "capitulo": "05",
        "descripcion": "Pintura plastica acrilica exterior dos manos + imprimacion",
        "unidad": "m²"
    },
    {
        "codigo": "PIN002",
        "capitulo": "05",
        "descripcion": "Pintura plastica acrilica interior sobre mortero dos manos",
        "unidad": "m²"
    },
    {
        "codigo": "PIN003",
        "capitulo": "05",
        "descripcion": "Pintura plastica interior sobre yeso o escayola",
        "unidad": "m²"
    },
    {
        "codigo": "PIN004",
        "capitulo": "05",
        "descripcion": "Pintura impermeabilizante elastomerica fachada exterior",
        "unidad": "m²"
    },
    {
        "codigo": "PIN005",
        "capitulo": "05",
        "descripcion": "Pintura clorocaucho exterior dos manos",
        "unidad": "m²"
    },
    {
        "codigo": "PIN006",
        "capitulo": "05",
        "descripcion": "Pintura siloxano fachada exterior alta resistencia",
        "unidad": "m²"
    },
    {
        "codigo": "PIN007",
        "capitulo": "05",
        "descripcion": "Pintura pliolite hidrorresistente exterior dos manos",
        "unidad": "m²"
    },
    {
        "codigo": "PIN008",
        "capitulo": "05",
        "descripcion": "Revestimiento elastico antifisuras armado malla fachada exterior",
        "unidad": "m²"
    },
    {
        "codigo": "PIN009",
        "capitulo": "05",
        "descripcion": "Rehabilitacion revestimiento chapa metalica fachada anticorrosion",
        "unidad": "m²"
    },
    {
        "codigo": "PIN010",
        "capitulo": "05",
        "descripcion": "Tratamiento hidrofugante siloxanico fachada piedra natural",
        "unidad": "m²"
    },
    {
        "codigo": "PIN011",
        "capitulo": "05",
        "descripcion": "Consolidante penetrante soporte friable exterior",
        "unidad": "m²"
    },
    {
        "codigo": "PIN012",
        "capitulo": "05",
        "descripcion": "Pintura intumescente proteccion fuego estructura metalica EI30",
        "unidad": "m²"
    },
    {
        "codigo": "PIN013",
        "capitulo": "05",
        "descripcion": "Pintura anticorrosion estructura metalica fondo + acabado",
        "unidad": "m²"
    },
    {
        "codigo": "PIN014",
        "capitulo": "05",
        "descripcion": "Pintado carpinteria metalica exterior dos manos",
        "unidad": "m²"
    },
    {
        "codigo": "PIN015",
        "capitulo": "05",
        "descripcion": "Barniz exterior madera dos manos proteccion UV",
        "unidad": "m²"
    },
    {
        "codigo": "IMP001",
        "capitulo": "06",
        "descripcion": "Sustitucion lamina bituminosa autoprotegida monocapa cubierta plana",
        "unidad": "m²"
    },
    {
        "codigo": "IMP002",
        "capitulo": "06",
        "descripcion": "Sustitucion lamina bituminosa autoprotegida bicapa cubierta plana",
        "unidad": "m²"
    },
    {
        "codigo": "IMP003",
        "capitulo": "06",
        "descripcion": "Impermeabilizacion monocapa LBM-SBS cubierta inclinada",
        "unidad": "m²"
    },
    {
        "codigo": "IMP004",
        "capitulo": "06",
        "descripcion": "Cubierta plana no transitable autoprotegida bicapa convencional",
        "unidad": "m²"
    },
    {
        "codigo": "IMP005",
        "capitulo": "06",
        "descripcion": "Cubierta plana no transitable autoprotegida monocapa convencional",
        "unidad": "m²"
    },
    {
        "codigo": "IMP006",
        "capitulo": "06",
        "descripcion": "Cubierta plana transitable con solado fijo bicapa invertida",
        "unidad": "m²"
    },
    {
        "codigo": "IMP007",
        "capitulo": "06",
        "descripcion": "Cubierta plana ventilada no transitable autoprotegida monocapa",
        "unidad": "m²"
    },
    {
        "codigo": "IMP008",
        "capitulo": "06",
        "descripcion": "Reparacion puntual lamina bituminosa 50x50cm monocapa",
        "unidad": "ud"
    },
    {
        "codigo": "IMP009",
        "capitulo": "06",
        "descripcion": "Impermeabilizacion murete perimetral cubierta lamina asfaltica",
        "unidad": "m"
    },
    {
        "codigo": "IMP010",
        "capitulo": "06",
        "descripcion": "Formacion pendientes arcilla expandida + mortero cubierta plana",
        "unidad": "m²"
    },
    {
        "codigo": "IMP011",
        "capitulo": "06",
        "descripcion": "Aislamiento termico panel XPS 60mm cubierta invertida",
        "unidad": "m²"
    },
    {
        "codigo": "IMP012",
        "capitulo": "06",
        "descripcion": "Aislamiento termico panel EPS 80mm cubierta convencional",
        "unidad": "m²"
    },
    {
        "codigo": "IMP013",
        "capitulo": "06",
        "descripcion": "Tela geotextil separadora 150 g/m2 cubierta",
        "unidad": "m²"
    },
    {
        "codigo": "IMP014",
        "capitulo": "06",
        "descripcion": "Bajante PVC serie B D=110mm cubierta",
        "unidad": "m"
    },
    {
        "codigo": "IMP015",
        "capitulo": "06",
        "descripcion": "Canaleta recogida aguas cubierta plana zinc",
        "unidad": "m"
    },
    {
        "codigo": "IMP016",
        "capitulo": "06",
        "descripcion": "Grava canto rodado 16-32mm capa proteccion cubierta plana",
        "unidad": "m²"
    },
    {
        "codigo": "IMP017",
        "capitulo": "06",
        "descripcion": "Impermeabilizacion muros sotano lamina drenante HDPE",
        "unidad": "m²"
    },
    {
        "codigo": "IMP018",
        "capitulo": "06",
        "descripcion": "Membrana liquida impermeabilizante poliuretano terraza",
        "unidad": "m²"
    },
    {
        "codigo": "AMI001",
        "capitulo": "07",
        "descripcion": "Retirada amianto friable proyectado techo empresa RERA",
        "unidad": "m²"
    },
    {
        "codigo": "AMI002",
        "capitulo": "07",
        "descripcion": "Retirada placas fibrocemento cubierta ondulada empresa RERA",
        "unidad": "m²"
    },
    {
        "codigo": "AMI003",
        "capitulo": "07",
        "descripcion": "Retirada tuberias fibrocemento saneamiento empresa RERA",
        "unidad": "m"
    },
    {
        "codigo": "AMI004",
        "capitulo": "07",
        "descripcion": "Retirada calorifugado amianto tuberias instalaciones empresa RERA",
        "unidad": "m"
    },
    {
        "codigo": "AMI005",
        "capitulo": "07",
        "descripcion": "Retirada panel sandwich fibrocemento fachada empresa RERA",
        "unidad": "m²"
    },
    {
        "codigo": "AMI006",
        "capitulo": "07",
        "descripcion": "Encapsulamiento amianto no friable techos empresa RERA",
        "unidad": "m²"
    },
    {
        "codigo": "AMI007",
        "capitulo": "07",
        "descripcion": "Transporte residuos amianto a vertedero autorizado",
        "unidad": "m³"
    },
    {
        "codigo": "AMI008",
        "capitulo": "07",
        "descripcion": "Plan de trabajo retirada amianto redaccion tecnico",
        "unidad": "ud"
    },
    {
        "codigo": "AMI009",
        "capitulo": "07",
        "descripcion": "Mediciones higienicas aire durante retirada amianto",
        "unidad": "ud"
    },
    {
        "codigo": "AMI010",
        "capitulo": "07",
        "descripcion": "EPI especifico trabajador retirada amianto dia",
        "unidad": "ud"
    },
    {
        "codigo": "AMI011",
        "capitulo": "07",
        "descripcion": "Confinamiento zona trabajo laminas polietileno con presurizacion",
        "unidad": "m²"
    },
    {
        "codigo": "AMI012",
        "capitulo": "07",
        "descripcion": "Descontaminacion zona trabajo post-retirada amianto",
        "unidad": "m²"
    },
    {
        "codigo": "CER001",
        "capitulo": "08",
        "descripcion": "Barandilla acero inoxidable 18/8 h=90cm sin vidrio",
        "unidad": "m"
    },
    {
        "codigo": "CER002",
        "capitulo": "08",
        "descripcion": "Barandilla acero inox h=110cm con vidrio templado",
        "unidad": "m"
    },
    {
        "codigo": "CER003",
        "capitulo": "08",
        "descripcion": "Barandilla acero galvanizado pintado h=90cm",
        "unidad": "m"
    },
    {
        "codigo": "CER004",
        "capitulo": "08",
        "descripcion": "Reja fija acero cuadradillo 12mm ventana 100x120cm",
        "unidad": "ud"
    },
    {
        "codigo": "CER005",
        "capitulo": "08",
        "descripcion": "Puerta metalica chapa galvanizada acceso escalera",
        "unidad": "ud"
    },
    {
        "codigo": "CER006",
        "capitulo": "08",
        "descripcion": "Ventana aluminio rotura puente termico doble vidrio 120x120cm",
        "unidad": "ud"
    },
    {
        "codigo": "CER007",
        "capitulo": "08",
        "descripcion": "Ventana aluminio RPT triple vidrio 150x150cm",
        "unidad": "ud"
    },
    {
        "codigo": "CER008",
        "capitulo": "08",
        "descripcion": "Persiana aluminio lamas orientables exterior motorizada 120x150",
        "unidad": "ud"
    },
    {
        "codigo": "CER009",
        "capitulo": "08",
        "descripcion": "Cierrapuertas aereo brazo deslizante para puerta metalica",
        "unidad": "ud"
    },
    {
        "codigo": "CER010",
        "capitulo": "08",
        "descripcion": "Pasamanos tubo acero inox d=42mm escalera interior",
        "unidad": "m"
    },
    {
        "codigo": "CER011",
        "capitulo": "08",
        "descripcion": "Remate peto cubierta chapa galvanizada plegada",
        "unidad": "m"
    },
    {
        "codigo": "CER012",
        "capitulo": "08",
        "descripcion": "Goterón zinc perfil plegado alero",
        "unidad": "m"
    },
    {
        "codigo": "CER013",
        "capitulo": "08",
        "descripcion": "Marquesina acero galvanizado polipropileno 100x80cm",
        "unidad": "ud"
    },
    {
        "codigo": "CER014",
        "capitulo": "08",
        "descripcion": "Rejilla ventilacion metalica fachada",
        "unidad": "ud"
    },
    {
        "codigo": "CER015",
        "capitulo": "08",
        "descripcion": "Reparacion soldadura estructura metalica existente",
        "unidad": "h"
    },
    {
        "codigo": "SSO001",
        "capitulo": "09",
        "descripcion": "Estudio basico seguridad salud redaccion tecnico",
        "unidad": "ud"
    },
    {
        "codigo": "SSO002",
        "capitulo": "09",
        "descripcion": "Plan seguridad salud redaccion tecnico",
        "unidad": "ud"
    },
    {
        "codigo": "SSO003",
        "capitulo": "09",
        "descripcion": "Coordinador seguridad salud durante ejecucion obra",
        "unidad": "h"
    },
    {
        "codigo": "SSO004",
        "capitulo": "09",
        "descripcion": "Casco seguridad polietileno",
        "unidad": "ud"
    },
    {
        "codigo": "SSO005",
        "capitulo": "09",
        "descripcion": "Arnes anticaida certificado EN361",
        "unidad": "ud"
    },
    {
        "codigo": "SSO006",
        "capitulo": "09",
        "descripcion": "Linea vida horizontal cable acero inox 8mm cubierta",
        "unidad": "m"
    },
    {
        "codigo": "SSO007",
        "capitulo": "09",
        "descripcion": "Punto anclaje estructural fijo cubierta EN795",
        "unidad": "ud"
    },
    {
        "codigo": "SSO008",
        "capitulo": "09",
        "descripcion": "Red seguridad tipo S perimetral fachada EN1263",
        "unidad": "m²"
    },
    {
        "codigo": "SSO009",
        "capitulo": "09",
        "descripcion": "Bandeja recogida escombros fachada",
        "unidad": "m"
    },
    {
        "codigo": "SSO010",
        "capitulo": "09",
        "descripcion": "Señalizacion vial obra cono balizamiento",
        "unidad": "ud"
    },
    {
        "codigo": "SSO011",
        "capitulo": "09",
        "descripcion": "Cartel señalizacion obligatoria EPI obra",
        "unidad": "ud"
    },
    {
        "codigo": "SSO012",
        "capitulo": "09",
        "descripcion": "Instalacion caseta vestuario prefabricada mes",
        "unidad": "mes"
    },
    {
        "codigo": "SSO013",
        "capitulo": "09",
        "descripcion": "Instalacion aseo prefabricado mes",
        "unidad": "mes"
    },
    {
        "codigo": "SSO014",
        "capitulo": "09",
        "descripcion": "Extintor polvo ABC 6kg colocado",
        "unidad": "ud"
    },
    {
        "codigo": "SSO015",
        "capitulo": "09",
        "descripcion": "Botiquin primeros auxilios dotado",
        "unidad": "ud"
    },
    {
        "codigo": "SSO016",
        "capitulo": "09",
        "descripcion": "Formacion seguridad trabajador hora",
        "unidad": "h"
    },
    {
        "codigo": "SSO017",
        "capitulo": "09",
        "descripcion": "Reconocimiento medico anual trabajador",
        "unidad": "ud"
    },
    {
        "codigo": "RCD001",
        "capitulo": "10",
        "descripcion": "Contenedor RCD 7m3 entrega alquiler recogida canon <10 ton",
        "unidad": "ud"
    },
    {
        "codigo": "RCD002",
        "capitulo": "10",
        "descripcion": "Contenedor RCD 5m3 entrega alquiler recogida canon",
        "unidad": "ud"
    },
    {
        "codigo": "RCD003",
        "capitulo": "10",
        "descripcion": "Contenedor RCD 12m3 entrega alquiler recogida canon",
        "unidad": "ud"
    },
    {
        "codigo": "RCD004",
        "capitulo": "10",
        "descripcion": "Clasificacion residuos construccion demolicion pie obra manual",
        "unidad": "m³"
    },
    {
        "codigo": "RCD005",
        "capitulo": "10",
        "descripcion": "Carga RCD escombros naturaleza petrea sacos manual 20m",
        "unidad": "m³"
    },
    {
        "codigo": "RCD006",
        "capitulo": "10",
        "descripcion": "Transporte RCD vertedero autorizado camion 15t 20km",
        "unidad": "m³"
    },
    {
        "codigo": "RCD007",
        "capitulo": "10",
        "descripcion": "Canon vertedero RCD naturaleza petrea",
        "unidad": "m³"
    },
    {
        "codigo": "RCD008",
        "capitulo": "10",
        "descripcion": "Gestion residuos peligrosos envases contaminados",
        "unidad": "kg"
    },
    {
        "codigo": "RCD009",
        "capitulo": "10",
        "descripcion": "Plan gestion residuos construccion redaccion tecnico",
        "unidad": "ud"
    },
    {
        "codigo": "RCD010",
        "capitulo": "10",
        "descripcion": "Separacion selectiva residuos ceramicos acopio",
        "unidad": "m³"
    },
    {
        "codigo": "RCD011",
        "capitulo": "10",
        "descripcion": "Separacion selectiva residuos metalicos acopio",
        "unidad": "m³"
    },
    {
        "codigo": "RCD012",
        "capitulo": "10",
        "descripcion": "Separacion selectiva madera acopio obra",
        "unidad": "m³"
    },
    {
        "codigo": "VP001",
        "capitulo": "11",
        "descripcion": "Trabajos en altura con acceso por cuerda IRATA nivel 1 h/operario",
        "unidad": "ud"
    },
    {
        "codigo": "VP002",
        "capitulo": "11",
        "descripcion": "Trabajos en altura con acceso por cuerda IRATA nivel 2 h/operario",
        "unidad": "ud"
    },
    {
        "codigo": "VP003",
        "capitulo": "11",
        "descripcion": "Trabajos en altura con acceso por cuerda IRATA nivel 3 tecnico",
        "unidad": "h"
    },
    {
        "codigo": "VP004",
        "capitulo": "11",
        "descripcion": "Equipo 2 tecnicos cuerda media jornada 4h",
        "unidad": "ud"
    },
    {
        "codigo": "VP005",
        "capitulo": "11",
        "descripcion": "Equipo 2 tecnicos cuerda jornada completa 8h",
        "unidad": "ud"
    },
    {
        "codigo": "VP006",
        "capitulo": "11",
        "descripcion": "Inspeccion fachada acceso cuerda informe tecnico",
        "unidad": "m²"
    },
    {
        "codigo": "VP007",
        "capitulo": "11",
        "descripcion": "Limpieza fachada acceso cuerda hidrofugado",
        "unidad": "m²"
    },
    {
        "codigo": "VP008",
        "capitulo": "11",
        "descripcion": "Sellado juntas fachada acceso cuerda",
        "unidad": "m"
    },
    {
        "codigo": "VP009",
        "capitulo": "11",
        "descripcion": "Aplicacion pintura fachada acceso cuerda 2 manos",
        "unidad": "m²"
    },
    {
        "codigo": "VP010",
        "capitulo": "11",
        "descripcion": "Picado saneado elemento localizado acceso cuerda",
        "unidad": "m²"
    },
    {
        "codigo": "VP011",
        "capitulo": "11",
        "descripcion": "Reparacion localizada mortero acceso cuerda",
        "unidad": "m²"
    },
    {
        "codigo": "VP012",
        "capitulo": "11",
        "descripcion": "Colocacion anclaje puntual fachada acceso cuerda",
        "unidad": "ud"
    },
    {
        "codigo": "VP013",
        "capitulo": "11",
        "descripcion": "Instalacion linea vida horizontal acceso cuerda",
        "unidad": "m"
    },
    {
        "codigo": "VP014",
        "capitulo": "11",
        "descripcion": "Revision instalacion pararrayos acceso cuerda",
        "unidad": "ud"
    },
    {
        "codigo": "VP015",
        "capitulo": "11",
        "descripcion": "Limpieza canalones bajantes acceso cuerda",
        "unidad": "m"
    },
    {
        "codigo": "VP016",
        "capitulo": "11",
        "descripcion": "Desplazamiento equipo hasta 50km",
        "unidad": "ud"
    },
    {
        "codigo": "VP017",
        "capitulo": "11",
        "descripcion": "Desplazamiento equipo 50-150km",
        "unidad": "ud"
    },
    {
        "codigo": "VP018",
        "capitulo": "11",
        "descripcion": "Pequeño material consumibles dia equipo",
        "unidad": "día"
    },
    {
        "codigo": "INS001",
        "capitulo": "12",
        "descripcion": "Colector saneamiento PVC serie B D=110mm bajo solera",
        "unidad": "m"
    },
    {
        "codigo": "INS002",
        "capitulo": "12",
        "descripcion": "Colector saneamiento PVC serie B D=160mm bajo solera",
        "unidad": "m"
    },
    {
        "codigo": "INS003",
        "capitulo": "12",
        "descripcion": "Bajante PVC serie B D=90mm",
        "unidad": "m"
    },
    {
        "codigo": "INS004",
        "capitulo": "12",
        "descripcion": "Bajante PVC serie B D=110mm",
        "unidad": "m"
    },
    {
        "codigo": "INS005",
        "capitulo": "12",
        "descripcion": "Canaleta recogida aguas pluviales zinc 250mm",
        "unidad": "m"
    },
    {
        "codigo": "INS006",
        "capitulo": "12",
        "descripcion": "Arqueta pie bajante ladrillo 40x40x50 con tapa fundicion",
        "unidad": "ud"
    },
    {
        "codigo": "INS007",
        "capitulo": "12",
        "descripcion": "Arqueta paso registro ladrillo 51x51x65 tapa fundicion",
        "unidad": "ud"
    },
    {
        "codigo": "INS008",
        "capitulo": "12",
        "descripcion": "Limpieza tuberia red saneamiento equipo succionador 5h",
        "unidad": "ud"
    },
    {
        "codigo": "INS009",
        "capitulo": "12",
        "descripcion": "Sumidero sifon PVC cubierta plana D=110mm",
        "unidad": "ud"
    },
    {
        "codigo": "INS010",
        "capitulo": "12",
        "descripcion": "Cazoleta sumidero prefabricado hormigon cubierta plana",
        "unidad": "ud"
    },
    {
        "codigo": "INS011",
        "capitulo": "12",
        "descripcion": "Acometida saneamiento pluvial edificio a red municipal",
        "unidad": "ud"
    },
    {
        "codigo": "INS012",
        "capitulo": "12",
        "descripcion": "Instalacion puesta a tierra edificio",
        "unidad": "ud"
    },
    {
        "codigo": "INS013",
        "capitulo": "12",
        "descripcion": "Cuadro electrico provisional obra hasta 50kW",
        "unidad": "ud"
    },
    {
        "codigo": "INS014",
        "capitulo": "12",
        "descripcion": "Punto luz provisional obra lampara LED",
        "unidad": "ud"
    },
    {
        "codigo": "INS015",
        "capitulo": "12",
        "descripcion": "Toma corriente provisional obra 16A schuko",
        "unidad": "ud"
    }
];