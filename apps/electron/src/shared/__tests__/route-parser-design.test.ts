import { describe, it, expect } from 'bun:test'
import {
  buildCompoundRoute,
  buildRouteFromNavigationState,
  parseCompoundRoute,
  parseRouteToNavigationState,
} from '../route-parser'

describe('route-parser: design workbench route', () => {
  it('parses "design" as the design navigator', () => {
    const result = parseCompoundRoute('design')
    expect(result).not.toBeNull()
    expect(result!.navigator).toBe('design')
    expect(result!.details).toBeNull()
  })

  it('roundtrips the design route', () => {
    const parsed = parseCompoundRoute('design')!
    expect(buildCompoundRoute(parsed)).toBe('design')
  })

  it('converts design route to navigation state', () => {
    expect(parseRouteToNavigationState('design')).toEqual({ navigator: 'design' })
  })

  it('builds the route from design navigation state', () => {
    expect(buildRouteFromNavigationState({ navigator: 'design' })).toBe('design')
  })
})
