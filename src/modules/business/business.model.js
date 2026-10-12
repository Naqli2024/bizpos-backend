const mongoose = require("mongoose");

const businessSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      default: "",
    },
    mobile: {
      type: String,
      required: true,
      trim: true,
    },
    otp: {
      type: String,
      select: false,
    },
    otpExpiresAt: {
      type: Date,
      select: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    gstNo: {
      type: String,
      default: "",
    },
    businessType: {
      type: String,
      default: "",
    },
    logo: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Business", businessSchema);
