function expandCompatibleRelease(version: string): string {
  const segments = version.split('.')
  if (
    segments.length < 2 ||
    segments.length > 3 ||
    segments.some(segment => !/^\d+$/.test(segment))
  ) {
    throw new Error(
      `Unsupported PEP 440 compatible release specifier: "~=${version}". Expected "~=X.Y" or "~=X.Y.Z".`,
    )
  }

  const numericSegments = segments.map(segment => Number(segment))
  if (numericSegments.length === 2) {
    const [major, minor] = numericSegments
    return `>=${major}.${minor}.0 <${major + 1}.0.0`
  }

  const [major, minor, patch] = numericSegments
  return `>=${major}.${minor}.${patch} <${major}.${minor + 1}.0`
}

export function translatePep440Specifier(specifier: string): string | null {
  const parts = specifier
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return null

  const translated = parts.map(part => {
    if (part.startsWith('==')) {
      return part.slice(2)
    }
    if (part.startsWith('~=')) {
      return expandCompatibleRelease(part.slice(2))
    }
    return part
  })

  return translated.join(' ')
}
