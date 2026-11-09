/**
 * Avatares: só figuras prontas (DiceBear, ilustrações de desenho). Nada de foto,
 * URL livre ou imagem gerada por texto. A mesma regra vale no firestore.rules
 * (users.avatarUrl); aqui ela também protege contra dados antigos.
 */
const STYLES = ['bottts', 'adventurer', 'fun-emoji', 'thumbs', 'big-smile', 'lorelei'] as const;
export const AVATAR_PATTERN = /^https:\/\/api\.dicebear\.com\/7\.x\/(bottts|adventurer|fun-emoji|thumbs|big-smile|lorelei)\/svg\?seed=[A-Za-z0-9_-]{1,40}$/;

const SEEDS = ['dragao', 'fenix', 'mago', 'fada', 'lobo', 'coruja'];

/** Catálogo exibido no perfil (6 estilos x 6 figuras). */
export const AVATAR_PRESETS: string[] = STYLES.flatMap(style =>
  SEEDS.map(seed => `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`)
);

export function isAllowedAvatar(url: unknown): url is string {
  return typeof url === 'string' && AVATAR_PATTERN.test(url);
}

/** Avatar padrão estável por usuário (sem foto real, sem dado pessoal na URL). */
export function defaultAvatarFor(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return AVATAR_PRESETS[h % AVATAR_PRESETS.length];
}

/** Devolve o avatar se for permitido; senão um padrão. Use em TODO lugar que exibe avatar. */
export function safeAvatar(url: unknown, uid = 'anon'): string {
  return isAllowedAvatar(url) ? url : defaultAvatarFor(uid);
}
