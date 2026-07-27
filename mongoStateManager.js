import mongoose from 'mongoose';

// ─── State Schema ─────────────────────────────────────────────────────────[...]
const stateSchema = new mongoose.Schema({
  _id: { type: String, default: 'singleton' }, // Always use same document
  userWantsVC: { type: Boolean, default: false },
  bumpTimestamps: { type: Map, of: Number, default: new Map() },
  updatedAt: { type: Date, default: Date.now }
});

const StateModel = mongoose.model('State', stateSchema);

// ─── MongoDB State Manager ──────────────────────────────────────────────────
export class MongoStateManager {
  constructor(mongoUri) {
    this.mongoUri = mongoUri;
    this.connected = false;
  }

  /**
   * Connect to MongoDB
   */
  async connect() {
    try {
      if (!this.mongoUri) {
        throw new Error('MONGODB_URI not set in environment variables');
      }

      await mongoose.connect(this.mongoUri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
      });

      this.connected = true;
      console.log('[mongodb] ✅ Connected to MongoDB Atlas');
      return true;
    } catch (err) {
      console.error('[mongodb] ❌ Connection failed:', err.message);
      this.connected = false;
      return false;
    }
  }

  /**
   * Load state from MongoDB
   */
  async loadState() {
    try {
      if (!this.connected) {
        console.warn('[mongodb] Not connected, returning empty state');
        return {
          userWantsVC: false,
          bumpTimestamps: {},
        };
      }

      let doc = await StateModel.findById('singleton');

      // Create if doesn't exist
      if (!doc) {
        doc = await StateModel.create({
          _id: 'singleton',
          userWantsVC: false,
          bumpTimestamps: new Map(),
        });
        console.log('[mongodb] Created new state document');
      }

      // Convert Map back to object for easier use
      const state = doc.toObject();
      if (state.bumpTimestamps && typeof state.bumpTimestamps === 'object') {
        // bumpTimestamps is already an object, convert to proper format
        const timestamps = {};
        for (const [key, value] of Object.entries(state.bumpTimestamps)) {
          timestamps[key] = value;
        }
        state.bumpTimestamps = timestamps;
      }

      console.log('[mongodb] ✅ State loaded successfully');
      return state;
    } catch (err) {
      console.error('[mongodb] Error loading state:', err.message);
      return { userWantsVC: false, bumpTimestamps: {} };
    }
  }

  /**
   * Save state to MongoDB
   */
  async saveState(state) {
    try {
      if (!this.connected) {
        console.warn('[mongodb] Not connected, skipping save');
        return false;
      }

      const updateData = {
        userWantsVC: state.userWantsVC,
        updatedAt: new Date(),
      };

      // Save bump timestamps
      if (state.bumpTimestamps) {
        updateData.bumpTimestamps = state.bumpTimestamps;
      }

      await StateModel.findByIdAndUpdate(
        'singleton',
        updateData,
        { upsert: true, new: true }
      );

      console.log('[mongodb] ✅ State saved successfully');
      return true;
    } catch (err) {
      console.error('[mongodb] Error saving state:', err.message);
      return false;
    }
  }

  /**
   * Update specific field
   */
  async updateField(fieldName, value) {
    try {
      if (!this.connected) {
        console.warn('[mongodb] Not connected, skipping update');
        return false;
      }

      const updateData = { [fieldName]: value, updatedAt: new Date() };

      await StateModel.findByIdAndUpdate(
        'singleton',
        updateData,
        { upsert: true, new: true }
      );

      console.log(`[mongodb] ✅ Updated ${fieldName}`);
      return true;
    } catch (err) {
      console.error(`[mongodb] Error updating ${fieldName}:`, err.message);
      return false;
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect() {
    try {
      if (this.connected) {
        await mongoose.disconnect();
        this.connected = false;
        console.log('[mongodb] Disconnected');
      }
    } catch (err) {
      console.error('[mongodb] Disconnect error:', err.message);
    }
  }
}

export default MongoStateManager;
