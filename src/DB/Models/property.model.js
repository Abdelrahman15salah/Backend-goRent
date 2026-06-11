import mongoose, {Schema} from "mongoose";

const propertySchema = new Schema(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["RESIDENTIAL", "COMMERCIAL"],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    pricePerMonth: {
      type: Number,
      required: true,
      min: 0,
    },
    squareFootage: {
      type: Number,
      required: true,
      min: 0,
    },
    images: {
      type: [String],
        publicId: String,
      default: [],
    },
    
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    specifications: {
      apartment: {
        bedrooms: { type: Number, default: null },
        bathrooms: { type: Number, default: null },
        hasElevator: { type: Boolean, default: null },
      },
      shop: {
        electricityCapacity: { type: Number, default: null },
        footTrafficTier: { type: String, default: null },
        commercialLicenseRequired: { type: Boolean, default: null },
      },
    },
  },
  {
    timestamps: true,
  },
);

propertySchema.index({ location: "2dsphere" });

const Property = mongoose.model("Property", propertySchema);
export default Property;
