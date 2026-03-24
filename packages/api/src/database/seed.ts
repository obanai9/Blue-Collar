import { db } from '../db.js'

const categories = [
  { name: 'Plumbing', description: 'Pipe fitting, repairs, and installations' },
  { name: 'Electrical', description: 'Wiring, installations, and repairs' },
  { name: 'Carpentry', description: 'Woodwork, furniture, and framing' },
  { name: 'Welding', description: 'Metal fabrication and welding' },
  { name: 'Painting', description: 'Interior and exterior painting' },
  { name: 'Masonry', description: 'Brickwork, concrete, and stonework' },
]

const locations = [
  { city: 'Lagos', state: 'Lagos', country: 'Nigeria', lat: 6.5244, lng: 3.3792 },
  { city: 'Abuja', state: 'FCT', country: 'Nigeria', lat: 9.0765, lng: 7.3986 },
  { city: 'Nairobi', state: 'Nairobi', country: 'Kenya', lat: -1.2921, lng: 36.8219 },
  { city: 'Accra', state: 'Greater Accra', country: 'Ghana', lat: 5.6037, lng: -0.187 },
]

async function main() {
  await db.category.createMany({ data: categories, skipDuplicates: true })
  await db.location.createMany({ data: locations, skipDuplicates: true })
  console.log('Seeded categories and locations.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
