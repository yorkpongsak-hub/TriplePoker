export const TABLE_SKINS: Record<number, any> = {
  0: require('../../assets/images/table_default.png'),
  1: require('../../assets/tables/skin1.png'),
  2: require('../../assets/tables/skin2.png'),
  3: require('../../assets/tables/skin3.png'),
  4: require('../../assets/tables/skin4.png'),
}

export const TABLE_SKIN_META = [
  { id: 0, name: 'Classic Default', unlock: 'Built-in table' },
  { id: 1, name: 'Marble Luxury', unlock: 'VIP membership' },
  { id: 2, name: 'Ancient Stone', unlock: 'Reach Adept' },
  { id: 3, name: 'Cosmic Mystical', unlock: 'Reach Mastermind' },
  { id: 4, name: 'Bamboo Dynasty', unlock: 'Reach High Noble' },
] as const
