// 笔记图片的云端存储层（Supabase Storage 私有桶 note-images）。
// 设计：
//  - 登录时：压缩后的图片传到 `<user_id>/<uuid>.jpg`，笔记里只存 `sb://<path>` 标记，
//    数据本体（localStorage + 同步 blob）从此不再背着图片跑。
//  - 未登录 / 上传失败：原样退回 base64 dataURL（老行为），功能不缺位，登录后由
//    migrateNoteImages 统一迁移上云。
//  - 显示：sb:// 路径换取 7 天有效的签名链接（私有桶外人拿不到），内存缓存 6 天。
//  - 已知取舍：删笔记/删图不回收云端文件（孤儿文件无害，只占一点空间），后续再做清理。
import { _us, _ue } from './hooks.js';

const BUCKET = 'note-images';
const MARKER = 'sb://';

const sb = () => window.sbClient || null;

// 把压缩好的 dataURL 传上云；返回 sb:// 路径，失败原样返回 dataURL（调用方无需关心成败）
export async function uploadNoteImage(dataURL) {
  try {
    const client = sb();
    if (!client || !String(dataURL).startsWith('data:')) return dataURL;
    const { data } = await client.auth.getUser();
    const user = data && data.user;
    if (!user) return dataURL; // 未登录：保持本地 base64
    const blob = await (await fetch(dataURL)).blob();
    const path = `${user.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await client.storage.from(BUCKET).upload(path, blob, {
      contentType: 'image/jpeg', upsert: false,
    });
    if (error) return dataURL;
    return MARKER + path;
  } catch {
    return dataURL;
  }
}

// sb:// 路径 → 签名 URL（带内存缓存）；dataURL / http 链接原样返回
const signedCache = new Map(); // path -> { url, exp }
const SIGN_TTL = 7 * 24 * 3600;            // 签名有效期：7 天
const CACHE_TTL = 6 * 24 * 3600 * 1000;    // 缓存 6 天，留 1 天余量防过期边缘

export async function resolveImage(src) {
  if (!src || !String(src).startsWith(MARKER)) return src;
  const path = src.slice(MARKER.length);
  const hit = signedCache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const client = sb();
  if (!client) return '';
  try {
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL);
    if (error || !data || !data.signedUrl) return '';
    signedCache.set(path, { url: data.signedUrl, exp: Date.now() + CACHE_TTL });
    return data.signedUrl;
  } catch {
    return '';
  }
}

// React hook：任意图片 src（dataURL / http / sb://）→ 可直接渲染的地址；解析中返回 ''
export function useResolvedImage(src) {
  const isCloud = !!src && String(src).startsWith(MARKER);
  const [url, setUrl] = _us(isCloud ? '' : src);
  _ue(() => {
    let alive = true;
    if (isCloud) {
      resolveImage(src).then((u) => { if (alive) setUrl(u || ''); });
    } else {
      setUrl(src);
    }
    return () => { alive = false; };
  }, [src]);
  return url;
}

// 把存量笔记里的 base64 图片搬上云（登录且首次同步完成后调用；幂等，失败的下次再来）
export async function migrateNoteImages(store) {
  const notes = (store.state && store.state.notes) || [];
  const targets = notes.filter((n) =>
    (n.images || []).some((s) => typeof s === 'string' && s.startsWith('data:')));
  let migrated = 0;
  for (const n of targets) {
    const next = [];
    let changed = false;
    for (const s of n.images) {
      if (typeof s === 'string' && s.startsWith('data:')) {
        const stored = await uploadNoteImage(s);
        next.push(stored);
        if (stored !== s) changed = true;
      } else {
        next.push(s);
      }
    }
    if (changed) {
      migrated++;
      store.updateField('notes', (list) =>
        list.map((x) => (x.id === n.id ? { ...x, images: next } : x)));
    }
  }
  return migrated;
}

Object.assign(window, { uploadNoteImage, resolveImage, migrateNoteImages });
