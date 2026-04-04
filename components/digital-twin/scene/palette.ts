import type { PublishedStaticPalette } from './PublishedStaticRecipeMount'

export function createPublishedStaticPalette(isDark: boolean): PublishedStaticPalette {
  return {
    ground: isDark ? '#0d1620' : '#dce7f1',
    slab: isDark ? '#1a2430' : '#d8e1ea',
    slabAlt: isDark ? '#212c39' : '#e3eaf1',
    curb: isDark ? '#4d5f73' : '#aab7c6',
    steel: isDark ? '#54789c' : '#6e97bd',
    steelDark: isDark ? '#29425b' : '#496b8e',
    vessel: isDark ? '#97a9bb' : '#cfd8e2',
    pipe: isDark ? '#72859a' : '#91a5ba',
    road: isDark ? '#293140' : '#9099a7',
    stripe: isDark ? '#cbd5e1' : '#ffffff',
    canopy: isDark ? '#2e5577' : '#6c95bb',
    building: isDark ? '#566170' : '#95a2b0',
    water: isDark ? '#24506b' : '#82b7d5',
    warning: '#f59e0b',
    flare: '#f97316',
    power: isDark ? '#cbd5e1' : '#e2e8f0',
  }
}
