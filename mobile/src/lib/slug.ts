/* The key for a meal's photo: lower case, accents stripped, anything that is
   not a letter or digit becomes one hyphen. Must match slug() in
   scripts/gen-media.mjs, which names mobile/assets/meals/<slug>.webp. */

export function slug(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
