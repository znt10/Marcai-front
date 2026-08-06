import { hash } from '@node-rs/argon2';

const senha = process.argv[2];
if (!senha) {
  console.error('uso: npm run admin:hash -- "sua senha aqui"');
  process.exit(1);
}

hash(senha).then((h) => {
  // Base64 de propósito: o hash argon2 é cheio de `$`, e tanto o @next/env
  // quanto o Docker Compose tratam `$` como início de variável. Em claro, ele
  // chega truncado ao processo e a senha nunca confere.
  console.log('\nCole no .env:\n');
  console.log(`ADMIN_SENHA_HASH_B64="${Buffer.from(h, 'utf8').toString('base64')}"`);
  console.log('\nO valor é o hash em base64 — nem o hash nem a senha aparecem');
  console.log('em claro em lugar nenhum do ambiente.\n');
});
