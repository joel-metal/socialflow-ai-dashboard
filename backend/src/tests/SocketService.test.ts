import { createServer, Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { SocketService } from '../services/SocketService';

// Disable actual Redis for these simple example tests by avoiding createAdapter or mocking
vi.mock('@socket.io/redis-adapter', () => ({
  createAdapter: vi.fn(),
}));
vi.mock('ioredis');

describe('SocketService Integration', () => {
  let io: Server;
  let _serverSocket: unknown;
  let clientSocket: ClientSocket;
  let httpServer: HttpServer;
  let port: number;

  const validToken = jwt.sign({ id: 'user_123', name: 'Test User' }, 'secret');

  beforeAll((done) => {
    httpServer = createServer();
    const service = SocketService.getInstance();
    process.env.JWT_SECRET = 'secret';
    service.initialize(httpServer);
    io = service.getIo()!;

    httpServer.listen(() => {
      port = (httpServer.address() as any).port;
      done();
    });
  });

  afterAll(() => {
    io.close();
  });

  afterEach(() => {
    if (clientSocket) {
      clientSocket.close();
    }
  });

  it('should successfully connect with a valid JWT token', (done) => {
    clientSocket = Client(`http://localhost:${port}`, {
      auth: { token: validToken },
    });

    clientSocket.on('connect', () => {
      expect(clientSocket.connected).toBe(true);
      done();
    });
  });

  it('should fail to connect without a token', (done) => {
    clientSocket = Client(`http://localhost:${port}`);

    clientSocket.on('connect_error', (err) => {
      expect(err.message).toBe('Authentication error');
      done();
    });
  });

  it('should fail to connect with an invalid token', (done) => {
    clientSocket = Client(`http://localhost:${port}`, {
      auth: { token: 'invalid_token_here' },
    });

    clientSocket.on('connect_error', (err) => {
      expect(err.message).toBe('Authentication error');
      done();
    });
  });

  it('should join an organization room correctly', (done) => {
    clientSocket = Client(`http://localhost:${port}?orgId=org1`, {
      auth: { token: validToken },
    });

    clientSocket.on('connect', () => {
      // Need a bit of time for the server to process the join
      setTimeout(() => {
        const rooms = io.sockets.adapter.rooms;
        expect(rooms.get('org:org1')).toBeDefined();
        done();
      }, 50);
    });
  });

  it('should allow emitting and receiving an event in a room', (done) => {
    let receivedPayload: any;

    // Connect user 1 directly without org
    const user_socket1 = Client(`http://localhost:${port}`, {
      auth: { token: validToken },
    });

    user_socket1.on('message', (payload) => {
      receivedPayload = payload;
      expect(receivedPayload.text).toBe('Hello world!');
      expect(receivedPayload.from).toBeDefined();
      user_socket1.disconnect();
      done();
    });

    user_socket1.on('connect', () => {
      user_socket1.emit('message', { text: 'Hello world!' });
    });
  });
});
