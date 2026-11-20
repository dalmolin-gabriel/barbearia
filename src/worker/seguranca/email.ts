import { z } from "zod";

/** E-mail de login: sem espaços nas pontas, em minúsculas, formato válido e no máximo 254 caracteres. */
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
