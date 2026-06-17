import { describe, expect, test } from "bun:test"
import { getLanIPv4Addresses } from "../../src/cli/network"

describe("getLanIPv4Addresses", () => {
  test("returns private IPv4 addresses from local interfaces", () => {
    const addresses = getLanIPv4Addresses()
    for (const address of addresses) {
      expect(address).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
      expect(address.startsWith("127.")).toBe(false)
    }
  })
})
