/**
 * Tests for database/index.ts
 *
 * Verifies that the barrel file re-exports both named models correctly so
 * consumers can import from a single entry point.
 */

describe("database/index.ts barrel exports", () => {
  it("exports Event from the barrel", async () => {
    const mod = await import("../database/index")
    expect(mod.Event).toBeDefined()
  })

  it("exports Booking from the barrel", async () => {
    const mod = await import("../database/index")
    expect(mod.Booking).toBeDefined()
  })

  it("Event export is a mongoose Model (has a find method)", async () => {
    const { Event } = await import("../database/index")
    expect(typeof Event.find).toBe("function")
  })

  it("Booking export is a mongoose Model (has a find method)", async () => {
    const { Booking } = await import("../database/index")
    expect(typeof Booking.find).toBe("function")
  })

  it("Event and Booking are different models", async () => {
    const { Event, Booking } = await import("../database/index")
    expect(Event).not.toBe(Booking)
    expect(Event.modelName).toBe("Event")
    expect(Booking.modelName).toBe("Booking")
  })
})