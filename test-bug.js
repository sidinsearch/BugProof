// Simulating a real error
function run() {
  throw new Error('Database connection failed! Unable to connect to host.');
}
run();
