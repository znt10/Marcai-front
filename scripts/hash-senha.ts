import { hash } from '@node-rs/argon2';

const senha = process.argv[2];
if (!senha) {
  console.error('uso: npm run admin:hash -- "sua senha aqui"');
  process.exit(1);
}

hash(senha).then((h) => {
  console.log('\nCole no .env:\n');
  console.log(`ADMIN_SENHA_HASH='${h}'`);
  console.log('\nAspas SIMPLES: o hash tem $ dentro, e aspas duplas fazem o');
  console.log('shell expandir aquilo como variável — o valor chegaria truncado.\n');
});
