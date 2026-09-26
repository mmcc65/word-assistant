export const OFFICIAL_UPDATE_MANIFESTS = Object.freeze({
  desktop: Object.freeze([
    'https://github.com/mmcc65/word-assistant/releases/latest/download/desktop-latest.json',
  ]),
  mobile: Object.freeze([
    'https://isenfwmwaojwujfmmzoc.supabase.co/storage/v1/object/public/qingdan-releases/word-assistant/latest.json',
    'https://github.com/mmcc65/word-assistant/releases/latest/download/latest.json',
  ]),
})

export type UpdatePlatform = keyof typeof OFFICIAL_UPDATE_MANIFESTS

export function updateManifests(platform: UpdatePlatform): string[] {
  return [...OFFICIAL_UPDATE_MANIFESTS[platform]]
}
