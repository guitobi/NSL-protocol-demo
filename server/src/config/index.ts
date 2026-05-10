function getPort(): number {
  // Check environment variable
  if (process.env.PORT) {
    return parseInt(process.env.PORT, 10);
  }

  // Check command line arguments: --port=3001 or --port 3001
  const portArgIndex = process.argv.findIndex(arg => arg === '--port' || arg.startsWith('--port='));
  if (portArgIndex !== -1) {
    const arg = process.argv[portArgIndex];
    if (arg.startsWith('--port=')) {
      return parseInt(arg.split('=')[1], 10);
    } else if (portArgIndex + 1 < process.argv.length) {
      return parseInt(process.argv[portArgIndex + 1], 10);
    }
  }

  return 3000;
}

export const config = {
  port: getPort(),
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
};
