/**
 * Tests for lib/mongodb.ts
 *
 * The module throws at load time when MONGODB_URI is missing, so every test
 * uses jest.isolateModules + require() to get a fresh module instance that
 * re-executes the top-level guard.
 */

import type mongoose from "mongoose"

const FAKE_URI = "mongodb://localhost:27017/test"

// ---- helpers ---------------------------------------------------------------

/** Load lib/mongodb fresh (bypasses jest's module cache). */
function loadMongodb(): Promise<typeof import("../lib/mongodb")> {
  return new Promise((resolve, reject) => {
    jest.isolateModules(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require("../lib/mongodb") as typeof import("../lib/mongodb")
        resolve(mod)
      } catch (err) {
        reject(err)
      }
    })
  })
}

// ---- setup -----------------------------------------------------------------

jest.mock("mongoose", () => {
  const actual = jest.requireActual<typeof mongoose>("mongoose")
  return { ...actual, connect: jest.fn() }
})

// Retrieve the mocked function reference AFTER jest.mock has run.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockedConnect = (require("mongoose") as typeof mongoose)
  .connect as jest.MockedFunction<typeof mongoose.connect>

beforeEach(() => {
  mockedConnect.mockReset()
  // Reset the global cache between tests.
  const g = globalThis as typeof globalThis & { mongooseCache?: unknown }
  delete g.mongooseCache
})

// ---------------------------------------------------------------------------
// Module-level guard: missing MONGODB_URI
// ---------------------------------------------------------------------------
describe("lib/mongodb module guard", () => {
  it("throws when MONGODB_URI is not set", async () => {
    delete process.env.MONGODB_URI
    await expect(loadMongodb()).rejects.toThrow(
      "Missing MONGODB_URI environment variable",
    )
  })

  it("does not throw when MONGODB_URI is set", async () => {
    process.env.MONGODB_URI = FAKE_URI
    // connect is called during connectToDatabase, not during import – so no
    // mock return value is needed just to load the module.
    await expect(loadMongodb()).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// connectToDatabase – connection caching
// ---------------------------------------------------------------------------
describe("connectToDatabase – caching behaviour", () => {
  beforeEach(() => {
    process.env.MONGODB_URI = FAKE_URI
  })

  it("calls mongoose.connect once and returns the connection", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fakeMongoose = require("mongoose") as typeof mongoose
    mockedConnect.mockResolvedValue(fakeMongoose)

    const { connectToDatabase } = await loadMongodb()
    const result = await connectToDatabase()

    expect(mockedConnect).toHaveBeenCalledTimes(1)
    expect(mockedConnect).toHaveBeenCalledWith(FAKE_URI, { bufferCommands: false })
    expect(result).toBe(fakeMongoose)
  })

  it("returns the cached connection on subsequent calls without reconnecting", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fakeMongoose = require("mongoose") as typeof mongoose
    mockedConnect.mockResolvedValue(fakeMongoose)

    const { connectToDatabase } = await loadMongodb()
    const first = await connectToDatabase()
    const second = await connectToDatabase()

    expect(mockedConnect).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
  })

  it("does not create a new promise when one is already in-flight", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fakeMongoose = require("mongoose") as typeof mongoose

    let resolveFn!: (value: typeof mongoose) => void
    const deferred = new Promise<typeof mongoose>((res) => {
      resolveFn = res
    })
    mockedConnect.mockReturnValueOnce(deferred)

    const { connectToDatabase } = await loadMongodb()

    const p1 = connectToDatabase()
    const p2 = connectToDatabase()

    resolveFn(fakeMongoose)
    const [r1, r2] = await Promise.all([p1, p2])

    expect(mockedConnect).toHaveBeenCalledTimes(1)
    expect(r1).toBe(r2)
  })
})

// ---------------------------------------------------------------------------
// connectToDatabase – error handling and retry
// ---------------------------------------------------------------------------
describe("connectToDatabase – error handling", () => {
  beforeEach(() => {
    process.env.MONGODB_URI = FAKE_URI
  })

  it("clears the cached promise on failure so a retry is possible", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fakeMongoose = require("mongoose") as typeof mongoose
    const connectionError = new Error("Connection refused")
    mockedConnect
      .mockRejectedValueOnce(connectionError)
      .mockResolvedValueOnce(fakeMongoose)

    const { connectToDatabase } = await loadMongodb()

    await expect(connectToDatabase()).rejects.toThrow("Connection refused")

    const result = await connectToDatabase()
    expect(result).toBe(fakeMongoose)
    expect(mockedConnect).toHaveBeenCalledTimes(2)
  })

  it("rethrows the original error from a failed connection", async () => {
    mockedConnect.mockRejectedValueOnce(new Error("ECONNREFUSED"))

    const { connectToDatabase } = await loadMongodb()
    await expect(connectToDatabase()).rejects.toThrow("ECONNREFUSED")
  })
})

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------
describe("lib/mongodb default export", () => {
  it("exports connectToDatabase as the default export", async () => {
    process.env.MONGODB_URI = FAKE_URI

    const mod = await loadMongodb()
    expect(mod.default).toBe(mod.connectToDatabase)
  })
})