import bcrypt from "bcryptjs";

const password = process.argv[2];

if (!password) {
    console.log('Uso: node generar-hash.mjs "Tu-Contraseña"');
    process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
const b64 = Buffer.from(hash, 'utf8').toString('base64');

console.log('Hash bcrypt: ', hash);
console.log('Base64: ', b64);