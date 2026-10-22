import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import {
  Queue,
  Worker,
  type ConnectionOptions,
  type Processor,
  type QueueOptions,
  type WorkerOptions,
} from 'bullmq';
import { ENV, type Env } from '../config/env';

/** ioredis options from a redis:// or rediss:// URL; the path is the database number. */
export function redisConnection(url: string): ConnectionOptions {
  const u = new URL(url);
  const db = Number(u.pathname.replace('/', '') || 0);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: Number.isInteger(db) ? db : 0,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    // Required by BullMQ workers (blocking commands).
    maxRetriesPerRequest: null,
  };
}

/**
 * BullMQ on REDIS_URL. Streams create their own named queues and workers inside their own
 * folders, e.g. `queues.queue('p2t.solve')` and `queues.worker('p2t.solve', processor)`.
 * Name queues `<stream>.<job>`. Nothing connects to Redis until a queue or worker is created,
 * and everything created here is closed on shutdown.
 */
@Injectable()
export class QueueService implements OnApplicationShutdown {
  private readonly open: { close(): Promise<void> }[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {}

  get connection(): ConnectionOptions {
    return redisConnection(this.env.REDIS_URL);
  }

  queue<Data = unknown>(name: string, options: Omit<QueueOptions, 'connection'> = {}): Queue<Data> {
    const queue = new Queue<Data>(name, { ...options, connection: this.connection });
    this.open.push(queue);
    return queue;
  }

  worker<Data = unknown, Result = unknown>(
    name: string,
    processor: Processor<Data, Result>,
    options: Omit<WorkerOptions, 'connection'> = {},
  ): Worker<Data, Result> {
    const worker = new Worker<Data, Result>(name, processor, {
      ...options,
      connection: this.connection,
    });
    this.open.push(worker);
    return worker;
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.open.map((x) => x.close()));
  }
}
