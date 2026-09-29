export function isMonarchEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.MONARCH_ENABLED === 'true'
}
