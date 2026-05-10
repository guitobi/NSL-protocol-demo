import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config } from './config';
import { createClientManager } from './services/ClientManager';
import { createMitmManager } from './services/MitmManager';
import { setupSocketHandlers } from './handlers/socketHandlers';

const app = express();
const httpServer = createServer(app);

app.use(cors());

const io = new Server(httpServer, {
  cors: config.cors,
});

const clientManager = createClientManager();
const mitmManager = createMitmManager();

// Protocol state management
let currentProtocol: 'NSPK' | 'NSL' | null = null;

io.on('connection', (socket) => {
  setupSocketHandlers(socket, io, clientManager, mitmManager, currentProtocol, (protocol) => {
    currentProtocol = protocol;
  });

  // Send current protocol to newly connected client
  if (currentProtocol) {
    socket.emit('message', {
      type: 'PROTOCOL_SET',
      from: 'server',
      to: 'client',
      payload: { protocol: currentProtocol },
      timestamp: Date.now(),
    });
  }
});

httpServer.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
});
