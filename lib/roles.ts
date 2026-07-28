export const ROLES = ["comercial", "direccion"] as const;
export type Rol = (typeof ROLES)[number];