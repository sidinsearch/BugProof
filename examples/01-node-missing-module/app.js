// Demo: a real-world Node.js failure where a dependency was assumed installed
// but isn't. BugProof's --self-heal flag can install it and retry replay.
const redis = require('redis');

async function main() {
  const client = redis.createClient();
  await client.connect();
  const value = await client.get('hello');
  console.log('Got:', value);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
