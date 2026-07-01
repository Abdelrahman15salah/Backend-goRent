import mongoose from "mongoose";
const reviewSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      default: null,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, 
    },
    targetType: {
      type: String,
      enum: ["PROPERTY", "TENANT", "OWNER"],
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: "قيمة التقييم المدخلة غير صحيحة.",
      },
    },
    comment: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true, 
  },
);

reviewSchema.index(
  { propertyId: 1, createdAt: -1 },
  { partialFilterExpression: { propertyId: { $exists: true, $ne: null } } },
);

reviewSchema.index(
  { targetUserId: 1, createdAt: -1 },
  { partialFilterExpression: { targetUserId: { $exists: true, $ne: null } } },
);

reviewSchema.index(
  { authorId: 1, propertyId: 1 },
  {
    unique: true,
    partialFilterExpression: { propertyId: { $exists: true, $ne: null } },
  },
);
reviewSchema.index(
  { authorId: 1, targetUserId: 1 },
  {
    unique: true,
    partialFilterExpression: { targetUserId: { $exists: true, $ne: null } },
  },
);

const Review = mongoose.model("Review", reviewSchema);

export default Review;
