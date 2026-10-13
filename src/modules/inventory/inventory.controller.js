const mongoose = require("mongoose");
const Product = require("./product.model");

// Fields clients are allowed to create or update.
const editableFields = [
  "productName",
  "barcode",
  "category",
  "brand",
  "variant",
  "mrp",
  "sellingPrice",
  "purchasePrice",
  "stockQty",
  "unit",
  "lowStockAlertQty",

  // New GST fields
  "gstRate",
  "hsnCode",
  "taxType",
];

const numericFields = [
  "mrp",
  "sellingPrice",
  "purchasePrice",
  "stockQty",
  "lowStockAlertQty",
  "gstRate",
];

const sendError = (res, status, message) =>
  res.status(status).json({
    success: false,
    message,
  });

const handleDatabaseError = (res, error) => {
  if (error.code === 11000) {
    return sendError(
      res,
      409,
      "A product with this barcode already exists in your inventory",
    );
  }

  if (error.name === "ValidationError" || error.name === "CastError") {
    return sendError(res, 400, error.message);
  }

  console.error("Inventory error:", error);

  return sendError(res, 500, "Internal server error");
};

// Copy only supported fields. Never accept businessId from the client.
const pickEditableFields = (body) => {
  const data = {};

  for (const field of editableFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      data[field] = body[field];
    }
  }

  return data;
};

const normalizeProductData = (data) => {
  // Normalize string fields.
  for (const field of [
    "productName",
    "category",
    "brand",
    "unit",
    "hsnCode",
  ]) {
    if (typeof data[field] === "string") {
      data[field] = data[field].trim();
    }
  }

  // Normalize barcode.
  if (typeof data.barcode === "string") {
    data.barcode = data.barcode.trim() || null;
  }

  // Validate and normalize variant.
  if (data.variant !== undefined) {
    if (
      !data.variant ||
      typeof data.variant !== "object" ||
      Array.isArray(data.variant)
    ) {
      throw new Error("Variant must be an object");
    }

    const allowedVariantFields = ["size", "color", "model"];

    for (const field of Object.keys(data.variant)) {
      if (!allowedVariantFields.includes(field)) {
        throw new Error(`Unsupported variant field: ${field}`);
      }

      if (typeof data.variant[field] !== "string") {
        throw new Error(`Variant ${field} must be a string`);
      }

      data.variant[field] = data.variant[field].trim();
    }
  }

  // Normalize tax type.
  if (typeof data.taxType === "string") {
    data.taxType = data.taxType.trim().toLowerCase();
  }

  // Convert and validate numeric fields.
  for (const field of numericFields) {
    if (data[field] === undefined) continue;

    if (data[field] === null || data[field] === "") {
      throw new Error(`${field} must be a valid number`);
    }

    const value = Number(data[field]);

    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${field} must be a non-negative number`);
    }

    data[field] = value;
  }

  // Validate GST rate.
  if (
    data.gstRate !== undefined &&
    data.gstRate > 100
  ) {
    throw new Error("GST rate must be between 0 and 100");
  }

  // Validate tax classification.
  if (
    data.taxType !== undefined &&
    !["taxable", "exempt", "non_gst"].includes(data.taxType)
  ) {
    throw new Error(
      "Tax type must be taxable, exempt, or non_gst"
    );
  }

  // Exempt and non-GST products must have a zero GST rate
  // whenever both fields are supplied.
  if (
    ["exempt", "non_gst"].includes(data.taxType) &&
    data.gstRate !== undefined &&
    data.gstRate !== 0
  ) {
    throw new Error(
      "GST rate must be 0 for exempt or non-GST products"
    );
  }

  return data;
};

const validateRequiredFields = (data) => {
  if (typeof data.productName !== "string" || !data.productName.trim()) {
    throw new Error("Product name is required");
  }

  if (typeof data.category !== "string" || !data.category.trim()) {
    throw new Error("Category is required");
  }

  if (data.sellingPrice === undefined || data.sellingPrice === null) {
    throw new Error("Selling price is required");
  }

  if (data.stockQty === undefined || data.stockQty === null) {
    throw new Error("Stock quantity is required");
  }
};

// Escape user input before using it in a regular expression.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// POST /api/inventory/products
exports.createProduct = async (req, res) => {
  try {
    const data = normalizeProductData(pickEditableFields(req.body));

    validateRequiredFields(data);

    // Check for duplicate barcode first.
    if (data.barcode) {
      const barcodeExists = await Product.exists({
        businessId: req.user.businessId,
        barcode: data.barcode,
        isActive: true,
      });

      if (barcodeExists) {
        return sendError(
          res,
          409,
          "This barcode already exists in your inventory",
        );
      }
    }

    // Check for duplicate product name and variant.
    const duplicateFilter = {
      businessId: req.user.businessId,
      productName: {
        $regex: `^${escapeRegex(data.productName)}$`,
        $options: "i",
      },
      "variant.size": data.variant?.size || "",
      "variant.color": data.variant?.color || "",
      "variant.model": data.variant?.model || "",
      isActive: true,
    };

    const duplicateExists = await Product.exists(duplicateFilter);

    if (duplicateExists) {
      return sendError(
        res,
        409,
        "This product with the same variant already exists in your inventory",
      );
    }

    const product = await Product.create({
      ...data,
      businessId: req.user.businessId,
    });

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product,
    });
  } catch (error) {
    if (
      error.message &&
      (error.message.includes("required") ||
        error.message.includes("must be") ||
        error.message.includes("Unsupported variant"))
    ) {
      return sendError(res, 400, error.message);
    }

    return handleDatabaseError(res, error);
  }
};

// GET /api/inventory/products
exports.getProducts = async (req, res) => {
  try {
    const {
      search = "",
      category,
      page = "1",
      limit = "20",
      lowStock,
    } = req.query;

    const pageNumber = Number(page);
    const pageSize = Number(limit);

    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      return sendError(
        res,
        400,
        "Page must be positive and limit must be between 1 and 100",
      );
    }

    const filter = {
      businessId: req.user.businessId,
      isActive: true,
    };

    if (typeof category === "string" && category.trim()) {
      filter.category = category.trim();
    }

    if (typeof search === "string" && search.trim()) {
      const searchRegex = new RegExp(escapeRegex(search.trim()), "i");

      filter.$or = [
        { productName: searchRegex },
        { barcode: searchRegex },
        { brand: searchRegex },
      ];
    }

    if (lowStock === "true") {
      filter.lowStockAlertQty = { $exists: true, $ne: null };
      filter.$expr = {
        $lte: ["$stockQty", "$lowStockAlertQty"],
      };
    } else if (lowStock !== undefined && lowStock !== "false") {
      return sendError(res, 400, "lowStock must be true or false");
    }

    const skip = (pageNumber - 1) * pageSize;

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),

      Product.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: products.length,
      pagination: {
        total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
      data: products,
    });
  } catch (error) {
    return handleDatabaseError(res, error);
  }
};

// GET /api/inventory/products/:id
exports.getProductById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid product ID");
    }

    const product = await Product.findOne({
      _id: req.params.id,
      businessId: req.user.businessId,
      isActive: true,
    });

    if (!product) {
      return sendError(res, 404, "Product not found");
    }

    return res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    return handleDatabaseError(res, error);
  }
};

// PUT /api/inventory/products/:id
exports.updateProduct = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid product ID");
    }

    const data = normalizeProductData(pickEditableFields(req.body));

    if (Object.keys(data).length === 0) {
      return sendError(res, 400, "Provide at least one editable product field");
    }

    const product = await Product.findOneAndUpdate(
      {
        _id: req.params.id,
        businessId: req.user.businessId,
        isActive: true,
      },
      { $set: data },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!product) {
      return sendError(res, 404, "Product not found");
    }

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: product,
    });
  } catch (error) {
    if (
      error.message &&
      (error.message.includes("must be") ||
        error.message.includes("Unsupported variant"))
    ) {
      return sendError(res, 400, error.message);
    }

    return handleDatabaseError(res, error);
  }
};

// DELETE /api/inventory/products/:id
// Soft delete: preserve the product for historical transactions.
exports.deleteProduct = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid product ID");
    }

    const product = await Product.findOneAndUpdate(
      {
        _id: req.params.id,
        businessId: req.user.businessId,
        isActive: true,
      },
      { $set: { isActive: false } },
      { new: true },
    );

    if (!product) {
      return sendError(res, 404, "Product not found");
    }

    return res.status(200).json({
      success: true,
      message: "Product deactivated successfully",
    });
  } catch (error) {
    return handleDatabaseError(res, error);
  }
};
