import { hashSuperAdminPassword } from '../src/super-admin-auth.mjs';

const password = process.argv.slice(2).join(' ');
if (!password) {
  console.error('Uso: npm run superadmin:hash -- "UnaPasswordMoltoForte"');
  process.exit(1);
}

try {
  console.log(hashSuperAdminPassword(password));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
