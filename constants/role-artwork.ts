import { type RoleId } from '@/constants/roles';

export const RoleArtworks: Record<RoleId, any[]> = {
  alienKatze: [
    require('@/assets/Alien1.png'),
    require('@/assets/Alien2.png'),
    require('@/assets/Alien3.png'),
  ],
  seher: [require('@/assets/images/seer.png')],
  doktor: [require('@/assets/images/doctor.png')],
  dorfkatze: [require('@/assets/images/villager.png')],
};
