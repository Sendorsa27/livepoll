/**
 * Normalizes email address to lowercase and trims whitespace
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Normalizes house names to the official PascalCase format
 */
export function normalizeHouse(house: string): string {
  const h = house.trim().toLowerCase()
  if (h === 'phoenix' || h === 'pheonix') return 'Phoenix'
  if (h === 'leo') return 'Leo'
  if (h === 'kong') return 'Kong'
  if (h === 'tuskers' || h === 'tusker') return 'Tuskers'
  
  // Fallback fallback: capitalize first letter
  if (house.trim().length === 0) return ''
  return house.trim().charAt(0).toUpperCase() + house.trim().slice(1).toLowerCase()
}
