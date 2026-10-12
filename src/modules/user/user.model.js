const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Business",
    required: true
  },

  username: {
    type: String,
    required: true
  },

  password: {
    type: String,
    required: true
  },

  role: {
    type: String,
    default: "admin"
  }

}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);