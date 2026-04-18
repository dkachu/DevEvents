import mongoose from "mongoose"

const MONGODB_URI = process.env.MONGODB_URI

// Fail fast when the database URI is missing from the environment.
if (!MONGODB_URI) {
  throw new Error("Missing MONGODB_URI environment variable")
}

type MongooseCache = {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

// Reuse a single cached connection across hot reloads in development.
const globalWithMongoose = globalThis as typeof globalThis & {
  mongooseCache?: MongooseCache
}

const cached = globalWithMongoose.mongooseCache ?? {
  conn: null,
  promise: null,
}

if (!globalWithMongoose.mongooseCache) {
  globalWithMongoose.mongooseCache = cached
}

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn
  }

  if (!cached.promise) {
    // Surface connection failures quickly instead of buffering commands.
    const options: mongoose.ConnectOptions = { bufferCommands: false }
    cached.promise = mongoose.connect(MONGODB_URI, options)
  }

  try {
    cached.conn = await cached.promise
  } catch (error) {
    // Allow retries if the initial connection attempt fails.
    cached.promise = null
    throw error
  }

  return cached.conn
}

export default connectToDatabase
