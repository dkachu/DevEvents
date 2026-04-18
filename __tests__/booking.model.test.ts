/**
 * Tests for database/booking.model.ts
 *
 * Pre-save hooks are exercised by calling doc._execDocumentPreHooks('save', {}, [])
 * which runs all registered pre-save middleware in-process without any MongoDB
 * connection.
 *
 * The Booking pre-save hook calls Event.exists(), which is mocked via jest.mock.
 */

import mongoose, { Types } from "mongoose"

// Mock the entire event model so Booking's pre-save hook can be controlled.
jest.mock("../database/event.model", () => ({
  Event: {
    exists: jest.fn(),
    modelName: "Event",
    schema: new (require("mongoose").Schema)({}),
  },
}))

import { Event } from "../database/event.model"
import { Booking } from "../database/booking.model"

const mockedEventExists = Event.exists as jest.MockedFunction<typeof Event.exists>

/** Execute the pre-save hooks on a document without hitting the database. */
async function runPreSave(doc: InstanceType<typeof Booking>): Promise<void> {
  await (doc as unknown as {
    _execDocumentPreHooks(name: string, opts: object, args: unknown[]): Promise<void>
  })._execDocumentPreHooks("save", {}, [])
}

const fakeEventId = new Types.ObjectId()

beforeEach(() => {
  mockedEventExists.mockReset()
  // Default: the event exists.
  mockedEventExists.mockResolvedValue({ _id: fakeEventId } as unknown as Awaited<
    ReturnType<typeof Event.exists>
  >)
})

// ---------------------------------------------------------------------------
// normalizeEmail – tested via the email field behaviour
// ---------------------------------------------------------------------------
describe("Booking model – email normalization (normalizeEmail)", () => {
  it("accepts a valid email unchanged", async () => {
    const doc = new Booking({ eventId: fakeEventId, email: "user@example.com" })
    await runPreSave(doc)
    expect(doc.email).toBe("user@example.com")
  })

  it("converts email to lowercase", async () => {
    const doc = new Booking({ eventId: fakeEventId, email: "USER@EXAMPLE.COM" })
    await runPreSave(doc)
    expect(doc.email).toBe("user@example.com")
  })

  it("trims whitespace from email", async () => {
    const doc = new Booking({ eventId: fakeEventId, email: "  user@example.com  " })
    await runPreSave(doc)
    expect(doc.email).toBe("user@example.com")
  })

  it("lowercases mixed-case email with subdomain", async () => {
    const doc = new Booking({
      eventId: fakeEventId,
      email: "User@Mail.Example.COM",
    })
    await runPreSave(doc)
    expect(doc.email).toBe("user@mail.example.com")
  })

  it("throws when email has no @ symbol", async () => {
    const doc = new Booking({ eventId: fakeEventId, email: "invalidemail.com" })
    await expect(runPreSave(doc)).rejects.toThrow('"email" must be a valid email address')
  })

  it("throws when email has no domain after @", async () => {
    const doc = new Booking({ eventId: fakeEventId, email: "user@" })
    await expect(runPreSave(doc)).rejects.toThrow('"email" must be a valid email address')
  })

  it("throws when email has no local part before @", async () => {
    const doc = new Booking({ eventId: fakeEventId, email: "@example.com" })
    await expect(runPreSave(doc)).rejects.toThrow('"email" must be a valid email address')
  })

  it("throws when email contains internal spaces", async () => {
    const doc = new Booking({ eventId: fakeEventId, email: "user name@example.com" })
    await expect(runPreSave(doc)).rejects.toThrow('"email" must be a valid email address')
  })

  it("throws when email has no TLD separator", async () => {
    const doc = new Booking({ eventId: fakeEventId, email: "user@nodot" })
    await expect(runPreSave(doc)).rejects.toThrow('"email" must be a valid email address')
  })

  it("trims then validates – rejects whitespace-padded invalid email", async () => {
    const doc = new Booking({ eventId: fakeEventId, email: "   invalidemail   " })
    await expect(runPreSave(doc)).rejects.toThrow('"email" must be a valid email address')
  })
})

// ---------------------------------------------------------------------------
// Pre-save hook – eventId reference validation
// ---------------------------------------------------------------------------
describe("Booking model – event reference validation", () => {
  it("succeeds when the referenced event exists", async () => {
    mockedEventExists.mockResolvedValue({ _id: fakeEventId } as unknown as Awaited<
      ReturnType<typeof Event.exists>
    >)

    const doc = new Booking({ eventId: fakeEventId, email: "attendee@example.com" })
    await expect(runPreSave(doc)).resolves.toBeUndefined()
    expect(mockedEventExists).toHaveBeenCalledWith({ _id: fakeEventId })
  })

  it("throws when the referenced event does not exist", async () => {
    mockedEventExists.mockResolvedValue(null)

    const nonExistentId = new Types.ObjectId()
    const doc = new Booking({ eventId: nonExistentId, email: "user@example.com" })
    await expect(runPreSave(doc)).rejects.toThrow("Referenced event does not exist")
  })

  it("calls Event.exists when the document is new", async () => {
    const doc = new Booking({ eventId: fakeEventId, email: "new@example.com" })
    // isNew is true by default for a newly-created document.
    expect(doc.isNew).toBe(true)

    await runPreSave(doc)
    expect(mockedEventExists).toHaveBeenCalledTimes(1)
  })

  it("calls Event.exists when eventId is explicitly modified", async () => {
    const doc = new Booking({ eventId: fakeEventId, email: "user@example.com" })
    doc.markModified("eventId")
    await runPreSave(doc)
    expect(mockedEventExists).toHaveBeenCalledTimes(1)
  })

  it("propagates errors thrown by Event.exists", async () => {
    mockedEventExists.mockRejectedValue(new Error("DB error"))

    const doc = new Booking({ eventId: fakeEventId, email: "user@example.com" })
    await expect(runPreSave(doc)).rejects.toThrow("DB error")
  })
})

// ---------------------------------------------------------------------------
// Model structure
// ---------------------------------------------------------------------------
describe("Booking model – model structure", () => {
  it("has the correct model name", () => {
    expect(Booking.modelName).toBe("Booking")
  })

  it("returns the same model instance on repeated imports (no duplicate model)", async () => {
    const { Booking: BookingAgain } = await import("../database/booking.model")
    expect(Booking).toBe(BookingAgain)
  })

  it("attaches createdAt and updatedAt via timestamps option", () => {
    const schemaPaths = Object.keys((Booking.schema as mongoose.Schema).paths)
    expect(schemaPaths).toContain("createdAt")
    expect(schemaPaths).toContain("updatedAt")
  })

  it("stores eventId as an ObjectId reference", () => {
    const doc = new Booking({ eventId: fakeEventId, email: "user@example.com" })
    expect(doc.eventId).toBeInstanceOf(Types.ObjectId)
    expect(doc.eventId.toString()).toBe(fakeEventId.toString())
  })
})