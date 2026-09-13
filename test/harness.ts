/**
 * The smallest possible test harness: named checks, run in order, a summary
 * at the end. Same shape deck.test.ts has always used, shared so the newer
 * suites don't each re-declare it. Async tests are awaited in order.
 */
type Test = { suite: string; name: string; fn: () => void | Promise<void> }

const tests: Test[] = []

export function suite(name: string) {
  return (testName: string, fn: () => void | Promise<void>) => {
    tests.push({ suite: name, name: testName, fn })
  }
}

export async function run(): Promise<void> {
  let current = ''
  let failures = 0
  for (const t of tests) {
    if (t.suite !== current) {
      current = t.suite
      console.log(`\n${current}`)
    }
    try {
      await t.fn()
      console.log(`  ok  ${t.name}`)
    } catch (err) {
      failures += 1
      console.log(`  FAIL  ${t.name}`)
      console.log(err)
    }
  }
  console.log(`\n${tests.length - failures} passed, ${failures} failed`)
  if (failures > 0) process.exit(1)
}
