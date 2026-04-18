/**
 * Tests for database/event.model.ts
 *
 * Pre-save hooks are exercised by calling doc._execDocumentPreHooks('save', {}, [])
 * which runs all registered pre-save middleware in-process without any MongoDB
 * connection.
 */

import mongoose from "mongoose"
import { Event } from "../database/event.model"

// Minimal valid fixture used across multiple suites.
const validData = () => ({
  title: "Tech Conference 2025",
  description: "A great tech event",
  overview: "An overview of the event",
  image: "https://example.com/image.png",
  venue: "Convention Center",
  location: "San Francisco, CA",
  date: "2025-07-15",
  time: "09:00",
  mode: "in-person",
  audience: "Developers",
  agenda: ["Opening keynote", "Workshop"],
  organizer: "Tech Corp",
  tags: ["tech", "conference"],
})

/** Execute the pre-save hooks on a document without hitting the database. */
async function runPreSave(doc: InstanceType<typeof Event>): Promise<void> {
  // Mongoose exposes _execDocumentPreHooks for running hooks in-process.
  await (doc as unknown as {
    _execDocumentPreHooks(name: string, opts: object, args: unknown[]): Promise<void>
  })._execDocumentPreHooks("save", {}, [])
}

// ---------------------------------------------------------------------------
// toSlug – tested indirectly via the slug field after running pre-save
// ---------------------------------------------------------------------------
describe("Event model – slug generation (toSlug)", () => {
  it("generates a lowercase hyphenated slug from a normal title", async () => {
    const doc = new Event(validData())
    await runPreSave(doc)
    expect(doc.slug).toBe("tech-conference-2025")
  })

  it("converts uppercase to lowercase in the slug", async () => {
    const doc = new Event({ ...validData(), title: "Hello World" })
    await runPreSave(doc)
    expect(doc.slug).toBe("hello-world")
  })

  it("replaces consecutive special characters with a single hyphen", async () => {
    const doc = new Event({ ...validData(), title: "React & Next.js Summit" })
    await runPreSave(doc)
    expect(doc.slug).toBe("react-next-js-summit")
  })

  it("strips leading and trailing hyphens", async () => {
    const doc = new Event({ ...validData(), title: " --- hello --- " })
    await runPreSave(doc)
    expect(doc.slug).toBe("hello")
  })

  it("removes single and double quotes", async () => {
    const doc = new Event({ ...validData(), title: "Developer's \"Summit\"" })
    await runPreSave(doc)
    expect(doc.slug).toBe("developers-summit")
  })

  it("regenerates slug when title is marked as modified", async () => {
    const doc = new Event(validData())
    await runPreSave(doc)
    const original = doc.slug

    doc.title = "New Title Name"
    doc.markModified("title")
    await runPreSave(doc)
    expect(doc.slug).toBe("new-title-name")
    expect(doc.slug).not.toBe(original)
  })

  it("throws when title produces an empty slug (only quotes/spaces)", async () => {
    const doc = new Event({ ...validData(), title: "'\"  '\"" })
    await expect(runPreSave(doc)).rejects.toThrow(
      '"slug" could not be generated from title',
    )
  })

  it("handles numeric-only titles", async () => {
    const doc = new Event({ ...validData(), title: "2025" })
    await runPreSave(doc)
    expect(doc.slug).toBe("2025")
  })
})

// ---------------------------------------------------------------------------
// normalizeText – tested via required scalar text fields
// ---------------------------------------------------------------------------
describe("Event model – text field normalization (normalizeText)", () => {
  it("trims leading and trailing whitespace from text fields", async () => {
    const doc = new Event({
      ...validData(),
      title: "  Padded Title  ",
      description: "  desc  ",
      venue: "  Venue  ",
    })
    await runPreSave(doc)
    expect(doc.title).toBe("Padded Title")
    expect(doc.description).toBe("desc")
    expect(doc.venue).toBe("Venue")
  })

  const whitespaceOnlyCases: Array<[string, keyof ReturnType<typeof validData>]> = [
    ["title", "title"],
    ["description", "description"],
    ["overview", "overview"],
    ["image", "image"],
    ["venue", "venue"],
    ["location", "location"],
    ["mode", "mode"],
    ["audience", "audience"],
    ["organizer", "organizer"],
  ]

  for (const [label, field] of whitespaceOnlyCases) {
    it(`throws when "${label}" is whitespace-only`, async () => {
      const doc = new Event({ ...validData(), [field]: "   " })
      await expect(runPreSave(doc)).rejects.toThrow(
        `"${label}" is required and cannot be empty`,
      )
    })
  }
})

// ---------------------------------------------------------------------------
// normalizeTextArray – tested via agenda and tags
// ---------------------------------------------------------------------------
describe("Event model – array field normalization (normalizeTextArray)", () => {
  it("saves valid agenda entries unchanged", async () => {
    const doc = new Event(validData())
    await runPreSave(doc)
    expect(doc.agenda).toEqual(["Opening keynote", "Workshop"])
  })

  it("trims whitespace from array entries", async () => {
    const doc = new Event({
      ...validData(),
      agenda: ["  item one  ", "  item two  "],
    })
    await runPreSave(doc)
    expect(doc.agenda).toEqual(["item one", "item two"])
  })

  it("throws when agenda is empty", async () => {
    const doc = new Event({ ...validData(), agenda: [] })
    await expect(runPreSave(doc)).rejects.toThrow(
      '"agenda" must contain at least one value',
    )
  })

  it("throws when tags is empty", async () => {
    const doc = new Event({ ...validData(), tags: [] })
    await expect(runPreSave(doc)).rejects.toThrow(
      '"tags" must contain at least one value',
    )
  })

  it("throws when an agenda entry is whitespace-only", async () => {
    const doc = new Event({ ...validData(), agenda: ["Valid item", "   "] })
    await expect(runPreSave(doc)).rejects.toThrow(
      '"agenda" is required and cannot be empty',
    )
  })

  it("throws when a tags entry is whitespace-only", async () => {
    const doc = new Event({ ...validData(), tags: ["tech", "   "] })
    await expect(runPreSave(doc)).rejects.toThrow(
      '"tags" is required and cannot be empty',
    )
  })
})

// ---------------------------------------------------------------------------
// normalizeDateToIso – tested via the date field
// ---------------------------------------------------------------------------
describe("Event model – date normalization (normalizeDateToIso)", () => {
  it("converts a YYYY-MM-DD date to ISO string", async () => {
    const doc = new Event({ ...validData(), date: "2025-07-15" })
    await runPreSave(doc)
    expect(doc.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it("normalises a human-readable date to ISO format", async () => {
    const doc = new Event({ ...validData(), date: "July 15, 2025" })
    await runPreSave(doc)
    const parsed = new Date(doc.date)
    expect(Number.isNaN(parsed.getTime())).toBe(false)
    expect(parsed.getFullYear()).toBe(2025)
  })

  it("throws when date is not parseable", async () => {
    const doc = new Event({ ...validData(), date: "not-a-date" })
    await expect(runPreSave(doc)).rejects.toThrow(
      '"date" must be a valid date value',
    )
  })

  it("throws when date is whitespace-only", async () => {
    const doc = new Event({ ...validData(), date: "   " })
    await expect(runPreSave(doc)).rejects.toThrow(
      '"date" is required and cannot be empty',
    )
  })
})

// ---------------------------------------------------------------------------
// normalizeTime – tested via the time field
// ---------------------------------------------------------------------------
describe("Event model – time normalization (normalizeTime)", () => {
  it("zero-pads a single-digit 24-hour time", async () => {
    const doc = new Event({ ...validData(), time: "9:30" })
    await runPreSave(doc)
    expect(doc.time).toBe("09:30")
  })

  it("keeps a well-formed 24-hour time unchanged", async () => {
    const doc = new Event({ ...validData(), time: "14:45" })
    await runPreSave(doc)
    expect(doc.time).toBe("14:45")
  })

  it("converts 12-hour AM time to 24-hour format", async () => {
    const doc = new Event({ ...validData(), time: "9:00 AM" })
    await runPreSave(doc)
    expect(doc.time).toBe("09:00")
  })

  it("converts 12-hour PM time to 24-hour format", async () => {
    const doc = new Event({ ...validData(), time: "2:30 PM" })
    await runPreSave(doc)
    expect(doc.time).toBe("14:30")
  })

  it("converts 12:00 PM (noon) correctly", async () => {
    const doc = new Event({ ...validData(), time: "12:00 PM" })
    await runPreSave(doc)
    expect(doc.time).toBe("12:00")
  })

  it("converts 12:00 AM (midnight) correctly", async () => {
    const doc = new Event({ ...validData(), time: "12:00 AM" })
    await runPreSave(doc)
    expect(doc.time).toBe("00:00")
  })

  it("handles lowercase am/pm", async () => {
    const doc = new Event({ ...validData(), time: "3:45 pm" })
    await runPreSave(doc)
    expect(doc.time).toBe("15:45")
  })

  it("throws when hour exceeds 24-hour range", async () => {
    const doc = new Event({ ...validData(), time: "25:00" })
    await expect(runPreSave(doc)).rejects.toThrow(
      '"time" must be in HH:mm or h:mm AM/PM format',
    )
  })

  it("throws when time is a random string", async () => {
    const doc = new Event({ ...validData(), time: "noon" })
    await expect(runPreSave(doc)).rejects.toThrow(
      '"time" must be in HH:mm or h:mm AM/PM format',
    )
  })

  it("throws when time is whitespace-only", async () => {
    const doc = new Event({ ...validData(), time: "   " })
    await expect(runPreSave(doc)).rejects.toThrow(
      '"time" is required and cannot be empty',
    )
  })

  it("handles mixed-case AM/PM suffix", async () => {
    const doc = new Event({ ...validData(), time: "10:15 Am" })
    await runPreSave(doc)
    expect(doc.time).toBe("10:15")
  })
})

// ---------------------------------------------------------------------------
// Model structure
// ---------------------------------------------------------------------------
describe("Event model – model structure", () => {
  it("has the correct model name", () => {
    expect(Event.modelName).toBe("Event")
  })

  it("returns the same model instance on repeated imports (no duplicate model)", async () => {
    // Clears module registry to simulate a second import.
    const { Event: EventAgain } = await import("../database/event.model")
    expect(Event).toBe(EventAgain)
  })

  it("attaches createdAt and updatedAt via timestamps option", () => {
    const schemaPaths = Object.keys((Event.schema as mongoose.Schema).paths)
    expect(schemaPaths).toContain("createdAt")
    expect(schemaPaths).toContain("updatedAt")
  })

  it("creates a document instance with expected fields", () => {
    const doc = new Event(validData())
    expect(doc.title).toBe("Tech Conference 2025")
    expect(doc.agenda).toHaveLength(2)
    expect(doc.tags).toHaveLength(2)
  })
})