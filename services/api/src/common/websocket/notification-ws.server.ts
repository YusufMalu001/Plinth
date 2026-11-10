import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage, Server } from 'http';
import { URL } from 'url';
import { verifyAccessToken } from '../../modules/auth/auth.tokens';
import { logger } from '../utils/logger';
import { prisma } from '../../database';
import { DatabasePermissionChecker } from '../../modules/users/rbac';

export interface NotificationPayload {
  id: string;
  recipientId: string;
  type: string;
  title: string;
  message: string;
  resource?: string | null;
  resourceId?: string | null;
  href?: string | null;
  createdAt: Date;
  readAt?: Date | null;
  metadata?: Record<string, unknown>;
}

interface AuthenticatedClient {
  ws: WebSocket;
  userId: string;
  userRole: string;
  assignedLocationId?: string | null;
  isAlive: boolean;
}

export class NotificationWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Set<AuthenticatedClient>> = new Map(); // userId -> Set of active client connections
  private pingInterval: NodeJS.Timeout | null = null;
  private permissionChecker = new DatabasePermissionChecker();

  /**
   * Initializes and attaches the WebSocketServer to the main HTTP Server.
   */
  initialize(server: Server): void {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      try {
        const urlObj = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
        if (urlObj.pathname !== '/ws/notifications' && urlObj.pathname !== '/api/v1/ws/notifications') {
          socket.destroy();
          return;
        }

        // Authenticate via token parameter or Authorization header or cookie
        let token = urlObj.searchParams.get('token');
        if (!token && request.headers.authorization?.startsWith('Bearer ')) {
          token = request.headers.authorization.slice(7);
        }
        if (!token && request.headers.cookie) {
          const match = request.headers.cookie.match(/accessToken=([^;]+)/);
          if (match) token = match[1];
        }

        if (!token) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        const decoded = verifyAccessToken(token);
        const userId = decoded.sub;

        this.wss?.handleUpgrade(request, socket, head, async (ws) => {
          await this.handleConnection(ws as WebSocket, userId);
        });
      } catch (err) {
        logger.warn('WebSocket connection authentication rejected', { details: (err as Error).message });
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      }
    });

    // Heartbeat mechanism to detect dead clients on unstable warehouse networks
    this.pingInterval = setInterval(() => {
      for (const [userId, userClients] of this.clients.entries()) {
        for (const client of userClients) {
          if (!client.isAlive) {
            client.ws.terminate();
            userClients.delete(client);
            continue;
          }
          client.isAlive = false;
          client.ws.ping();
        }
        if (userClients.size === 0) {
          this.clients.delete(userId);
        }
      }
    }, 30000);

    logger.info('📡 Notification WebSocket Server initialized on /ws/notifications');
  }

  private async handleConnection(ws: WebSocket, userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, assignedLocationId: true }
    });

    if (!user) {
      ws.close(4001, 'User not found');
      return;
    }

    const client: AuthenticatedClient = {
      ws,
      userId: user.id,
      userRole: user.role,
      assignedLocationId: user.assignedLocationId,
      isAlive: true
    };

    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId)!.add(client);

    ws.on('pong', () => {
      client.isAlive = true;
    });

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    ws.on('close', () => {
      const userClients = this.clients.get(userId);
      if (userClients) {
        userClients.delete(client);
        if (userClients.size === 0) {
          this.clients.delete(userId);
        }
      }
    });

    // Send connection ACK with unread count
    const unreadCount = await prisma.notification.count({
      where: { recipientId: userId, readAt: null }
    });

    ws.send(JSON.stringify({
      type: 'CONNECTION_ESTABLISHED',
      userId,
      unreadCount,
      timestamp: new Date().toISOString()
    }));
  }

  /**
   * Pushes a real-time notification to a specific recipient.
   */
  sendToUser(recipientId: string, notification: NotificationPayload): void {
    const userClients = this.clients.get(recipientId);
    if (!userClients || userClients.size === 0) return;

    const payload = JSON.stringify({
      type: 'NOTIFICATION',
      data: notification
    });

    for (const client of userClients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  /**
   * Broadcasts to all users that satisfy a permission and location/material scope.
   */
  async broadcastToRoleScope(params: {
    action: string;
    resource: string;
    locationId?: string;
    materialType?: string;
    notificationFactory: (userId: string) => Omit<NotificationPayload, 'recipientId'>;
  }): Promise<void> {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, role: true, assignedLocationId: true }
    });

    for (const user of users) {
      // Permission check
      const isAllowed = await this.permissionChecker.can(user.id, params.action, params.resource, {
        role: user.role as never,
        locationId: user.assignedLocationId ?? undefined
      });
      if (!isAllowed) continue;

      // Location scope check: if locationId specified and user is scoped to a specific location, must match
      if (params.locationId && user.assignedLocationId && user.assignedLocationId !== params.locationId) {
        // Admins bypass location restriction if allLocations is true
        const isGlobal = user.role === 'admin';
        if (!isGlobal) continue;
      }

      // Material type scope check: Inventory Manager is RAW_MATERIAL only
      if (user.role === 'employee' || user.role === 'manager') {
        const userRoles = await prisma.userRole.findMany({
          where: { userId: user.id },
          include: { role: true }
        });
        const isOnlyInventoryManager = userRoles.some(ur => ur.role.name === 'inventory-manager') &&
          !userRoles.some(ur => ur.role.name === 'store-manager' || ur.role.name === 'admin');

        if (isOnlyInventoryManager && params.materialType && params.materialType !== 'RAW_MATERIAL') {
          continue;
        }
      }

      const notifData = params.notificationFactory(user.id);
      const saved = await prisma.notification.create({
        data: {
          recipientId: user.id,
          type: notifData.type as never,
          title: notifData.title,
          message: notifData.message,
          resource: notifData.resource,
          resourceId: notifData.resourceId,
          href: notifData.href
        }
      });

      this.sendToUser(user.id, {
        ...saved,
        metadata: notifData.metadata
      });
    }
  }

  close(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.wss?.close();
  }
}

export const notificationWsServer = new NotificationWebSocketServer();
