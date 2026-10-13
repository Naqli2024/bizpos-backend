const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema(
  {
    size: { type: String, trim: true, default: "" },
    color: { type: String, trim: true, default: "" },
    model: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    productName: {
      type: String,
      required: true,
      trim: true,
    },

    barcode: {
      type: String,
      trim: true,
      set: (value) => {
        if (typeof value !== "string") return value;
        return value.trim() || undefined;
      },
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    brand: {
      type: String,
      trim: true,
      default: "",
    },

    variant: {
      type: variantSchema,
      default: () => ({}),
    },

    mrp: {
      type: Number,
      min: 0,
    },

    // Selling price includes GST.
    sellingPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    purchasePrice: {
      type: Number,
      min: 0,
    },

    // GST rate as a percentage, e.g. 5, 12, 18.
    gstRate: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },

    // HSN classification code.
    hsnCode: {
      type: String,
      trim: true,
      default: "",
    },

    // GST treatment of the product.
    taxType: {
      type: String,
      enum: ["taxable", "exempt", "non_gst"],
      default: "taxable",
      required: true,
      lowercase: true,
      trim: true,
    },

    stockQty: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    unit: {
      type: String,
      trim: true,
      default: "pcs",
    },

    lowStockAlertQty: {
      type: Number,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// A barcode may exist in different businesses,
// but only once within the same business.
productSchema.index(
  { businessId: 1, barcode: 1 },
  {
    unique: true,
    partialFilterExpression: {
      barcode: { $type: "string" },
    },
  }
);

// Useful for business-specific inventory listing.
productSchema.index({
  businessId: 1,
  isActive: 1,
  productName: 1,
});

module.exports = mongoose.model("Product", productSchema);