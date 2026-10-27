import { z } from 'zod';

const email = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .max(254, 'Email is too long.')
  .pipe(z.email('Enter a valid email address.'))
  .transform((v) => v.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  // bcrypt only uses the first 72 bytes; reject longer passwords instead of silently truncating.
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 bytes long.')
  .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), 'Password must contain at least one letter and one number.');

export const registerSchema = z
  .object({
    email,
    displayName: z.string().trim().min(1, 'Name is required.').max(80, 'Name must be at most 80 characters.'),
    password: passwordSchema,
  })
  .refine((d) => d.password.toLowerCase() !== d.email, {
    path: ['password'],
    message: 'Password must not be the same as your email.',
  });

export const loginSchema = z.object({
  email,
  // No strength rules here: just bound the size so we never hash huge inputs.
  password: z.string().min(1, 'Password is required.').max(1024),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
