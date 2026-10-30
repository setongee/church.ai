import { io, type Socket } from 'socket.io-client';
import { getToken } from './auth';
import { getDeviceId } from './deviceId';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, { autoConnect: false, transports: ['websocket'], auth: (cb) => cb({ token: getToken(), deviceId: getDeviceId() }) });
  }
  return socket;
}
