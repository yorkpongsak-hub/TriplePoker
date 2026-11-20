/** Lightweight, dependency-free SVG asset generator for a Tier D League medal. */
export function buildLeagueMedalSvg(leagueName: string, color = '#FFD76A'): string {
  const safeName = leagueName.replace(/[<&>]/g, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><path fill="${color}" d="M45 0h28l7 52-35 20L28 20zM87 0h28l17 20-17 52-35-20z"/><circle cx="80" cy="98" r="48" fill="#163A25" stroke="${color}" stroke-width="7"/><text x="80" y="92" text-anchor="middle" fill="${color}" font-family="sans-serif" font-size="13" font-weight="700">LEAGUE</text><text x="80" y="112" text-anchor="middle" fill="#F5F2E8" font-family="sans-serif" font-size="10">${safeName}</text></svg>`
}
