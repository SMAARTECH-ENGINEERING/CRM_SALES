import * as yup from 'yup';

// Same policy the API enforces (server/src/validators/auth.validator.js).
export const strongPassword = yup
  .string()
  .required('Password is required')
  .min(8, 'Must be at least 8 characters long')
  .max(72, 'Must be at most 72 characters long')
  .matches(/[a-z]/, 'Must contain at least one lowercase letter')
  .matches(/[A-Z]/, 'Must contain at least one uppercase letter')
  .matches(/\d/, 'Must contain at least one number')
  .matches(/[^A-Za-z0-9]/, 'Must contain at least one special character');

// Shows API validation errors on the matching form fields; anything that does
// not belong to a field becomes the form-level error.
export function applyApiErrors(error, setError, fieldNames) {
  const fieldErrors = (error.errors ?? []).filter((e) => fieldNames.includes(e.field));
  fieldErrors.forEach((e) => setError(e.field, { message: e.message }));
  if (!fieldErrors.length) setError('root', { message: error.message });
}
