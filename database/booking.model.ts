import { HydratedDocument, Model, Schema, Types, model, models } from "mongoose"

import { Event } from "./event.model"

interface BookingDocumentShape {
  eventId: Types.ObjectId
  email: string
  createdAt?: Date
  updatedAt?: Date
}

type BookingDocument = HydratedDocument<BookingDocumentShape>
type BookingModel = Model<BookingDocumentShape>

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const normalizeEmail = (value: string): string => {
  const normalized = value.trim().toLowerCase()
  if (!EMAIL_REGEX.test(normalized)) {
    throw new Error('"email" must be a valid email address')
  }

  return normalized
}

const bookingSchema = new Schema<BookingDocumentShape, BookingModel>(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: EMAIL_REGEX,
    },
  },
  {
    timestamps: true,
  },
)

bookingSchema.index({ eventId: 1 })

bookingSchema.pre("save", async function (this: BookingDocument) {
  // Normalize and validate email before persisting.
  this.email = normalizeEmail(this.email)

  // Ensure a booking always points to a real event document.
  if (this.isNew || this.isModified("eventId")) {
    const eventExists = await Event.exists({ _id: this.eventId })
    if (!eventExists) {
      throw new Error("Referenced event does not exist")
    }
  }
})

export const Booking =
  (models.Booking as BookingModel) ||
  model<BookingDocumentShape, BookingModel>("Booking", bookingSchema)
