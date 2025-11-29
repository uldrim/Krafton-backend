import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface PlayerInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

interface Player {
  id: string;
  x: number;
  y: number;
  input: PlayerInput;
}

@WebSocketGateway({
  cors: true,
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name);
  @WebSocketServer()
  server: Server;

  players: Record<string, Player> = {};
  private interval: NodeJS.Timeout;

  private readonly TICK_RATE = 30;
  private readonly SPEED = 3;

  constructor() {
    this.interval = setInterval(() => this.gameLoop(), 1000 / this.TICK_RATE);
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    delete this.players[client.id];
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_game')
  handleJoin(@ConnectedSocket() client: Socket) {
    this.players[client.id] = {
      id: client.id,
      x: Math.random() * 300 + 50,
      y: Math.random() * 300 + 50,
      input: { up: false, down: false, left: false, right: false },
    };
    client.emit('joined', { id: client.id });

    this.logger.log(`Client joined: ${client.id}`);
  }

  @SubscribeMessage('input')
  handleInput(
    @MessageBody() data: PlayerInput,
    @ConnectedSocket() client: Socket,
  ) {
    const p = this.players[client.id];
    if (!p) return;
    p.input = data;
  }

  private gameLoop() {
    //Updating player positions
    for (const id in this.players) {
      const p = this.players[id];
      const input = p.input;

      if (input.up) p.y -= this.SPEED;
      if (input.down) p.y += this.SPEED;
      if (input.left) p.x -= this.SPEED;
      if (input.right) p.x += this.SPEED;
    }

    //Broadcast entire game state
    this.server.emit('state', {
      players: this.players,
    });
  }
}
