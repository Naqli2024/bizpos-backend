const express = require("express");
const router = express.Router();
const authenticate = require("../../middlewares/auth.middleware");
const {
  createBusiness,
  verifyMobile,
  updateBusiness,
  getBusinessDetailsById
} = require("./business.controller");

router.post("/register", createBusiness);
router.post("/verify-mobile", verifyMobile);
router.put("/update", authenticate, updateBusiness);
router.get("/business-details", authenticate, getBusinessDetailsById);

module.exports = router;