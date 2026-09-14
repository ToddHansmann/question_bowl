/**
 * Revisions — how a question's wording is versioned without anyone having to
 * remember to bump anything.
 *
 * A question id (`base-001`, `exp-172`, `com-0001`) is permanent. Its wording
 * is not. Every distinct wording is a *revision*, and a revision id is derived
 * from the text itself:
 *
 *     revisionId = `${questionId}@${first 12 hex chars of sha256(NFC(text))}`
 *
 * So an edit — a typo fix, a reworded dare, anything — produces a new
 * revision id automatically, the moment the text changes, and telemetry
 * recorded against the old wording stays attached to the old wording forever.
 * Nothing has to be hand-maintained, and nothing can drift: the database
 * recomputes the same hash in a CHECK constraint (see the catalog migration),
 * so a revision row whose id doesn't match its text cannot exist.
 *
 * Exactly what counts as "different text": the Unicode NFC normal form of the
 * string, byte for byte. Curly vs. straight quotes are different revisions.
 * Trailing whitespace is a different revision. That is deliberate — the rule
 * is "if a player could see a difference, it is a different revision", and a
 * looser rule would need a normalizer that both TypeScript and Postgres agree
 * on for the next ten years.
 *
 * SHA-256 is implemented synchronously here rather than via `crypto.subtle`
 * (async, secure-context only) because revision ids are needed while the deck
 * is being built, before first paint, in every environment including Node
 * tests. It hashes a few hundred short strings once at load.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

/** Lowercase hex SHA-256 of a UTF-8 string. */
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input)
  const bitLength = bytes.length * 8
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64
  const data = new Uint8Array(paddedLength)
  data.set(bytes)
  data[bytes.length] = 0x80
  const view = new DataView(data.buffer)
  // 64-bit big-endian length; strings here never exceed 2^32 bits.
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(paddedLength - 4, bitLength >>> 0)

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const w = new Uint32Array(64)

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 64; i++) {
      const s15 = w[i - 15]
      const s2 = w[i - 2]
      const r1 = ((s15 >>> 7) | (s15 << 25)) ^ ((s15 >>> 18) | (s15 << 14)) ^ (s15 >>> 3)
      const r2 = ((s2 >>> 17) | (s2 << 15)) ^ ((s2 >>> 19) | (s2 << 13)) ^ (s2 >>> 10)
      w[i] = (r2 + w[i - 7] + r1 + w[i - 16]) | 0
    }

    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7]
    for (let i = 0; i < 64; i++) {
      const t1 =
        (hh +
          (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) +
          ((e & f) ^ (~e & g)) +
          K[i] +
          w[i]) |
        0
      const t2 =
        ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) +
          ((a & b) ^ (a & c) ^ (b & c))) |
        0
      hh = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh
  }

  let hex = ''
  for (let i = 0; i < 8; i++) hex += h[i].toString(16).padStart(8, '0')
  return hex
}

/** Characters of the hash kept in a revision id. 48 bits — collisions within one question's history are not a realistic concern. */
export const REVISION_HASH_LENGTH = 12

/** The revision id for one wording of one question. Pure and deterministic. */
export function revisionIdFor(questionId: string, text: string): string {
  return `${questionId}@${sha256Hex(text.normalize('NFC')).slice(0, REVISION_HASH_LENGTH)}`
}

/** Splits a revision id back into its question id. */
export function questionIdOfRevision(revisionId: string): string {
  const at = revisionId.lastIndexOf('@')
  return at === -1 ? revisionId : revisionId.slice(0, at)
}
