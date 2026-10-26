import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env';

/**
 * Uploaded import files (ADR 0011). S3-compatible storage when S3_ENDPOINT and S3_BUCKET are
 * set (the compose "storage" service locally, R2/S3 in production). Without them, in
 * development and tests only, files go to a folder under the OS temp directory, so the API
 * and CI work without the storage container.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;
  private bucketReady: Promise<void> | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  private get useS3(): boolean {
    return Boolean(this.env.S3_ENDPOINT && this.env.S3_BUCKET);
  }

  private s3(): S3Client {
    this.client ??= new S3Client({
      endpoint: this.env.S3_ENDPOINT,
      region: this.env.S3_REGION,
      forcePathStyle: this.env.S3_FORCE_PATH_STYLE,
      credentials:
        this.env.S3_ACCESS_KEY_ID && this.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: this.env.S3_ACCESS_KEY_ID,
              secretAccessKey: this.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
    return this.client;
  }

  /** Creates the bucket on first use (local storage starts empty). */
  private ensureBucket(): Promise<void> {
    this.bucketReady ??= (async () => {
      const Bucket = this.env.S3_BUCKET!;
      try {
        await this.s3().send(new HeadBucketCommand({ Bucket }));
      } catch {
        await this.s3().send(new CreateBucketCommand({ Bucket }));
        this.logger.log(`Created storage bucket ${Bucket}`);
      }
    })().catch((error: unknown) => {
      this.bucketReady = null;
      throw error;
    });
    return this.bucketReady;
  }

  private localPath(key: string): string {
    if (this.env.NODE_ENV === 'production') {
      throw new Error('File storage is not set up: set S3_ENDPOINT and S3_BUCKET.');
    }
    return join(tmpdir(), 'slotwise-storage', ...key.split('/'));
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.useS3) {
      await this.ensureBucket();
      await this.s3().send(
        new PutObjectCommand({
          Bucket: this.env.S3_BUCKET,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return;
    }
    const path = this.localPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async get(key: string): Promise<Buffer> {
    if (this.useS3) {
      const res = await this.s3().send(
        new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }),
      );
      if (!res.Body) throw new Error(`Stored file ${key} is empty.`);
      return Buffer.from(await res.Body.transformToByteArray());
    }
    return readFile(this.localPath(key));
  }
}
