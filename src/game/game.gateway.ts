import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';

import { Server, Socket } from 'socket.io';

// ---------------------------
// Types
// ---------------------------

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

interface Coin {
  id: number;
  x: number;
  y: number;
  spawnTime: number; // NEW: for TTL
}

// ---------------------------
// Gateway
// ---------------------------

@WebSocketGateway({
  cors: { origin: '*' },
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // ---------------------------
  // Game State
  // ---------------------------
  players: Record<string, Player> = {};
  scores: Record<string, number> = {};
  coins: Coin[] = [];
  nextCoinId = 1;

  // ---------------------------
  // Settings
  // ---------------------------
  private readonly TICK_RATE = 30; // 30 FPS game loop
  private readonly SPEED = 3; // player movement speed
  private readonly COIN_TTL = 20000; // 8 seconds TTL
  private readonly MAX_COINS = 20; // max coins allowed

  private interval: NodeJS.Timeout;

  constructor() {
    // Game loop
    this.interval = setInterval(() => this.gameLoop(), 1000 / this.TICK_RATE);

    // Spawn coins periodically
    setInterval(() => this.spawnCoin(), 2000); // every 2 seconds
  }

  // ---------------------------
  // Connection Handlers
  // ---------------------------

  handleConnection(client: Socket) {
    console.log('Client connected:', client.id);
  }

  handleDisconnect(client: Socket) {
    console.log('Client disconnected:', client.id);

    delete this.players[client.id];
    delete this.scores[client.id];
  }

  // ---------------------------
  // Player Joining
  // ---------------------------

  @SubscribeMessage('join_game')
  handleJoin(@ConnectedSocket() client: Socket) {
    console.log('Player joined game:', client.id);

    this.players[client.id] = {
      id: client.id,
      x: Math.random() * 300 + 50,
      y: Math.random() * 300 + 50,
      input: { up: false, down: false, left: false, right: false },
    };

    this.scores[client.id] = 0;

    client.emit('joined', { id: client.id });
  }

  // ---------------------------
  // Input Handling
  // ---------------------------

  @SubscribeMessage('input')
  handleInput(
    @MessageBody() data: PlayerInput,
    @ConnectedSocket() client: Socket,
  ) {
    const p = this.players[client.id];
    if (!p) return;

    p.input = data;
  }

  // ---------------------------
  // Coin Spawning
  // ---------------------------

  private spawnCoin() {
    // Respect MAX_COINS limit
    if (this.coins.length >= this.MAX_COINS) return;

    const coin: Coin = {
      id: this.nextCoinId++,
      x: Math.random() * 700 + 50,
      y: Math.random() * 500 + 50,
      spawnTime: Date.now(), // TTL tracking
    };

    this.coins.push(coin);
  }

  // ---------------------------
  // Game Loop
  // ---------------------------

  private gameLoop() {
    const now = Date.now();

    // --- Update Player Positions ---
    for (const id in this.players) {
      const p = this.players[id];
      const input = p.input;

      if (input.up) p.y -= this.SPEED;
      if (input.down) p.y += this.SPEED;
      if (input.left) p.x -= this.SPEED;
      if (input.right) p.x += this.SPEED;
    }

    // --- TTL Despawn for Coins ---
    this.coins = this.coins.filter(
      (coin) => now - coin.spawnTime < this.COIN_TTL,
    );

    // --- Collision Detection ---
    for (const id in this.players) {
      const p = this.players[id];

      this.coins = this.coins.filter((coin) => {
        const dx = p.x - coin.x;
        const dy = p.y - coin.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 25) {
          this.scores[id] += 1;
          return false; // remove coin
        }
        return true;
      });
    }

    // --- Broadcast Full Game State ---
    this.server.emit('state', {
      players: this.players,
      coins: this.coins,
      scores: this.scores,
    });
  }

  // ---------------------------
  // Ping Test
  // ---------------------------

  @SubscribeMessage('ping')
  handlePing(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    client.emit('pong', { msg: 'pong' });
  }
}
