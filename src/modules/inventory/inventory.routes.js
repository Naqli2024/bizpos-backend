const express = require("express");
const authenticate = require("../../middlewares/auth.middleware");

const {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} = require("./inventory.controller");

const router = express.Router();

// All inventory endpoints require authentication
// and a verified business account.
router.use(authenticate);

router.post("/create", createProduct);
router.get("/get", getProducts);
router.get("/:id", getProductById);
router.put("/:id", updateProduct);
router.delete("/:id", deleteProduct);

module.exports = router;
