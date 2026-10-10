import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const isSupabaseConfigured = Boolean(url && key && !url.includes('YOUR_PROJECT_ID') && !key.includes('YOUR_SUPABASE'));
export const supabase = isSupabaseConfigured ? createClient(url!, key!) : null;

export type StoredFile = {
  id: string;
  owner_id: string;
  file_name: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
};
export type FileShare = {
  id: string;
  owner_id: string;
  recipient_email: string;
  file_name: string;
  storage_path: string;
  permission: 'view' | 'download';
  expires_at: string;
  revoked: boolean;
  created_at: string;
};

export function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
export function fileKind(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return 'doc';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['zip', 'rar', '7z'].includes(ext)) return 'archive';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet';
  return 'file';
}
