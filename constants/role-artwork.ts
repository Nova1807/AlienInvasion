import { type RoleId } from '@/constants/roles';

export const RoleArtworks: Record<RoleId, any[]> = {
  alienKatze: [
    require('@/assets/Alien1.png'),
    require('@/assets/Alien2.png'),
    require('@/assets/Alien3.png'),
  ],
  spion: [
    require('@/assets/Alien1.png'),
    require('@/assets/Alien2.png'),
  ],
  seher: [require('@/assets/images/seer.png')],
  doktor: [require('@/assets/images/doctor.png')],
  hexe: [require('@/assets/images/villager.png')],
  jaeger: [require('@/assets/images/villager.png')],
  amor: [require('@/assets/images/villager.png')],
  dorfkatze: [require('@/assets/images/villager.png')],
};
