import 'server-only';
import { api, type ApiResult } from '@/lib/api';

/**
 * Sends an uploaded file to POST /imports as the raw request body (the API's JSON body limit
 * is too small for spreadsheets).
 */
export async function uploadToApi<T>(path: string, file: Blob): Promise<ApiResult<T>> {
  return api<T>(path, { method: 'POST', raw: file });
}
