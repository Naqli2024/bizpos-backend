const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const businessRoutes = require("./modules/business/business.routes");
const userRoutes = require("./modules/user/user.routes");
const inventoryRoutes = require("./modules/inventory/inventory.routes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "BizPOS API is running",
  });
});

app.use("/api/business", businessRoutes);
app.use("/api/users", userRoutes);
app.use("/api/inventory/products", inventoryRoutes);

module.exports = app;