/**
 * Every unit suite, in one bundle. `npm test` builds and runs this.
 * deck.test.ts runs (and prints) as it is imported; the rest register with
 * the shared harness and run below.
 */
import './deck.test'
import './catalog.test'
import './recommendation.test'
import './telemetry.test'
import { run } from './harness'

await run()
