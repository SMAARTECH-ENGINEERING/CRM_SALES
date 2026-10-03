import Joi from 'joi';

const BCRYPT_MAX_BYTES = 72;

// The format is checked, but not the top-level domain: Joi's built-in TLD list
// goes stale and would reject valid addresses on newer domains.
export const email = Joi.string()
  .trim()
  .lowercase()
  .email({ tlds: { allow: false } })
  .max(254);
export const personName = Joi.string().trim().min(1).max(50);

// Password policy: 8-72 chars with lower, upper, digit and special character.
// bcrypt ignores input past 72 bytes, so longer passwords are rejected outright.
export const strongPassword = Joi.string()
  .min(8)
  .pattern(/[a-z]/, 'lowercase letter')
  .pattern(/[A-Z]/, 'uppercase letter')
  .pattern(/\d/, 'number')
  .pattern(/[^A-Za-z0-9]/, 'special character')
  .custom((value, helpers) =>
    Buffer.byteLength(value, 'utf8') > BCRYPT_MAX_BYTES ? helpers.error('password.tooLong') : value
  )
  .messages({
    'string.min': '{{#label}} must be at least {{#limit}} characters long',
    'string.pattern.name': '{{#label}} must contain at least one {{#name}}',
    'password.tooLong': `{{#label}} must be at most ${BCRYPT_MAX_BYTES} bytes long`,
  });

// Access can never be chosen at sign-up: these are rejected rather than ignored
// so a caller is told plainly that it did not work.
export const noAccessFields = {
  role: Joi.forbidden(),
  roleId: Joi.forbidden(),
  permissions: Joi.forbidden(),
};

export const registerSchema = Joi.object({
  firstName: personName.required(),
  lastName: personName.required(),
  email: email.required(),
  password: strongPassword.required(),
  ...noAccessFields,
});

// Login deliberately does not apply the password policy: it would leak the rules
// and lock out accounts created under an older policy.
export const loginSchema = Joi.object({
  email: email.required(),
  password: Joi.string().max(256).required(),
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().max(2048).required(),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().max(256).required(),
  newPassword: strongPassword
    .invalid(Joi.ref('currentPassword'))
    .required()
    .messages({ 'any.invalid': '{{#label}} must be different from the current password' }),
});
