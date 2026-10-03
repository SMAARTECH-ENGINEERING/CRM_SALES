// Creates a user with the full-access role - the way to get a first account that
// can manage users and roles (and the only way when public registration is disabled).
//
//   npm run create:admin -- --first-name Jane --last-name Doe --email admin@your-company.com
//
// The password is read from the ADMIN_PASSWORD environment variable so it does
// not end up in shell history; --password is accepted as a fallback.
import { parseArgs } from 'node:util';
import Joi from 'joi';
import { connectDB, disconnectDB } from '../src/config/db.js';
import Role from '../src/models/Role.js';
import User from '../src/models/User.js';
import { syncRbac } from '../src/services/seed.service.js';
import { hashPassword } from '../src/utils/password.js';
import { email, personName, strongPassword } from '../src/validators/auth.validator.js';

const { values } = parseArgs({
  options: {
    'first-name': { type: 'string' },
    'last-name': { type: 'string' },
    email: { type: 'string' },
    password: { type: 'string' },
  },
});

const schema = Joi.object({
  firstName: personName.required().label('first-name'),
  lastName: personName.required().label('last-name'),
  email: email.required(),
  password: strongPassword.required(),
});

const { value, error } = schema.validate(
  {
    firstName: values['first-name'],
    lastName: values['last-name'],
    email: values.email,
    password: process.env.ADMIN_PASSWORD ?? values.password,
  },
  { abortEarly: false }
);

if (error) {
  console.error(error.details.map((d) => `- ${d.message.replace(/"/g, '')}`).join('\n'));
  console.error(
    '\nUsage: npm run create:admin -- --first-name Jane --last-name Doe --email admin@your-company.com'
  );
  console.error('Set the password in the ADMIN_PASSWORD environment variable.');
  process.exit(1);
}

let exitCode = 0;
try {
  await connectDB();
  const existing = await User.findOne({ email: value.email }).setOptions({ withDeleted: true });
  if (existing) {
    console.error(`A user with email ${value.email} already exists`);
    exitCode = 1;
  } else {
    await syncRbac();
    const role = await Role.findOne({ isSuperAdmin: true });
    const user = await User.create({
      firstName: value.firstName,
      lastName: value.lastName,
      email: value.email,
      passwordHash: await hashPassword(value.password),
      roleId: role._id,
    });
    console.log(`Administrator created: ${user.email} (id ${user.id})`);
  }
} catch (err) {
  console.error(`Failed to create administrator: ${err.message}`);
  exitCode = 1;
} finally {
  await disconnectDB();
}
process.exit(exitCode);
