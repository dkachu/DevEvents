import { HydratedDocument, Model, Schema, model, models } from "mongoose"

interface EventDocumentShape {
  title: string
  slug: string
  description: string
  overview: string
  image: string
  venue: string
  location: string
  date: string
  time: string
  mode: string
  audience: string
  agenda: string[]
  organizer: string
  tags: string[]
  createdAt?: Date
  updatedAt?: Date
}

type EventDocument = HydratedDocument<EventDocumentShape>
type EventModel = Model<EventDocumentShape>

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

const normalizeText = (value: string, fieldName: string): string => {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`"${fieldName}" is required and cannot be empty`)
  }

  return trimmed
}

const normalizeTextArray = (values: string[], fieldName: string): string[] => {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`"${fieldName}" must contain at least one value`)
  }

  const normalized = values.map((entry) => normalizeText(entry, fieldName))
  if (normalized.length === 0) {
    throw new Error(`"${fieldName}" must contain at least one value`)
  }

  return normalized
}

const normalizeDateToIso = (value: string): string => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('"date" must be a valid date value')
  }

  return parsed.toISOString()
}

const normalizeTime = (value: string): string => {
  const trimmed = value.trim()
  const twentyFourHourMatch = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  if (twentyFourHourMatch) {
    const [, hour, minute] = twentyFourHourMatch
    return `${hour.padStart(2, "0")}:${minute}`
  }

  const twelveHourMatch = trimmed.match(
    /^(0?[1-9]|1[0-2]):([0-5]\d)\s*([aApP][mM])$/,
  )
  if (!twelveHourMatch) {
    throw new Error('"time" must be in HH:mm or h:mm AM/PM format')
  }

  const [, rawHour, minute, period] = twelveHourMatch
  let hour = Number(rawHour) % 12
  if (period.toLowerCase() === "pm") {
    hour += 12
  }

  return `${String(hour).padStart(2, "0")}:${minute}`
}

const eventSchema = new Schema<EventDocumentShape, EventModel>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true },
    description: { type: String, required: true, trim: true },
    overview: { type: String, required: true, trim: true },
    image: { type: String, required: true, trim: true },
    venue: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    date: { type: String, required: true, trim: true },
    time: { type: String, required: true, trim: true },
    mode: { type: String, required: true, trim: true },
    audience: { type: String, required: true, trim: true },
    agenda: { type: [String], required: true },
    organizer: { type: String, required: true, trim: true },
    tags: { type: [String], required: true },
  },
  {
    timestamps: true,
  },
)

eventSchema.index({ slug: 1 }, { unique: true })

eventSchema.pre("save", function (this: EventDocument) {
  // Keep core text fields normalized and reject whitespace-only values.
  this.title = normalizeText(this.title, "title")
  this.description = normalizeText(this.description, "description")
  this.overview = normalizeText(this.overview, "overview")
  this.image = normalizeText(this.image, "image")
  this.venue = normalizeText(this.venue, "venue")
  this.location = normalizeText(this.location, "location")
  this.mode = normalizeText(this.mode, "mode")
  this.audience = normalizeText(this.audience, "audience")
  this.organizer = normalizeText(this.organizer, "organizer")

  this.agenda = normalizeTextArray(this.agenda, "agenda")
  this.tags = normalizeTextArray(this.tags, "tags")

  // Regenerate slug only when title changes to keep URLs stable.
  if (this.isModified("title")) {
    const slug = toSlug(this.title)
    if (!slug) {
      throw new Error('"slug" could not be generated from title')
    }

    this.slug = slug
  }

  // Persist date/time in consistent formats for predictable querying.
  this.date = normalizeDateToIso(normalizeText(this.date, "date"))
  this.time = normalizeTime(normalizeText(this.time, "time"))
})

export const Event =
  (models.Event as EventModel) ||
  model<EventDocumentShape, EventModel>("Event", eventSchema)
