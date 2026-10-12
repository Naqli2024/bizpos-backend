const jwt = require("jsonwebtoken");
const Business = require("../modules/business/business.model");

const authenticate = async (req, res, next) => {
  try {
    // 1. Get JWT from the login cookie
    const token = req.cookies?.bizpos_token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Please log in to continue",
      });
    }

    // 2. Verify JWT
    const decoded = jwt.verify(token, process.env.JSON_WEB_TOKEN);

    if (!decoded.businessId || !decoded.adminId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
      });
    }

    // 3. Check the business account in the database
    const business = await Business.findById(decoded.businessId)
      .select("isVerified");

    if (!business) {
      return res.status(401).json({
        success: false,
        message: "Business account not found",
      });
    }

    // 4. Require business verification for all protected APIs
    if (!business.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your business mobile number to access this API",
        verificationRequired: true,
      });
    }

    // 5. Set authenticated user details
    req.user = {
      businessId: decoded.businessId,
      adminId: decoded.adminId,
    };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again.",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid access token",
      });
    }

    console.error("Authentication error:", error);

    return res.status(500).json({
      success: false,
      message: "Authentication failed",
    });
  }
};


module.exports = authenticate;
